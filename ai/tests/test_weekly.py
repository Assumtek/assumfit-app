import os

from models.weekly import WeeklyFacts, _prompt, write_weekly


def test_prompt_so_cita_o_que_foi_medido():
    p = _prompt(WeeklyFacts(atividades=3, minutos=120, esportes=1, kcal=300, nota_media=4.0, notas=(4, 4), treinos=("Corpo Inteiro A",)))
    assert "Corpo Inteiro A" in p and "média 4.0" in p
    assert "Sono" not in p and "Passos" not in p and "Água" not in p


def test_sem_chave_nao_ha_texto(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert write_weekly(WeeklyFacts(atividades=0, minutos=0, esportes=0, kcal=0, nota_media=None)) is None
