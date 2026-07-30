"""Re-voto do bloqueio por opinião — maioria de 2 em 3.

Rodada de testes 1 (jul/2026): o mesmo perfil limpo levou hard-fail de
segurança em 1 de 4 avaliações. Falso bloqueio cobra a geração inteira e não
entrega nada, então bloqueio que é só opinião do juiz precisa de maioria.
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
    "judges": [],
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
async def test_bloqueio_confirmado_por_dois_votos(monkeypatch):
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ, REPROVA_JUIZ])
    result = await pipeline.run_agent(ENTRADA)
    assert result.blocked
    assert len(chamadas) == 2


@pytest.mark.anyio
async def test_falso_bloqueio_cai_na_maioria(monkeypatch):
    # 1 contra, 2 a favor → passa, e o breakdown final é o de aprovação.
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ, APROVA, APROVA])
    result = await pipeline.run_agent(ENTRADA)
    assert not result.blocked
    assert result.score == 8.0
    assert len(chamadas) == 3


@pytest.mark.anyio
async def test_empate_se_resolve_no_terceiro(monkeypatch):
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ, APROVA, REPROVA_JUIZ])
    result = await pipeline.run_agent(ENTRADA)
    assert result.blocked
    assert len(chamadas) == 3


@pytest.mark.anyio
async def test_erro_deterministico_nao_revota(monkeypatch):
    # Validação reprovou: re-votar não muda nada e só queima chamada.
    chamadas = _prepara(monkeypatch, [APROVA], det_errors=["dia repetido"])
    result = await pipeline.run_agent(ENTRADA)
    assert result.blocked
    assert len(chamadas) == 1


@pytest.mark.anyio
async def test_checagem_dura_nao_revota(monkeypatch):
    chamadas = _prepara(monkeypatch, [REPROVA_CHECK])
    result = await pipeline.run_agent(ENTRADA)
    assert result.blocked
    assert len(chamadas) == 1


@pytest.mark.anyio
async def test_chave_desliga_o_revoto(monkeypatch):
    chamadas = _prepara(monkeypatch, [REPROVA_JUIZ])
    monkeypatch.setattr(settings, "grader_confirm_blocks", False)
    result = await pipeline.run_agent(ENTRADA)
    assert result.blocked
    assert len(chamadas) == 1
