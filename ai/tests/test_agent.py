"""Testes do agente de prescrição.

Nenhum deles chama a Anthropic. O que se testa aqui são justamente as camadas
que existem para NÃO depender do modelo: a validação determinística, a
recuperação garantida de referência clínica e os hard gates do avaliador.

É deliberado. Um teste que dependesse da geração testaria o modelo, não o
código — e passaria ou falharia por razões que este repositório não controla.
"""

from __future__ import annotations

import json

import pytest

from agent.knowledge import gather_knowledge, select_references
from agent.models import CatalogExercise, WorkoutGenerationInput
from agent.validate import catalog_errors, validate_plan
from grader.criteria import load_criteria
from grader.score import combine

CATALOG = [
    CatalogExercise(id="ex-1", name="Leg Press", muscle_group="QUADRICEPS"),
    CatalogExercise(id="ex-2", name="Remada na Máquina", muscle_group="COSTAS"),
]

ALL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]


def _input(**kwargs) -> WorkoutGenerationInput:
    return WorkoutGenerationInput(allowed_exercises=CATALOG, **kwargs)


def _plan(days: list[dict], **extra) -> str:
    return json.dumps({"status": "GENERATED", "days": days, **extra})


def _workout_day(day: str, exercise_id: str = "ex-1") -> dict:
    return {
        "dayOfWeek": day,
        "dayType": "WORKOUT",
        "workout": {
            "name": "Treino A",
            "phases": [
                {
                    "type": "TREINO",
                    "exercises": [{"exerciseId": exercise_id, "subtype": "STRENGTH"}],
                }
            ],
        },
    }


def _off_day(day: str) -> dict:
    return {"dayOfWeek": day, "dayType": "OFF"}


def _full_week(exercise_id: str = "ex-1") -> list[dict]:
    return [_workout_day(ALL_DAYS[0], exercise_id)] + [_off_day(d) for d in ALL_DAYS[1:]]


# ---------------------------------------------------------------------------
# Catálogo fechado
# ---------------------------------------------------------------------------


def test_plano_valido_passa():
    assert validate_plan(_plan(_full_week()), _input()) == []


def test_exercicio_fora_do_catalogo_bloqueia():
    """A regra inteira do produto. Um id inventado não pode virar treino."""
    errors = validate_plan(_plan(_full_week("id-alucinado")), _input())
    assert any(e.startswith("exercicio_fora_do_catalogo") for e in errors)
    # E precisa ser reconhecido como erro MECÂNICO, para o pipeline re-gerar com
    # correção em vez de gastar o avaliador num plano que já se sabe inválido.
    assert catalog_errors(errors)


def test_used_ids_tambem_sao_checados():
    plan = _plan(_full_week(), used_exercise_ids=["ex-1", "fantasma"])
    errors = validate_plan(plan, _input())
    assert any(e.startswith("used_id_fora_do_catalogo") for e in errors)


def test_erro_estrutural_nao_e_reprocessavel():
    """Estrutura quebrada não é id alucinado: re-gerar não é a resposta."""
    errors = validate_plan(_plan([_workout_day("SEGUNDA")]), _input())
    assert errors
    assert catalog_errors(errors) == []


# ---------------------------------------------------------------------------
# Estrutura
# ---------------------------------------------------------------------------


def test_json_invalido():
    assert validate_plan("isto não é json", _input())[0].startswith("json_invalido")


def test_semana_incompleta_bloqueia():
    """Cada dia vira uma linha única por (plano, dia). Faltar dia quebra o plano."""
    errors = validate_plan(_plan([_workout_day("MONDAY")]), _input())
    assert any(e.startswith("dias_faltando") for e in errors)


def test_dia_repetido_bloqueia():
    days = _full_week() + [_workout_day("MONDAY")]
    errors = validate_plan(_plan(days), _input())
    assert any(e.startswith("dayOfWeek_duplicado") for e in errors)


def test_treino_sem_fase_bloqueia():
    day = {"dayOfWeek": "MONDAY", "dayType": "WORKOUT", "workout": {"name": "Vazio", "phases": []}}
    errors = validate_plan(_plan([day] + [_off_day(d) for d in ALL_DAYS[1:]]), _input())
    assert any(e.startswith("workout_sem_fases") for e in errors)


def test_subtype_invalido_bloqueia():
    day = _workout_day("MONDAY")
    day["workout"]["phases"][0]["exercises"][0]["subtype"] = "CARDIOZINHO"
    errors = validate_plan(_plan([day] + [_off_day(d) for d in ALL_DAYS[1:]]), _input())
    assert any(e.startswith("subtype_invalido") for e in errors)


# ---------------------------------------------------------------------------
# Encaminhamento
# ---------------------------------------------------------------------------


def test_encaminhamento_e_saida_valida():
    plan = json.dumps(
        {"status": "REFERRAL", "referral_reason": "Procure um cardiologista.", "days": []}
    )
    assert validate_plan(plan, _input()) == []


def test_encaminhamento_sem_motivo_bloqueia():
    plan = json.dumps({"status": "REFERRAL", "referral_reason": None, "days": []})
    assert "referral_sem_motivo" in validate_plan(plan, _input())


def test_encaminhamento_com_dias_bloqueia():
    """Encaminhar e prescrever ao mesmo tempo é contradição, não meio-termo."""
    plan = json.dumps(
        {"status": "REFERRAL", "referral_reason": "Avaliação médica.", "days": _full_week()}
    )
    assert "referral_com_dias" in validate_plan(plan, _input())


# ---------------------------------------------------------------------------
# Recuperação de conhecimento
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "flag,expected",
    [
        ("cardiopata", "condicao-cardiopatas"),
        ("gestante", "publico-gestantes"),
        ("glp1", "condicao-glp1-ozempic"),
        ("diabetico", "condicao-diabeticos"),
        ("lesao-ortopedica", "condicao-patologias-ortopedicas"),
        ("idoso", "publico-idosos"),
    ],
)
def test_flag_clinica_sempre_traz_a_referencia(flag: str, expected: str):
    """O ponto inteiro da camada determinística.

    A referência de cardiopatas não pode depender de um recuperador achar que
    ela é relevante. Se este teste falhar, alguém trocou a garantia por
    similaridade.
    """
    assert expected in select_references(_input(flags=[flag]))


def test_fundamentos_sempre_presentes():
    assert "fundamentos-prescricao" in select_references(_input())


def test_referencias_existem_em_disco():
    """Um mapeamento apontando para arquivo inexistente falha em silêncio."""
    blocks = gather_knowledge(_input(flags=["cardiopata"], profile={"objetivo": "emagrecimento"}))
    assert len(blocks) == 3
    assert any("condicao-cardiopatas" in b for b in blocks)


def test_duas_modalidades_trazem_o_orquestrador():
    refs = select_references(_input(profile={"modalidades": ["musculação", "corrida"]}))
    assert "multiatividade-orquestrador" in refs


def test_referencias_nao_repetem():
    refs = select_references(_input(flags=["cardiopata", "arritmia", "pos-iam"]))
    assert len(refs) == len(set(refs))


# ---------------------------------------------------------------------------
# Hard gates do avaliador
# ---------------------------------------------------------------------------


def _judge(scores: dict[str, int]) -> dict:
    return {"criterios": [{"name": k, "score": v, "reason": ""} for k, v in scores.items()]}


def _all_good() -> dict[str, int]:
    return {c.name: 10 for c in load_criteria().judges}


def test_seguranca_baixa_zera_o_veredito():
    """A média não compensa segurança clínica. É por isso que o gate existe."""
    scores = _all_good()
    scores["seguranca_clinica"] = 4
    result = combine(judge_result=_judge(scores), checks=[], criteria=load_criteria())
    assert result["score"] == 0.0
    assert any(f["name"] == "seguranca_clinica" for f in result["hard_failures"])


def test_criterio_de_gate_ausente_tambem_reprova():
    """Não avaliado não é aprovado.

    Um veredito truncado que perdesse a linha de segurança passaria como se
    tivesse sido julgado — que é exatamente o modo silencioso de falhar.
    """
    scores = _all_good()
    del scores["seguranca_clinica"]
    result = combine(judge_result=_judge(scores), checks=[], criteria=load_criteria())
    assert result["score"] == 0.0
    assert any(f["type"] == "judge_missing" for f in result["hard_failures"])


def test_check_hard_reprovado_zera():
    check = {"name": "estrutura_plano_json", "passed": False, "penalty": 3.0, "hard": True}
    result = combine(judge_result=_judge(_all_good()), checks=[check], criteria=load_criteria())
    assert result["score"] == 0.0


def test_plano_bom_passa_do_minimo():
    criteria = load_criteria()
    result = combine(judge_result=_judge(_all_good()), checks=[], criteria=criteria)
    assert result["hard_failures"] == []
    assert result["score"] >= criteria.min_score
