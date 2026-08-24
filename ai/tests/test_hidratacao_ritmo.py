"""A hidratação julgada pelo RITMO do dia, não pelo total.

Antes, a fração era `bebido / meta` a qualquer hora: às nove da manhã ninguém
bebeu dois litros, então todo mundo tinha hidratação ruim de manhã e a frase da
home falava de água todo dia antes do almoço. Pior, contradizia o indicador da
própria tela, que sempre julgou pelo ritmo da hora.
"""

from models.energy_score import _components, _ritmo_do_dia


def hidratacao(water_ml, hour, goal=2500):
    componentes = _components(
        hrv_ms=50.0,
        sleep_score=80.0,
        resting_hr=60.0,
        temperature_c=36.6,
        hrv_baseline=50.0,
        water_ml=water_ml,
        water_goal_ml=goal,
        hour=hour,
    )
    return next(c for c in componentes if c.key == "hydration")


def test_de_manha_o_esperado_e_proporcional_a_hora():
    # 9h: passaram 2 das 15 horas da janela, o esperado é ~13% da meta.
    # 325 ml com meta de 2,5 L é exatamente isso, e não pode valer 13% de nota.
    assert hidratacao(325, 9).norm > 0.9


def test_o_mesmo_volume_a_noite_e_pouco():
    # 21h: o dia inteiro passou, 325 ml é pouco de verdade.
    assert hidratacao(325, 21).norm < 0.2


def test_meta_batida_vale_cheio_em_qualquer_hora():
    assert hidratacao(2500, 21).norm == 1.0
    assert hidratacao(2500, 9).norm == 1.0


def test_de_madrugada_a_hidratacao_e_neutra():
    # Quem acorda às 5h não está desidratado por ainda não ter bebido.
    assert hidratacao(0, 5).norm == 0.5
    assert _ritmo_do_dia(5) == 0.0


def test_sem_registro_continua_neutra_e_assumida():
    c = hidratacao(None, 14)
    assert c.norm == 0.5
    assert c.assumed is True


def test_o_texto_continua_dizendo_o_dia_inteiro():
    # A régua mudou; o que a pessoa lê continua sendo bebido de meta do dia.
    assert hidratacao(325, 9).value == "0,3 L de 2,5 L"
