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
    # Total combina as incertezas em quadratura: fica entre a soma dos mínimos e a dos meios.
    assert r.foods[0].kcal_min + 90 <= r.kcal_total_min <= (r.foods[0].kcal_min + r.foods[0].kcal_max) / 2 + 120


@pytest.mark.anyio
async def test_foto_sem_comida_e_sucesso(monkeypatch):
    async def falso(**kwargs):
        return '{"isFood": false, "foods": [], "confianca": 0.8, "observacoes": "paisagem"}'

    monkeypatch.setattr("nutrition.service.complete", falso)
    r = await analyze_meal(AnalyzeMealInput(image_b64="Zm90bw=="))
    assert not r.is_food
    assert r.foods == []


def test_taco_farofa_casa_com_e_sem_adjetivo():
    # "Farofa" sozinha e com adjetivo que a tabela não tem ("pronta") precisam
    # cair na mesma entrada real — era o buraco que sumia com a farofa da conta.
    for nome in ("Farofa", "Farofa pronta", "Farofa de bacon"):
        m = match_food(nome, 40)
        assert m is not None, nome
        assert "farofa" in m.description.lower()


def test_recompute_recalcula_pela_taco_e_preserva_sem_casamento():
    from nutrition.service import RecomputeFoodInput, RecomputeInput, recompute_foods

    r = recompute_foods(
        RecomputeInput(
            foods=[
                # Editado: gramas novos → TACO decide a caloria.
                RecomputeFoodInput(name="Arroz integral cozido", grams=200),
                # Sem casamento: fica exatamente o que o cliente mandou.
                RecomputeFoodInput(
                    name="Comida alienigena", grams=100, kcal_min=90, kcal_max=150, uncertain=True
                ),
            ]
        )
    )
    arroz, alien = r.foods
    assert arroz.matched is not None and arroz.kcal_min > 0
    assert alien.matched is None and (alien.kcal_min, alien.kcal_max) == (90, 150)
    assert arroz.kcal_min + 90 <= r.kcal_total_min <= r.kcal_total_max <= arroz.kcal_max + 150
    # Mais estreito do que somar os extremos: é o ponto do ajuste.
    assert (r.kcal_total_max - r.kcal_total_min) < (arroz.kcal_max - arroz.kcal_min) + 60


def test_recompute_item_novo_sem_taco_fica_com_zero_e_nao_inventa():
    from nutrition.service import RecomputeFoodInput, RecomputeInput, recompute_foods

    r = recompute_foods(RecomputeInput(foods=[RecomputeFoodInput(name="Parafuso sextavado", grams=50)]))
    assert r.foods[0].matched is None
    assert (r.foods[0].kcal_min, r.foods[0].kcal_max) == (0, 0)
