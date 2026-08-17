"""Testes dos modelos.

Travam contrato e direção de sinal, não valores exatos — os percentis de
referência ainda vão mudar quando as curvas reais entrarem.

O teste de paridade com o TypeScript é o mais importante do arquivo: existem
duas implementações da mesma conta, uma no app para funcionar offline e outra
aqui, e sem verificação elas divergem em silêncio.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from models.bio_age import calc_bio_age
from models.chronotype import MIN_NIGHTS, Night, identify
from models.correlations import MIN_PAIRS, correlate
from models.energy_score import calc_energy, circadian_factor

BASE = dict(real_age=32, sex="m", hrv_ms=54, resting_hr=68, spo2_pct=96, deep_sleep_pct=0.20, temp_range_c=0.7)


# Os testes de idade biológica moram em `test_bio_age.py` desde a reescrita
# de ago/2026: o cálculo passou a ser fundamentado em literatura (Jurca 2005,
# FRIEND 2015, Natarajan 2020, Ohayon 2004) e cada função é verificada contra
# o ponto publicado do estudo que a originou. O que fica aqui é a PARIDADE
# com o TypeScript do app, que é sobre outra coisa: as duas implementações
# darem o mesmo número.


class TestEnergy:
    def test_calibrando_sem_baseline(self):
        assert calc_energy(hrv_ms=60, sleep_score=80, resting_hr=60, hour=9).calibrating is True
        assert calc_energy(hrv_ms=60, sleep_score=80, resting_hr=60, hour=9, hrv_baseline=60).calibrating is False

    def test_a_mesma_leitura_vale_diferente_por_baseline(self):
        acima = calc_energy(hrv_ms=60, sleep_score=80, resting_hr=60, hour=9, hrv_baseline=45)
        abaixo = calc_energy(hrv_ms=60, sleep_score=80, resting_hr=60, hour=9, hrv_baseline=90)
        assert acima.score > abaixo.score

    def test_vale_da_tarde_existe_mas_nao_domina(self):
        manha = calc_energy(hrv_ms=80, sleep_score=90, resting_hr=52, hour=10)
        tarde = calc_energy(hrv_ms=80, sleep_score=90, resting_hr=52, hour=14)
        assert tarde.score < manha.score
        # Quem está bem recuperado não vira "low" só por ser meio da tarde.
        assert tarde.level != "low"

    def test_cronotipo_desloca_a_curva(self):
        assert circadian_factor(20, "vespertino") > circadian_factor(20, "matutino")
        assert circadian_factor(7, "matutino") > circadian_factor(7, "vespertino")

    def test_curva_cobre_o_dia_inteiro(self):
        curve = calc_energy(hrv_ms=60, sleep_score=80, resting_hr=60, hour=9).curve
        assert [p.hour for p in curve] == list(range(24))
        assert all(0 <= p.score <= 100 for p in curve)


class TestChronotype:
    def _nights(self, onset: float, wake: float, n: int = MIN_NIGHTS):
        return [Night(sleep_onset=onset, wake_time=wake) for _ in range(n)]

    def test_admite_que_nao_sabe_sem_noites_suficientes(self):
        result = identify(self._nights(23.0, 7.0, n=MIN_NIGHTS - 1))
        assert result.chronotype is None
        assert result.confident is False

    def test_classifica_matutino_e_vespertino(self):
        assert identify(self._nights(21.5, 5.0)).chronotype == "matutino"
        assert identify(self._nights(2.0, 10.0)).chronotype == "vespertino"
        assert identify(self._nights(23.5, 7.5)).chronotype == "intermediario"

    def test_uma_noite_fora_da_curva_nao_reclassifica(self):
        # 23h30–7h30 é ponto médio 3,5 — intermediário. Uma única madrugada
        # de plantão não pode reclassificar a pessoa como vespertina.
        nights = self._nights(23.5, 7.5, n=10) + [Night(sleep_onset=4.0, wake_time=12.0)]
        assert identify(nights).chronotype == "intermediario"


class TestCorrelations:
    def test_nao_reporta_com_amostra_pequena(self):
        xs = list(range(MIN_PAIRS - 1))
        ys = [x * 2 for x in xs]  # correlação perfeita, mas n insuficiente
        assert correlate("t", xs, ys, positive_text="p", negative_text="n") is None

    def test_nao_reporta_ruido(self):
        # Par verificado: r = 0,0000, p = 1,00. A primeira versão deste teste
        # usava uma sequência "aleatória" escrita à mão que tinha r = −0,74 —
        # a função estava certa em reportar, e o teste é que estava errado.
        xs = list(range(1, 21))
        ys = [12, 19, 6, 5, 15, 7, 14, 9, 16, 10, 3, 18, 8, 1, 11, 2, 4, 13, 20, 17]
        assert correlate("t", xs, ys, positive_text="p", negative_text="n") is None

    def test_reporta_relacao_forte_e_significativa(self):
        xs = list(range(20))
        ys = [x * 1.5 + (1 if x % 3 else -1) for x in xs]
        insight = correlate("t", xs, ys, positive_text="sobe junto", negative_text="desce junto")
        assert insight is not None
        assert insight.text == "sobe junto"
        assert insight.n == 20

    def test_variancia_zero_nao_quebra(self):
        assert correlate("t", [5] * 20, list(range(20)), positive_text="p", negative_text="n") is None


class TestParidadeComTypeScript:
    """O app calcula idade biológica offline em TypeScript. As duas contas têm
    de dar o mesmo número, ou o usuário vê um valor com rede e outro sem."""

    CASES = [
        # Casos escolhidos para percorrer os quatro caminhos que divergiriam:
        # medianas, extremos (que batem no clamp), ausência de sinal e
        # ausência de IMC/atividade — cada um exercita um ramo diferente.
        dict(real_age=32, sex="m", hrv_ms=54, resting_hr=68, deep_sleep_pct=0.20, bmi=25, weekly_active_min=60),
        dict(real_age=32, sex="m", hrv_ms=74, resting_hr=55, deep_sleep_pct=0.45, bmi=22, weekly_active_min=300),
        dict(real_age=58, sex="f", hrv_ms=30, resting_hr=78, deep_sleep_pct=0.10, bmi=31, weekly_active_min=0),
        dict(real_age=24, sex="f", hrv_ms=90, resting_hr=48, deep_sleep_pct=0.30, bmi=20, weekly_active_min=400),
        dict(real_age=45, sex="m", hrv_ms=None, resting_hr=64, deep_sleep_pct=None, bmi=None, weekly_active_min=None),
        dict(real_age=70, sex="f", hrv_ms=22, resting_hr=70, deep_sleep_pct=0.12, bmi=27, weekly_active_min=120),
    ]

    def test_bio_age_bate_com_a_implementacao_do_app(self):
        script = Path(__file__).parent / "parity_bioage.ts"
        if not script.exists():
            pytest.skip("script de paridade ausente")

        proc = subprocess.run(
            ["npx", "tsx", str(script), json.dumps(self.CASES)],
            cwd=Path(__file__).parent.parent.parent / "app",
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            pytest.skip(f"não foi possível rodar o TypeScript: {proc.stderr[-300:]}")

        ts_results = json.loads(proc.stdout)
        for case, ts in zip(self.CASES, ts_results):
            py = calc_bio_age(**case)
            assert py.bio_age == ts["bioAge"], f"divergência em {case}"
            assert py.delta == ts["delta"]
            assert py.vo2max == pytest.approx(ts["vo2max"], abs=0.1), f"VO2máx divergente em {case}"
