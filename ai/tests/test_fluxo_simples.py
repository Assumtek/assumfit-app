"""O caminho de quem não tem sinalização clínica: gerar, checar, entregar.

O avaliador clínico custava uma chamada com raciocínio ligado em TODA geração,
inclusive para perfil sem flag nenhuma, onde o critério de maior peso dele
(segurança clínica) não tem o que avaliar. Dos seis critérios, dois viraram
código. Decisão da fundadora (24/08/2026) ao simplificar o fluxo.
"""

import json

import pytest

from agent import pipeline
from agent.models import CatalogExercise, WorkoutGenerationInput

DIAS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
CATALOGO = [CatalogExercise(id="e-1", name="Agachamento", equipment="bodyweight")]


def _plano(com_preparo: bool = True) -> str:
    fases = []
    if com_preparo:
        fases.append({"type": "ALONGAMENTO", "exercises": [{"exerciseId": "e-1", "subtype": "MOBILITY"}]})
    fases.append({"type": "TREINO", "exercises": [{"exerciseId": "e-1", "subtype": "STRENGTH"}]})
    return json.dumps(
        {
            "status": "GENERATED",
            "days": [
                {"dayOfWeek": d, "dayType": "WORKOUT", "workout": {"name": "T", "phases": fases}}
                for d in DIAS
            ],
        }
    )


def _prepara(monkeypatch, plano: str):
    avaliacoes: list[dict] = []
    geracoes: list[str | None] = []

    async def gerar(inp, correction=None):
        geracoes.append(correction)
        return plano

    async def avaliar(**kwargs):
        avaliacoes.append(kwargs)
        return {"score": 8.0, "hard_failures": [], "judges": [], "checks": []}

    monkeypatch.setattr(pipeline, "generate_plan", gerar)
    monkeypatch.setattr(pipeline, "grade", avaliar)
    monkeypatch.setattr(pipeline, "reescrever_para_pessoa", lambda t: t)
    return geracoes, avaliacoes


@pytest.mark.anyio
async def test_sem_flag_nao_chama_o_avaliador(monkeypatch):
    geracoes, avaliacoes = _prepara(monkeypatch, _plano())
    r = await pipeline.run_agent(
        WorkoutGenerationInput(knowledge=["ref"], allowed_exercises=CATALOGO, flags=[])
    )
    assert not r.blocked
    assert len(geracoes) == 1, "uma geração, e só"
    assert avaliacoes == [], "o avaliador clínico não roda para perfil sem flag"
    assert r.grader_breakdown["deterministic_only"] is True


@pytest.mark.anyio
async def test_com_flag_o_avaliador_roda(monkeypatch):
    _, avaliacoes = _prepara(monkeypatch, _plano())
    await pipeline.run_agent(
        WorkoutGenerationInput(
            knowledge=["ref"], allowed_exercises=CATALOGO, flags=["cardiopata"]
        )
    )
    assert len(avaliacoes) == 1


@pytest.mark.anyio
async def test_aviso_nao_bloqueia_e_vira_ressalva(monkeypatch):
    """Sem aquecimento o plano ainda é um plano: sai, com o aviso à vista."""
    geracoes, avaliacoes = _prepara(monkeypatch, _plano(com_preparo=False))
    r = await pipeline.run_agent(
        WorkoutGenerationInput(knowledge=["ref"], allowed_exercises=CATALOGO, flags=[])
    )
    assert not r.blocked
    assert len(geracoes) == 1, "aviso não paga uma geração extra"
    assert any("aquecimento" in n for n in r.revision_notes)
