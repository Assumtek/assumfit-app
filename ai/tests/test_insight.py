"""Testes da camada de insight.

Metade destes casos existe porque a primeira versão errou exatamente neles. Um
texto gerado a partir do dado ainda consegue mentir, e é mais perigoso que um
texto fixo — ele parece derivado, então ninguém confere.
"""

from __future__ import annotations

from models.energy_score import calc_energy
from models.insight import MIN_PEAK_GAIN, build, next_transition

BASE = dict(hrv_ms=72, sleep_score=82, resting_hr=56, hrv_baseline=65)


def at(hour: int, **over):
    energy = calc_energy(**{**BASE, **over}, hour=hour)
    return energy, build(energy, hour)


class TestFatorNomeado:
    def test_nao_acusa_sinal_que_esta_acima_da_media(self):
        """O bug original: HRV 7 ms ACIMA da média era chamado de 'abaixo do normal'.

        Acontecia porque o HRV pesa 0,40 e o critério era só peso × (1 − norm),
        então ele acumulava mais déficit ABSOLUTO estando bem do que a
        temperatura estando mal.
        """
        _, insight = at(14, hrv_ms=72, hrv_baseline=65)
        assert "abaixo do seu normal" not in insight.detail

    def test_nomeia_o_hrv_quando_ele_realmente_despencou(self):
        _, insight = at(9, hrv_ms=48, hrv_baseline=65)
        assert insight.driver_key == "hrv"
        assert "-17" in insight.detail

    def test_nomeia_hidratacao_quando_ela_e_o_pior_sinal(self):
        _, insight = at(16, hrv_ms=60, hrv_baseline=62, water_ml=300)
        assert insight.driver_key == "hydration"
        assert "0,3 L de 2,5 L" in insight.detail

    def test_nao_cita_hidratacao_sem_registro(self):
        """Sinal assumido entra por convenção. Falar dele é afirmar o não medido."""
        _, insight = at(9, hrv_ms=40, hrv_baseline=65, water_ml=None)
        assert insight.driver_key != "hydration"
        assert "água" not in insight.detail

    def test_estar_na_propria_media_nao_e_defeito(self):
        # Exatamente na média: norm = 0,5. Neutro, não fraco.
        _, insight = at(9, hrv_ms=65, hrv_baseline=65)
        assert insight.driver_key != "hrv" or "abaixo" not in insight.detail

    def test_credita_o_sinal_forte_em_faixa_alta(self):
        energy, insight = at(9)
        assert energy.level == "high"
        assert "acima do seu normal" in insight.detail


class TestTransicao:
    def test_avisa_a_queda_de_quem_esta_no_pico(self):
        energy, insight = at(9)
        assert insight.next_label is not None
        assert "cair" in insight.next_label
        assert insight.next_hour is not None and insight.next_hour > 9

    def test_nunca_aponta_hora_que_ja_passou(self):
        """O defeito da frase fixa: um vespertino às 20h lia 'pico às 16h'."""
        for hour in range(0, 24):
            _, insight = at(hour)
            if insight.next_hour is not None:
                assert insight.next_hour > hour, f"{hour}h apontou {insight.next_hour}h"

    def test_fim_do_dia_nao_inventa_transicao(self):
        _, insight = at(23)
        assert insight.next_label is None

    def test_silencia_quando_o_ganho_e_irrelevante(self):
        curve = [type("P", (), {"hour": h, "score": 50 + (h == 20) * (MIN_PEAK_GAIN - 1)})() for h in range(24)]
        assert next_transition(curve, 10, 50) == (None, None)

    def test_reporta_ganho_relevante_sem_troca_de_faixa(self):
        curve = [type("P", (), {"hour": h, "score": 40 + (h == 20) * 20})() for h in range(24)]
        hour_found, label = next_transition(curve, 10, 40)
        assert hour_found == 20 and label is not None


class TestCalibracao:
    def test_admite_que_esta_calibrando(self):
        _, insight = at(9, hrv_baseline=None)
        assert "calibrando" in insight.detail

    def test_nao_fala_de_calibracao_com_linha_de_base(self):
        _, insight = at(9)
        assert "calibrando" not in insight.detail


class TestAcao:
    def test_a_acao_acompanha_a_faixa(self):
        assert at(9)[1].action.key == "play"
        assert at(3, hrv_ms=30, hrv_baseline=65)[1].action.key == "drop"

    def test_a_acao_e_uma_das_rotas_que_o_app_conhece(self):
        for hour in range(24):
            assert at(hour)[1].action.key in {"play", "calendar", "drop"}


class TestSinalAusente:
    def test_sono_ausente_redistribui_o_peso_em_vez_de_chutar(self):
        energy = calc_energy(hrv_ms=60, sleep_score=None, resting_hr=64, hour=9, hrv_baseline=62)
        keys = {c.key for c in energy.components}
        assert "sleep" not in keys
        assert abs(sum(c.weight for c in energy.components) - 1.0) < 1e-9

    def test_com_sono_os_pesos_sao_os_da_spec(self):
        energy = calc_energy(**BASE, hour=9)
        weights = {c.key: c.weight for c in energy.components}
        assert weights == {"hrv": 0.40, "hr": 0.20, "temp": 0.05, "sleep": 0.25, "hydration": 0.10}

    def test_ausencia_de_sono_nao_pune_quem_so_nao_tem_o_sensor(self):
        """Peso redistribuído, não zerado: sem sensor o score não pode desabar."""
        com_sono_ruim = calc_energy(**{**BASE, "sleep_score": 0}, hour=9).score
        sem_sono = calc_energy(**{**BASE, "sleep_score": None}, hour=9).score
        assert sem_sono > com_sono_ruim
