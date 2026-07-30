"""Casamento TACO e parse da análise de refeição — o determinístico do desenho."""

import pytest

from nutrition.service import AnalyzeMealInput, analyze_meal
from nutrition.taco import match_food


def test_taco_casa_nome_canonico_e_escala_pela_porcao():
    m = match_food("Arroz integral cozido", 200)
    assert m is not None
    assert "Arroz, integral" in m.description
    # kcal/100g ~123,5 → 200g ~247. Escala linear, sem inventar precisão.
    assert 240 <= m.kcal <= 255


def test_taco_sem_gramas_nao_casa():
    assert match_food("Arroz integral cozido", None) is None
    assert match_food("Arroz integral cozido", 0) is None


def test_taco_nome_sem_relacao_nao_casa():
    assert match_food("Parafuso sextavado", 100) is None


@pytest.mark.anyio
async def test_analise_soma_faixas_e_marca_casamento(monkeypatch):
    resposta = (
        '{"isFood": true, "confianca": 0.9, "observacoes": "", "foods": ['
        '{"name": "Arroz integral cozido", "porcaoDescricao": "4 colheres", "gramas": 200,'
        ' "incerto": false, "kcalEstimadaMin": 180, "kcalEstimadaMax": 300},'
        '{"name": "Comida alienigena", "porcaoDescricao": "1 pedaço", "gramas": 100,'
        ' "incerto": true, "kcalEstimadaMin": 90, "kcalEstimadaMax": 150}]}'
    )

    async def falso(**kwargs):
        return resposta

    monkeypatch.setattr("nutrition.service.complete", falso)
    r = await analyze_meal(AnalyzeMealInput(image_b64="Zm90bw=="))

    assert r.is_food
    assert r.foods[0].matched is not None  # TACO decidiu a kcal do arroz
    assert r.foods[1].matched is None  # fora da tabela → faixa do modelo
    assert r.foods[1].kcal_min == 90 and r.foods[1].kcal_max == 150
    assert r.kcal_total_min == r.foods[0].kcal_min + 90


@pytest.mark.anyio
async def test_foto_sem_comida_e_sucesso(monkeypatch):
    async def falso(**kwargs):
        return '{"isFood": false, "foods": [], "confianca": 0.8, "observacoes": "paisagem"}'

    monkeypatch.setattr("nutrition.service.complete", falso)
    r = await analyze_meal(AnalyzeMealInput(image_b64="Zm90bw=="))
    assert not r.is_food
    assert r.foods == []
