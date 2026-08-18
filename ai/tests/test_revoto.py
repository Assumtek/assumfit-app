"""Re-voto do bloqueio por opinião — maioria de 2 em 3 — e o desfecho depois dele.

Rodada de testes 1 (jul/2026): o mesmo perfil limpo levou hard-fail de
segurança em 1 de 4 avaliações. Falso bloqueio cobra a geração inteira e não
entrega nada, então bloqueio que é só opinião do juiz precisa de maioria.

Ago/2026, decisão da fundadora: confirmada a reprovação, o plano **não morre**.
O parecer volta ao gerador como pedido de revisão e, esgotadas as revisões, o
melhor plano é entregue com as ressalvas à vista. "Não foi possível gerar" é a
pior resposta possível para quem respondeu uma anamnese inteira. Segue bloqueado
só o que não tem plano para entregar — JSON que não parseia.
"""

from __future__ import annotations

import json

import pytest

import agent.pipeline as pipeline
from agent.models import WorkoutGenerationInput
from core.settings import settings

PLANO = json.dumps({"status": "GENERATED", "days": []})

APROVA = {"score": 8.0, "hard_failures": [], "judges": [], "checks": []}
REPROVA_JUIZ = {
    "score": 0.0,
    "hard_failures": [{"type": "judge", "name": "seguranca_clinica", "score": 5.0, "min": 7.0}],
    "judges": [
        {
            "name": "seguranca_clinica",
            "score": 5.0,
            "reason": "Volume agressivo para retorno pós 45 dias. Reduza as séries de perna.",
        }
    ],
    "checks": [],
}
REPROVA_CHECK = {
    "score": 0.0,
    "hard_failures": [{"type": "check", "name": "latencia"}],
    "judges": [],
    "checks": [],
}

ENTRADA = WorkoutGenerationInput(knowledge=["ref"])


def _prepara(monkeypatch, vereditos: list[dict], det_errors: list[str] | None = None):
    """Deixa geração e validação determinísticas e enfileira os vereditos."""
    chamadas: list[dict] = []

    async def gerar(inp, correction=None):
        return PLANO

    async def avaliar(**kwargs):
        veredito = vereditos[len(chamadas)]
        chamadas.append(veredito)
        return dict(veredito)

    monkeypatch.setattr(pipeline, "generate_plan", gerar)
    monkeypatch.setattr(pipeline, "validate_plan", lambda plan, inp: det_errors or [])
    monkeypatch.setattr(pipeline, "grade", avaliar)
    return chamadas


@pytest.mark.anyio
async def test_aprovado_nao_revota(monkeypatch):
    chamadas = _prepara(monkeypatch, [APROVA])
    result = await pipeline.run_agent(ENTRADA)
    assert not result.blocked
    assert len(chamadas) == 1


@pytest.mark.anyio
async def test_reprovacao_vira_revisao_sem_gastar_revoto(monkeypatch):
    """Reprovou e há revisão disponível: revisa DIRETO, sem re-votar.

    A re-votação existia para não bloquear por engano. Como reprovar não
    bloqueia mais, confirmá-la com duas avaliações extras gastaria dois terços
    do orçamento de tempo para decidir o que a revisão resolve melhor — e foi
    o que estourou o teto em produção (ago/2026).
    """
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    # 1 avaliação inicial + 1 por revisão. Um re-voto teria somado mais duas.
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ] * 3)
    result = await pipeline.run_agent(ENTRADA)
    assert not result.blocked
    assert result.revision_notes
    assert "Volume agressivo" in result.revision_notes[0]
    assert len(chamadas) == 3


@pytest.mark.anyio
async def test_falso_bloqueio_cai_na_maioria(monkeypatch):
    # 1 contra, 2 a favor → passa, e o breakdown final é o de aprovação.
    # Sem revisão disponível, a re-votação é quem protege do bloqueio falso.
    monkeypatch.setattr(settings, "max_judge_retries", 0)
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ, APROVA, APROVA])
    result = await pipeline.run_agent(ENTRADA)
    assert not result.blocked
    assert result.score == 8.0
    assert len(chamadas) == 3


@pytest.mark.anyio
async def test_empate_se_resolve_no_terceiro(monkeypatch):
    """O desempate só acontece onde a re-votação ainda vale: sem revisão."""
    monkeypatch.setattr(settings, "max_judge_retries", 0)
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ, APROVA, REPROVA_JUIZ])
    result = await pipeline.run_agent(ENTRADA)
    # Reprovação confirmada por maioria — e mesmo assim o plano é entregue,
    # agora com ressalvas, porque nunca mais se devolve as mãos abanando.
    assert not result.blocked
    assert result.revision_notes
    assert len(chamadas) == 3


@pytest.mark.anyio
async def test_erro_deterministico_nao_revota_mas_revisa(monkeypatch):
    """Erro de validação não RE-VOTA — re-votar não muda o que é objetivo.

    Mas revisa: uma falha estrutural é corrigível, e a regra é entregar um
    plano. O que não se faz é gastar chamada de avaliação pedindo segunda
    opinião sobre um erro que não é de opinião.
    """
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    chamadas = _prepara(monkeypatch, [APROVA] * 3, det_errors=["dia repetido"])
    result = await pipeline.run_agent(ENTRADA)
    # Persistindo o erro depois das revisões, segue bloqueado: não há plano
    # válido para entregar, e esta é a fronteira do "sempre entrega".
    assert result.blocked
    assert not result.revision_notes


@pytest.mark.anyio
async def test_checagem_dura_nao_revota(monkeypatch):
    """Checagem dura não RE-VOTA — repetiria idêntica e queimaria chamada.

    Revisar, sim: uma checagem reprovada é objetiva e o gerador pode corrigi-la.
    O que se cobra aqui é que nenhuma das chamadas seja re-voto — são revisões,
    cada uma com um plano novo.
    """
    monkeypatch.setattr(settings, "max_judge_retries", 2)
    chamadas = _prepara(monkeypatch, [REPROVA_CHECK] * 3)
    result = await pipeline.run_agent(ENTRADA)
    # 1 avaliação inicial + 2 revisões. Um re-voto teria gasto mais.
    assert len(chamadas) == 3
    assert not result.blocked


@pytest.mark.anyio
async def test_chave_desliga_o_revoto(monkeypatch):
    monkeypatch.setattr(settings, "grader_confirm_blocks", False)
    monkeypatch.setattr(settings, "max_judge_retries", 0)
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ])
    result = await pipeline.run_agent(ENTRADA)
    # Sem re-voto e sem revisão, o plano ainda assim é entregue com ressalvas.
    assert len(chamadas) == 1
    assert not result.blocked
    assert result.revision_notes
