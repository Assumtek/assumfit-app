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
        # Reposicionamento: faixa alta manda TREINAR, não focar.
        assert at(9)[1].action.key == "dumbbell"
        assert at(3, hrv_ms=30, hrv_baseline=65)[1].action.key == "drop"

    def test_a_acao_e_uma_das_rotas_que_o_app_conhece(self):
        for hour in range(24):
            assert at(hour)[1].action.key in {"dumbbell", "footprints", "drop"}


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


class TestContextoDoDia:
    """O dia da pessoa muda a AÇÃO e vira nota para o redator."""

    def _com_dia(self, hour: int, today, **over):
        energy = calc_energy(**{**BASE, **over}, hour=hour)
        return build(energy, hour, today=today)

    def test_treino_pendente_vira_a_acao(self):
        from models.insight import DayContext

        insight = self._com_dia(
            10, DayContext(workout=("Peito e tríceps", False)), hrv_ms=70, hrv_baseline=62
        )
        assert insight.action.key == "dumbbell"
        assert "treino" in insight.action.label.lower()

    def test_treino_feito_nao_cobra_de_novo(self):
        from models.insight import DayContext

        insight = self._com_dia(
            10, DayContext(workout=("Peito e tríceps", True)), hrv_ms=70, hrv_baseline=62
        )
        assert insight.action.key != "dumbbell"

    def test_energia_baixa_nao_manda_treinar(self):
        from models.insight import DayContext

        insight = self._com_dia(
            23, DayContext(workout=("Pernas", False)), hrv_ms=32, hrv_baseline=65, sleep_score=30
        )
        assert insight.action.key != "dumbbell"

    def test_tarde_parada_pede_movimento(self):
        from models.insight import DayContext

        insight = self._com_dia(
            16, DayContext(steps=800, meals_count=2, meals_kcal_mid=900), hrv_ms=70, hrv_baseline=62
        )
        assert insight.action.key == "footprints"

    def test_sem_refeicao_a_tarde_sugere_registrar(self):
        from models.insight import DayContext

        insight = self._com_dia(
            15, DayContext(steps=9000, meals_count=0), hrv_ms=70, hrv_baseline=62
        )
        assert insight.action.key == "flame"

    def test_sem_contexto_mantem_a_acao_da_faixa(self):
        insight = self._com_dia(10, None, hrv_ms=70, hrv_baseline=62)
        assert insight.action.key in {"dumbbell", "footprints", "drop"}


class TestNotasDoDia:
    def test_notas_juntam_o_que_foi_medido(self):
        from models.insight import DayContext, day_notes

        notas = day_notes(
            DayContext(
                steps=4200,
                last_sport=("corrida", 32),
                meals_count=2,
                meals_kcal_mid=1150,
                workout=("Costas e bíceps", False),
            ),
            hour=15,
        )
        assert notas is not None
        assert "Costas e bíceps" in notas
        assert "corrida por 32 min" in notas
        assert "4200 passos" in notas
        assert "~1150 kcal" in notas

    def test_ausencia_so_vira_nota_em_hora_plausivel(self):
        from models.insight import DayContext, day_notes

        manha = day_notes(DayContext(meals_count=0), hour=9)
        tarde = day_notes(DayContext(meals_count=0), hour=15)
        assert manha is None
        assert tarde is not None and "nenhuma refeição" in tarde

    def test_sem_nada_medido_fica_em_silencio(self):
        from models.insight import DayContext, day_notes

        assert day_notes(DayContext(), hour=10) is None
        assert day_notes(None, hour=10) is None
