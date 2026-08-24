"""As checagens que substituíram parte do avaliador clínico.

Dois dos seis critérios do juiz eram conta, não juízo: contar dias e conferir
equipamento. Aqui elas são testadas como código, o que é mais barato e mais
previsível do que um parecer de modelo.
"""

import json

from agent.models import CatalogExercise, WorkoutGenerationInput
from agent.validate import aderencia_errors, estrutura_errors

HALTER = CatalogExercise(id="ex-1", name="Supino com halteres", equipment="dumbbell")
MAQUINA = CatalogExercise(id="ex-2", name="Leg press", equipment="machine")


def plano(dias, fases=("ALONGAMENTO", "TREINO"), exercicios=("ex-1",), duracao=None):
    def fase(t):
        return {"type": t, "exercises": [{"exerciseId": e, "subtype": "STRENGTH"} for e in exercicios]}

    return json.dumps(
        {
            "status": "GENERATED",
            "days": [
                {
                    "dayOfWeek": d,
                    "dayType": "WORKOUT",
                    "workout": {
                        "name": "Treino",
                        "phases": [fase(t) for t in fases],
                        **({"estimatedDuration": duracao} if duracao else {}),
                    },
                }
                for d in dias
            ],
        }
    )


def entrada(**c):
    return WorkoutGenerationInput(allowed_exercises=[HALTER, MAQUINA], constraints=c)


def test_mais_treinos_do_que_dias_disponiveis():
    erros = aderencia_errors(plano(["MONDAY", "TUESDAY", "WEDNESDAY"]), entrada(dias_disponiveis=[1, 3]))
    assert any(e.startswith("dias_acima_do_disponivel") for e in erros)


def test_dentro_do_disponivel_passa():
    assert aderencia_errors(plano(["MONDAY", "TUESDAY"]), entrada(dias_disponiveis=[1, 3])) == []


def test_maquina_para_quem_treina_em_casa():
    erros = aderencia_errors(plano(["MONDAY"], exercicios=("ex-2",)), entrada(local="casa"))
    assert any("equipamento_indisponivel" in e for e in erros)


def test_a_mesma_maquina_na_academia_passa():
    assert aderencia_errors(plano(["MONDAY"], exercicios=("ex-2",)), entrada(local="academia")) == []


def test_sessao_muito_mais_longa_que_o_limite():
    erros = aderencia_errors(plano(["MONDAY"], duracao=100), entrada(minutos_por_sessao=45))
    assert any("sessao_longa_demais" in e for e in erros)


def test_folga_de_meia_hora_nao_acusa():
    # 60 para um limite de 45 é a folga aceita: quem disse 45 não some da
    # academia aos 46 minutos.
    assert aderencia_errors(plano(["MONDAY"], duracao=60), entrada(minutos_por_sessao=45)) == []


def test_sessao_sem_preparo():
    erros = estrutura_errors(plano(["MONDAY"], fases=("TREINO",)))
    assert erros == ["sessao_sem_preparo: MONDAY"]


def test_sessao_so_com_alongamento_nao_tem_parte_principal():
    erros = estrutura_errors(plano(["MONDAY"], fases=("ALONGAMENTO",)))
    assert erros == ["sessao_sem_parte_principal: MONDAY"]


def test_sessao_completa_passa():
    assert estrutura_errors(plano(["MONDAY"], fases=("ALONGAMENTO", "CARDIO"))) == []


def test_json_quebrado_nao_derruba_a_checagem():
    assert aderencia_errors("{quebrado", entrada()) == []
    assert estrutura_errors("{quebrado") == []
