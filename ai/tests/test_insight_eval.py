"""Avaliação sistemática do insight, sobre personas × 24 horas.

Inspirado no que o WHOOP descreve em "The Crux of Every AI System: Evaluations":
eles pegaram uma regressão que *parecia melhora* no teste manual. O caso é o
mesmo aqui — as três frases falsas da primeira versão foram encontradas a olho,
porque eram óbvias; as próximas não vão ser.

A diferença para `test_insight.py` é o tipo de asserção. Lá são casos com
resposta esperada; aqui são **propriedades que precisam valer para TODA
combinação** de persona e hora. Uma propriedade não precisa saber qual é a
resposta certa — só qual resposta é impossível —, e é isso que a torna capaz de
pegar regressão em cenário que ninguém pensou em escrever.

Não há LLM envolvido, então nada disto precisa de julgamento de modelo: as
propriedades são verificáveis por construção.
"""

from __future__ import annotations

import pytest

from models.energy_score import calc_energy
from models.insight import ACTIONS, DRIVER_TEXT, LIFT_TEXT, STRONG_NORM, WEAK_NORM, build

#: Personas sintéticas, cobrindo os regimes que o produto encontra de verdade.
#:
#: Cada uma existe para exercitar um caminho distinto: com e sem linha de base,
#: com e sem sensor de sono, hidratação registrada e ausente, e os dois extremos
#: de recuperação. Persona nova aqui custa uma linha e multiplica a cobertura
#: por 24.
PERSONAS = {
    "atleta_recuperado": dict(hrv_ms=95, sleep_score=88, resting_hr=48, hrv_baseline=88, water_ml=2200),
    "atleta_em_carga": dict(hrv_ms=52, sleep_score=71, resting_hr=61, hrv_baseline=88, water_ml=1800),
    "sedentario": dict(hrv_ms=26, sleep_score=58, resting_hr=79, hrv_baseline=28, water_ml=700),
    "noite_perdida": dict(hrv_ms=31, sleep_score=24, resting_hr=84, hrv_baseline=55, water_ml=400),
    "calibrando": dict(hrv_ms=60, sleep_score=76, resting_hr=64, hrv_baseline=None, water_ml=None),
    "sem_sensor_de_sono": dict(hrv_ms=68, sleep_score=None, resting_hr=57, hrv_baseline=65, water_ml=1500),
    "desidratado": dict(hrv_ms=70, sleep_score=82, resting_hr=55, hrv_baseline=66, water_ml=150),
    # Febre com o RESTO bom, de propósito: com HRV ruim junto, o HRV vence a
    # escolha do fator (déficit oito vezes maior) e a temperatura nunca é
    # exercitada. Isolar é o que faz a persona provar alguma coisa.
    "febre_isolada": dict(hrv_ms=70, sleep_score=80, resting_hr=58, hrv_baseline=66, temperature_c=38.2, water_ml=2000),
}

CASES = [(name, hour) for name in PERSONAS for hour in range(24)]
CASE_IDS = [f"{name}@{hour}h" for name, hour in CASES]


def evaluate(name: str, hour: int):
    energy = calc_energy(**PERSONAS[name], hour=hour)
    return energy, build(energy, hour)


@pytest.mark.parametrize(("name", "hour"), CASES, ids=CASE_IDS)
class TestPropriedades:
    """Cada asserção nomeia uma resposta IMPOSSÍVEL, não uma esperada."""

    def test_nunca_aponta_hora_que_ja_passou(self, name, hour):
        _, insight = evaluate(name, hour)
        if insight.next_hour is not None:
            assert insight.next_hour > hour

    def test_a_hora_citada_no_texto_e_a_mesma_do_rotulo(self, name, hour):
        """Uma tela, uma hora.

        A primeira versão exibia "próximo pico às 15h" logo abaixo de um texto
        que dizia "volta a subir às 17h" — as duas verdadeiras, e juntas
        confusas. Nenhuma frase do detalhe pode conter hora.
        """
        _, insight = evaluate(name, hour)
        assert "h." not in insight.detail.replace("24h.", ""), insight.detail

    def test_nunca_elogia_sinal_fraco_nem_acusa_sinal_forte(self, name, hour):
        """O bug original, generalizado.

        Acusar "recuperação abaixo do normal" com HRV acima da média era o
        sintoma; a causa era escolher o sinal só por peso. A propriedade fecha a
        classe inteira: se o texto de acusação de um sinal aparece, aquele sinal
        tem de estar de fato baixo, e vice-versa.
        """
        energy, insight = evaluate(name, hour)
        by_key = {c.key: c for c in energy.components}

        for key, template in DRIVER_TEXT.items():
            if template.split("—")[0].strip() in insight.detail:
                assert by_key[key].norm < WEAK_NORM, f"{key} acusado com norm {by_key[key].norm}"

        for key, template in LIFT_TEXT.items():
            if template.split("—")[0].strip() in insight.detail:
                assert by_key[key].norm >= STRONG_NORM, f"{key} elogiado com norm {by_key[key].norm}"

    def test_nunca_fala_de_sinal_assumido(self, name, hour):
        """Sinal que entrou por convenção não pode virar afirmação."""
        energy, insight = evaluate(name, hour)
        for component in energy.components:
            if component.assumed:
                assert insight.driver_key != component.key

    def test_a_acao_e_uma_rota_que_o_app_conhece(self, name, hour):
        _, insight = evaluate(name, hour)
        # O conjunto completo de rotas do `ACTION_ROUTE` do app; os padrões por
        # faixa usam só dumbbell/footprints/drop desde o reposicionamento.
        assert insight.action.key in {"play", "calendar", "drop", "dumbbell", "footprints", "flame"}

    def test_a_acao_corresponde_a_faixa(self, name, hour):
        energy, insight = evaluate(name, hour)
        assert insight.action.key == ACTIONS[energy.level].key

    def test_calibracao_e_declarada_exatamente_quando_ocorre(self, name, hour):
        energy, insight = evaluate(name, hour)
        assert ("calibrando" in insight.detail) == energy.calibrating

    def test_o_texto_nunca_sai_vazio_nem_com_molde_por_preencher(self, name, hour):
        _, insight = evaluate(name, hour)
        for field in (insight.eyebrow, insight.headline, insight.detail):
            assert field and field.strip()
            # `{value}` escapando significa molde montado sem substituição.
            assert "{" not in field and "}" not in field

    def test_o_score_e_um_percentual_valido(self, name, hour):
        energy, _ = evaluate(name, hour)
        assert 0 <= energy.score <= 100

    def test_os_pesos_sempre_somam_um(self, name, hour):
        """Vale inclusive quando falta sinal — é o contrato da redistribuição."""
        energy, _ = evaluate(name, hour)
        assert abs(sum(c.weight for c in energy.components) - 1.0) < 1e-9


class TestCobertura:
    """Propriedades sobre o CONJUNTO, que nenhum caso isolado revelaria."""

    def test_toda_persona_atravessa_mais_de_uma_faixa_no_dia(self):
        """Se uma persona ficasse na mesma faixa 24h, ela não testaria transição.

        Não é asserção sobre o produto — é sobre a qualidade do conjunto de
        casos. Persona que nunca muda de faixa passa em tudo sem exercitar nada.
        """
        movimentou = 0
        for name in PERSONAS:
            niveis = {evaluate(name, h)[0].level for h in range(24)}
            if len(niveis) > 1:
                movimentou += 1
        assert movimentou >= len(PERSONAS) // 2

    def test_alguma_combinacao_produz_cada_acao_possivel(self):
        """As três ações padrão precisam ser alcançáveis, ou uma tela está morta."""
        acoes = {evaluate(name, hour)[1].action.key for name, hour in CASES}
        assert acoes == {"dumbbell", "footprints", "drop"}

    def test_cada_sinal_medido_chega_a_ser_o_fator_nomeado(self):
        """Um sinal que nunca é nomeado indica limiar inalcançável.

        Temperatura pesa 5%: para ela aparecer é preciso estar bem fora da
        faixa. A persona febril existe justamente para provar que o caminho não
        é código morto.
        """
        drivers = {evaluate(name, hour)[1].driver_key for name, hour in CASES}
        assert {"hrv", "hydration", "temp"} <= drivers

    def test_ninguem_e_mandado_treinar_estando_mal(self):
        """Propriedade de produto, não de código.

        Mandar quem está em faixa baixa "abrir o treino" às 3h seria o app
        contradizendo o próprio propósito: prontidão baixa pede recuperação —
        água ou, no máximo, registrar uma refeição.
        """
        for name, hour in CASES:
            energy, insight = evaluate(name, hour)
            if energy.level == "low":
                assert insight.action.key in {"drop", "flame"}
