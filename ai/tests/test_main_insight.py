"""O endpoint `/energy/insight` de ponta a ponta — o que faltava.

Existia teste para cada peça (score, molde, plausibilidade) e nenhum para a
ROTA. Foi assim que um `NameError` dentro de `_redigir` virou 500 em toda
chamada por um dia inteiro (21/08/2026) sem que a suíte acusasse: o backend
recebia erro, o app caía no molde local, e a home mostrou a mesma frase para
todo mundo. Estes testes chamam a rota como o backend chama, com e sem
`recent_insights`, e sem chave de modelo — o que tem de voltar é o molde, com
200.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture()
def cliente(monkeypatch):
    # Sem chave nenhuma: a rota precisa responder com o molde, nunca com erro.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    return TestClient(main.app)


CORPO = {
    "hrv_ms": 48,
    "sleep_score": 72,
    "resting_hr": 58,
    "hour": 10,
    "hrv_baseline": 55,
    "weekday": 4,
    "water_ml": 600,
    "water_goal_ml": 2500,
}


def test_insight_responde_200_com_molde_sem_chave(cliente):
    r = cliente.post("/energy/insight", json=CORPO)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert "insight" in corpo
    assert corpo["insight"]["source"] == "model"
    assert corpo["insight"]["headline"]
    assert corpo["insight"]["action"]["key"]


def test_insight_aceita_recent_insights(cliente):
    # O campo que derrubou a rota: precisa entrar e não quebrar nada.
    r = cliente.post(
        "/energy/insight",
        json={**CORPO, "recent_insights": ["Seu corpo pede recuperação", "Bom momento para movimento leve"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["insight"]["source"] == "model"


def test_insight_com_contexto_do_dia(cliente):
    r = cliente.post(
        "/energy/insight",
        json={
            **CORPO,
            "today": {
                "steps": 2500,
                "sport_count": 1,
                "last_sport": {"kind": "corrida", "minutes": 30},
                "meals_count": 1,
                "meals_kcal_mid": 450,
                "workout": {"name": "Pernas", "done": False},
            },
            "lifestyle": {"work_posture": "sitting", "posture_hours": 8, "train_days": [1, 3, 5]},
        },
    )
    assert r.status_code == 200, r.text


def test_recent_e_repassado_ao_redator(monkeypatch, cliente):
    """O que o backend manda em `recent_insights` tem de chegar a `write()`."""
    recebido: dict = {}

    def falso_write(facts, fallback):
        recebido["recent"] = facts.recent
        return None

    monkeypatch.setattr(main, "write_insight", falso_write)
    frases = [f"frase {i}" for i in range(6)]
    r = cliente.post("/energy/insight", json={**CORPO, "recent_insights": frases})
    assert r.status_code == 200
    # Teto de quatro, como o prompt foi desenhado.
    assert recebido["recent"] == tuple(frases[:4])
