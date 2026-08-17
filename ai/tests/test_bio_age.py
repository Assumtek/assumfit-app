"""A idade biológica contra as fontes que a fundamentam.

O que estes testes travam não é o número final — é a ANCORAGEM: cada função
tem que reproduzir o ponto publicado do estudo de onde ela veio. Se alguém
trocar um coeficiente sem trocar a fonte, é aqui que quebra.
"""

import pytest

from models.bio_age import (
    ML_POR_MET,
    activity_level,
    calc_bio_age,
    deep_sleep_age,
    estimate_vo2max,
    fitness_age,
    hrv_age,
)


class TestVo2maxJurca:
    """Jurca et al. 2005, Tabela 5 (coluna NASA)."""

    def test_reproduz_a_equacao_publicada(self):
        # METs = 18,07 + 2,77(homem) − 0,10·idade − 0,17·IMC − 0,03·FC + PA
        # Homem, 40 anos, IMC 25, FC 60, inativo:
        # 18,07 + 2,77 − 4,0 − 4,25 − 1,8 + 0 = 10,79 MET = 37,765 mL/kg/min
        vo2 = estimate_vo2max(age=40, sex="m", bmi=25, resting_hr=60, weekly_active_min=0)
        assert vo2 == pytest.approx(10.79 * ML_POR_MET, abs=0.01)

    def test_mulher_nao_recebe_o_termo_de_sexo(self):
        homem = estimate_vo2max(age=40, sex="m", bmi=25, resting_hr=60, weekly_active_min=0)
        mulher = estimate_vo2max(age=40, sex="f", bmi=25, resting_hr=60, weekly_active_min=0)
        assert homem - mulher == pytest.approx(2.77 * ML_POR_MET, abs=0.01)

    def test_cada_coeficiente_tem_o_sinal_da_fisiologia(self):
        base = dict(age=40, sex="m", bmi=25, resting_hr=60, weekly_active_min=0)
        assert estimate_vo2max(**{**base, "age": 50}) < estimate_vo2max(**base)
        assert estimate_vo2max(**{**base, "bmi": 30}) < estimate_vo2max(**base)
        assert estimate_vo2max(**{**base, "resting_hr": 75}) < estimate_vo2max(**base)
        assert estimate_vo2max(**{**base, "weekly_active_min": 200}) > estimate_vo2max(**base)

    def test_nunca_devolve_valor_impossivel(self):
        # IMC e FC extremos derrubariam a reta abaixo de zero.
        assert estimate_vo2max(age=89, sex="f", bmi=50, resting_hr=110, weekly_active_min=0) > 0


class TestNivelDeAtividade:
    """As faixas da Tabela 1 de Jurca, traduzidas para minutos registrados."""

    @pytest.mark.parametrize(
        "minutos,nivel",
        [(None, 0), (0, 0), (5, 1), (19, 1), (20, 2), (59, 2), (60, 3), (179, 3), (180, 4), (600, 4)],
    )
    def test_faixas(self, minutos, nivel):
        assert activity_level(minutos) == nivel


class TestIdadeDaAptidao:
    """Kaminsky et al. 2015 (FRIEND), percentil 50 em esteira."""

    @pytest.mark.parametrize(
        "vo2,sexo,idade",
        [(48.0, "m", 24.5), (37.8, "m", 44.5), (24.4, "m", 74.5), (37.6, "f", 24.5), (18.3, "f", 74.5)],
    )
    def test_a_mediana_publicada_devolve_a_propria_idade(self, vo2, sexo, idade):
        assert fitness_age(vo2, sexo) == pytest.approx(idade, abs=0.1)

    def test_interpola_entre_decadas(self):
        # Entre 34,5 (42,4) e 44,5 (37,8) para homens: 40,1 fica no meio.
        assert fitness_age(40.1, "m") == pytest.approx(39.5, abs=0.5)

    def test_e_monotona_decrescente(self):
        anterior = 200.0
        for vo2 in range(60, 10, -2):
            atual = fitness_age(float(vo2), "m")
            assert atual > anterior or anterior == 200.0
            anterior = atual


class TestIdadeDoHrv:
    """Natarajan et al. 2020, Tabela 1: HRV(idade) = HRV30 · (idade/30)^α."""

    def test_o_rmssd_de_referencia_devolve_30_anos(self):
        assert hrv_age(44.8, "m") == pytest.approx(30.0, abs=0.1)
        assert hrv_age(43.7, "f") == pytest.approx(30.0, abs=0.1)

    def test_rmssd_maior_significa_idade_menor(self):
        assert hrv_age(70, "m") < hrv_age(44.8, "m") < hrv_age(25, "m")

    def test_valor_impossivel_nao_quebra(self):
        assert hrv_age(0, "m") == 30.0
        assert hrv_age(-5, "f") == 30.0


class TestIdadeDoSono:
    """Ohayon et al. 2004: N3 cai ~2 pontos por década até os 60."""

    def test_a_ancora_dos_30_anos(self):
        assert deep_sleep_age(0.20) == pytest.approx(30.0, abs=0.1)

    def test_duas_decadas_a_menos_de_n3(self):
        # 16% é 4 pontos abaixo dos 20% dos 30 anos → 20 anos a mais.
        assert deep_sleep_age(0.16) == pytest.approx(50.0, abs=0.1)

    def test_nao_afirma_alem_do_plato(self):
        # Abaixo do esperado aos 60, a curva não discrimina mais idade.
        assert deep_sleep_age(0.14) == 60.0
        assert deep_sleep_age(0.02) == 60.0


class TestResultado:
    def test_mais_apto_e_biologicamente_mais_jovem(self):
        sedentario = calc_bio_age(
            real_age=40, sex="m", hrv_ms=35, resting_hr=72, deep_sleep_pct=0.15,
            bmi=28, weekly_active_min=0,
        )
        ativo = calc_bio_age(
            real_age=40, sex="m", hrv_ms=55, resting_hr=56, deep_sleep_pct=0.20,
            bmi=23, weekly_active_min=200,
        )
        assert ativo.bio_age < sedentario.bio_age
        assert ativo.delta > sedentario.delta

    def test_ausencia_nao_empurra_o_resultado(self):
        """Sem sono medido, o peso é redistribuído — não vira zero."""
        com = calc_bio_age(
            real_age=35, sex="f", hrv_ms=40, resting_hr=64, deep_sleep_pct=0.18,
            bmi=24, weekly_active_min=90,
        )
        sem = calc_bio_age(
            real_age=35, sex="f", hrv_ms=40, resting_hr=64, deep_sleep_pct=None,
            bmi=24, weekly_active_min=90,
        )
        assert abs(com.bio_age - sem.bio_age) <= 3

    def test_o_desvio_tem_teto(self):
        absurdo = calc_bio_age(
            real_age=70, sex="m", hrv_ms=200, resting_hr=35, deep_sleep_pct=0.60,
            bmi=18, weekly_active_min=1000,
        )
        assert absurdo.delta <= 15
        assert absurdo.bio_age >= 18

    def test_nunca_devolve_idade_infantil(self):
        r = calc_bio_age(
            real_age=19, sex="f", hrv_ms=120, resting_hr=42, deep_sleep_pct=0.35,
            bmi=20, weekly_active_min=600,
        )
        assert r.bio_age >= 18

    def test_expoe_o_vo2max_que_explica_o_numero(self):
        r = calc_bio_age(
            real_age=30, sex="m", hrv_ms=45, resting_hr=60, deep_sleep_pct=0.2,
            bmi=25, weekly_active_min=60,
        )
        assert r.vo2max is not None and 20 < r.vo2max < 70
        assert any(f.key == "fitness" for f in r.factors)

    def test_atividade_aparece_mas_nao_conta_duas_vezes(self):
        r = calc_bio_age(
            real_age=30, sex="m", hrv_ms=45, resting_hr=60, deep_sleep_pct=0.2,
            bmi=25, weekly_active_min=200,
        )
        atividade = next(f for f in r.factors if f.key == "activity")
        assert atividade.years == 0.0
        assert "200 min" in atividade.value

    def test_sem_imc_declarado_usa_o_padrao_sem_quebrar(self):
        r = calc_bio_age(
            real_age=45, sex="m", hrv_ms=40, resting_hr=64, deep_sleep_pct=None,
            bmi=None, weekly_active_min=None,
        )
        assert 18 <= r.bio_age <= 100
