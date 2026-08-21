"""A ordem das vias de redação: OpenAI → Anthropic → molde.

Nasceu de um caso real (21/08/2026): chave da OpenAI presente e conta sem
créditos. A primeira versão só tentava a Anthropic quando a chave da OpenAI
FALTAVA — com ela presente e falhando, a home ia para o molde com a segunda via
parada ao lado. Estes testes não chamam rede: as duas vias são substituídas e
o que se verifica é quem foi chamado, em que ordem, e o que volta.
"""

from __future__ import annotations

import pytest

from models import insight_llm
from models.insight import Action, HomeInsight

FATOS = insight_llm.Facts(
    score=62,
    level="mid",
    calibrating=False,
    driver=("Recuperação (HRV)", "48 ms, -7 vs. sua média"),
    lift=None,
    next_label=None,
    hour=12,
    routine=None,
)

MOLDE = HomeInsight(
    eyebrow="bom para se mover",
    headline="Bom momento para movimento leve",
    detail="molde",
    next_label=None,
    next_hour=None,
    action=Action("footprints", "Registrar um esporte"),
    driver_key="hrv",
    driver_label="Recuperação (HRV)",
)

TEXTO = {"eyebrow": "corpo em ajuste", "headline": "Dia para ir com calma", "detail": "Sua recuperação está em 48 ms. Caminhe um pouco."}


@pytest.fixture()
def chamadas(monkeypatch):
    ordem: list[str] = []

    def openai_falha(facts):
        ordem.append("openai")
        return None

    def anthropic_ok(facts):
        ordem.append("anthropic")
        return dict(TEXTO)

    monkeypatch.setattr(insight_llm, "_redigir_openai", openai_falha)
    monkeypatch.setattr(insight_llm, "_redigir_anthropic", anthropic_ok)
    return ordem


def test_openai_falhando_cai_na_anthropic(monkeypatch, chamadas):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-teste")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-teste")
    r = insight_llm.write(FATOS, MOLDE)
    assert chamadas == ["openai", "anthropic"]
    assert r is not None and r.source == "llm"
    assert r.headline == TEXTO["headline"]
    # O que o modelo NÃO decide vem do molde.
    assert r.action == MOLDE.action


def test_sem_chave_da_openai_vai_direto_na_anthropic(monkeypatch, chamadas):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-teste")
    assert insight_llm.write(FATOS, MOLDE) is not None
    assert chamadas == ["anthropic"]


def test_so_openai_e_ela_falha_devolve_none(monkeypatch, chamadas):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-teste")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert insight_llm.write(FATOS, MOLDE) is None
    assert chamadas == ["openai"]


def test_sem_chave_nenhuma_nao_chama_ninguem(monkeypatch, chamadas):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert insight_llm.write(FATOS, MOLDE) is None
    assert chamadas == []


def test_openai_respondendo_nao_chama_anthropic(monkeypatch):
    ordem: list[str] = []
    monkeypatch.setattr(insight_llm, "_redigir_openai", lambda f: (ordem.append("openai"), dict(TEXTO))[1])
    monkeypatch.setattr(insight_llm, "_redigir_anthropic", lambda f: (ordem.append("anthropic"), dict(TEXTO))[1])
    monkeypatch.setenv("OPENAI_API_KEY", "sk-teste")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-teste")
    assert insight_llm.write(FATOS, MOLDE) is not None
    assert ordem == ["openai"]
