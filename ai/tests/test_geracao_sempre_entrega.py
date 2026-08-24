"""A regra do produto: SEMPRE sai um treino.

Decisão da fundadora (ago/2026), depois de duas anamneses que não viraram plano.
Quem responde a anamnese inteira não pode receber "não foi possível gerar" —
recebe um plano, mais conservador se for o caso, com o motivo escrito.

Este arquivo percorre cada modo de falha OBSERVADO em produção e cada um que a
pilha ainda permite, e cobra a entrega em todos. A única exceção legítima está
no fim: não existe plano quando não há JSON nenhum para mostrar.

Cada cenário fixa o desfecho E o custo — quantas chamadas de modelo foram
gastas —, porque foi o custo que estourou o teto do backend na primeira versão
desta regra.
"""

from __future__ import annotations

import json

import pytest

import agent.pipeline as pipeline
from agent.models import WorkoutGenerationInput
from core.settings import settings

CATALOGO = [
    {"id": "e-supino", "name": "Supino reto", "muscle_group": "peito", "type": "STRENGTH"},
    {"id": "e-remada", "name": "Remada curvada", "muscle_group": "costas", "type": "STRENGTH"},
    {"id": "e-corrida", "name": "Corrida leve", "muscle_group": "cardio", "type": "CARDIO"},
]

DIAS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]


def _dia(dia: str, ids: list[str], subtype: str = "STRENGTH") -> dict:
    return {
        "dayOfWeek": dia,
        "dayType": "WORKOUT",
        "workout": {
            "name": f"Treino {dia}",
            # Com a fase de preparo, como um plano real: desde 24/08/2026 a
            # ausência dela vira ressalva na entrega, e um plano de teste sem
            # aquecimento testaria o aviso, não o cenário.
            "phases": [
                {
                    "type": "ALONGAMENTO",
                    "exercises": [{"exerciseId": ids[0], "subtype": "MOBILITY", "sets": 1}],
                },
                {
                    "type": "TREINO",
                    "exercises": [
                        {"exerciseId": i, "subtype": subtype, "sets": 3, "reps": "10"}
                        for i in ids
                    ],
                },
            ],
        },
    }


def _plano(exercicios_por_dia: list[str] | None = None, subtype: str = "STRENGTH") -> str:
    """Um plano completo e VÁLIDO pelo validador de verdade."""
    ids = exercicios_por_dia or ["e-supino"]
    return json.dumps(
        {"status": "GENERATED", "days": [_dia(d, ids, subtype) for d in DIAS]}
    )


APROVA = {"score": 8.0, "hard_failures": [], "judges": [], "checks": []}
REPROVA = {
    "score": 0.0,
    "hard_failures": [{"type": "judge", "name": "seguranca_clinica", "score": 5.0, "min": 7.0}],
    "judges": [
        {
            "name": "seguranca_clinica",
            "score": 5.0,
            "reason": "Volume alto para quem está voltando. Reduza as séries.",
        }
    ],
    "checks": [],
}

#: Com flag clínica, porque estes cenários exercitam o avaliador. O caminho
#: sem flag, que é o da maioria das pessoas, está em `test_fluxo_simples.py`.
ENTRADA = WorkoutGenerationInput(
    knowledge=["ref"], allowed_exercises=CATALOGO, flags=["cardiopata"]
)


def _monta(monkeypatch, saidas: list[str], vereditos: list[dict], validacoes=None):
    """Enfileira o que o modelo devolve e o que o avaliador responde.

    `validacoes` permite forçar erros de validação por tentativa; `None` usa a
    validação de verdade, que é o que torna os cenários de catálogo e de JSON
    honestos em vez de encenados.
    """
    geracoes: list[str | None] = []
    avaliacoes: list[dict] = []

    async def gerar(inp, correction=None):
        geracoes.append(correction)
        return saidas[min(len(geracoes) - 1, len(saidas) - 1)]

    async def avaliar(**kwargs):
        veredito = vereditos[min(len(avaliacoes), len(vereditos) - 1)]
        avaliacoes.append(veredito)
        return dict(veredito)

    monkeypatch.setattr(pipeline, "generate_plan", gerar)
    monkeypatch.setattr(pipeline, "grade", avaliar)
    if validacoes is not None:
        chamadas = {"n": 0}

        def validar(plan, inp):
            i = min(chamadas["n"], len(validacoes) - 1)
            chamadas["n"] += 1
            return list(validacoes[i])

        monkeypatch.setattr(pipeline, "validate_plan", validar)
    return geracoes, avaliacoes


# ---------------------------------------------------------------------------
# O caminho feliz, para as outras medidas terem referência de custo.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_aprovado_de_primeira_gasta_uma_geracao(monkeypatch):
    geracoes, avaliacoes = _monta(monkeypatch, [_plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert not r.revision_notes
    assert len(geracoes) == 1 and len(avaliacoes) == 1


# ---------------------------------------------------------------------------
# Falhas de FORMA — foi o que bloqueou a primeira anamnese em produção.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_json_truncado_se_recupera(monkeypatch):
    """O caso real: saída cortada no limite de tokens, JSON pela metade."""
    cortado = _plano()[:120]  # começa com `{` e não fecha
    geracoes, _ = _monta(monkeypatch, [cortado, _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    # A correção precisa falar de TAMANHO, não de vírgula: pedir "arrume o
    # JSON" produziria outro plano do mesmo tamanho e outro corte.
    assert "MAIS ENXUTO" in geracoes[1] or "MINIMO" in geracoes[1]


@pytest.mark.anyio
async def test_json_malformado_se_recupera(monkeypatch):
    quebrado = '{"status": "GENERATED", "days": [ {,, ] }'
    geracoes, _ = _monta(monkeypatch, [quebrado, _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert "JSON valido" in geracoes[1] or "MINIMO" in geracoes[1]


@pytest.mark.anyio
async def test_texto_que_nunca_foi_json_nao_vira_pedido_de_encurtar(monkeypatch):
    """Lixo não é truncamento: mandar encurtar um plano que não existe é inútil."""
    geracoes, _ = _monta(monkeypatch, ["desculpe, não posso ajudar", _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert "MAIS ENXUTO" not in geracoes[1]


@pytest.mark.anyio
async def test_ultima_tentativa_pede_plano_minimo(monkeypatch):
    """Insistir na instrução que já falhou duas vezes tende a falhar de novo."""
    monkeypatch.setattr(settings, "max_catalog_retries", 2)
    cortado = _plano()[:120]
    geracoes, _ = _monta(monkeypatch, [cortado, cortado, _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert "MINIMO" in geracoes[-1]


# ---------------------------------------------------------------------------
# Catálogo — o modelo inventa um id que não existe.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_id_inventado_se_recupera_na_segunda(monkeypatch):
    geracoes, _ = _monta(monkeypatch, [_plano(["e-inexistente"]), _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert "FORA do catalogo" in geracoes[1]


@pytest.mark.anyio
async def test_id_inventado_teimoso_vira_substituicao(monkeypatch):
    """O modelo insiste no erro — e ainda assim sai treino.

    Regenerar de novo custaria mais uma geração inteira para provavelmente
    repetir o mesmo id. O resto do plano está correto, então o id vira um
    exercício real do mesmo tipo e a troca fica registrada.
    """
    monkeypatch.setattr(settings, "max_catalog_retries", 2)
    geracoes, _ = _monta(monkeypatch, [_plano(["e-inexistente"])], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    assert r.revision_notes, "a troca precisa aparecer para a pessoa"
    assert any("trocado" in n for n in r.revision_notes)
    # E o plano entregue não pode mais citar o id inventado.
    assert "e-inexistente" not in r.plan


@pytest.mark.anyio
async def test_sem_substituto_do_mesmo_tipo_o_exercicio_e_removido(monkeypatch):
    """Sem candidato, remove — não inventa.

    Um dia com um exercício a menos é honesto; um dia com um exercício que
    ninguém prescreveu, não.
    """
    monkeypatch.setattr(settings, "max_catalog_retries", 1)
    # MOBILITY não existe no catálogo do teste: não há substituto possível.
    plano = _plano(["e-fantasma"], subtype="MOBILITY")
    _monta(monkeypatch, [plano], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert any("removido" in n for n in r.revision_notes)
    assert "e-fantasma" not in r.plan


# ---------------------------------------------------------------------------
# Avaliador — reprovar deixou de matar o plano.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reprovado_uma_vez_e_revisado_e_aprovado(monkeypatch):
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    geracoes, avaliacoes = _monta(monkeypatch, [_plano()], [REPROVA, APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked
    # Revisado a partir do PARECER, não do zero.
    assert "Revisao obrigatoria" in geracoes[1]
    assert "Volume alto" in geracoes[1]
    # Aprovado na revisão não deixa ressalva: não sobrou objeção.
    assert not r.revision_notes


@pytest.mark.anyio
async def test_reprovado_sempre_entrega_com_ressalvas(monkeypatch):
    """O pior caso do avaliador — e ainda assim sai treino."""
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    _monta(monkeypatch, [_plano()], [REPROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked, "reprovar não pode mais devolver as mãos abanando"
    assert r.revision_notes
    assert "Volume alto" in r.revision_notes[0]


@pytest.mark.anyio
async def test_revisao_tem_teto(monkeypatch):
    """Revisar sem limite gastaria a geração inteira num perfil impossível."""
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    geracoes, _ = _monta(monkeypatch, [_plano()], [REPROVA])
    await pipeline.run_agent(ENTRADA)
    # 1 geração + 2 revisões, e nada além disso.
    assert len(geracoes) == 3


# ---------------------------------------------------------------------------
# Erro estrutural — dia repetido, dia faltando.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_semana_incompleta_e_revisada(monkeypatch):
    """Falha estrutural é corrigível: o gerador recebe o apontamento."""
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    incompleto = json.dumps({"status": "GENERATED", "days": [_dia("MONDAY", ["e-supino"])]})
    _monta(monkeypatch, [incompleto, _plano()], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert not r.blocked


# ---------------------------------------------------------------------------
# A fronteira: onde "sempre entrega" deixa de valer, e por quê.
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sem_json_nenhum_nao_ha_plano_para_entregar(monkeypatch):
    """A única exceção legítima — e ela precisa continuar existindo.

    Inventar um plano aqui seria pior que falhar: num produto de saúde, uma
    prescrição que ninguém gerou é a última coisa que pode chegar à tela.
    """
    monkeypatch.setattr(settings, "max_catalog_retries", 2)
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    _monta(monkeypatch, ["não sou json"], [APROVA])
    r = await pipeline.run_agent(ENTRADA)
    assert r.blocked
    assert not r.revision_notes
