"""O comentário do fim de treino, e o que ele não pode dizer.

A validação é a mesma do bom dia: número que não está nos fatos não pode
aparecer no texto. Aqui isso pesa mais, porque um treinador que inventa a carga
que você levantou perde a confiança de uma vez, e ninguém confere isso lendo em
dez segundos depois do treino.
"""

from models.workout_feedback import WorkoutFeedbackFacts, _prompt, _valido

FATOS = WorkoutFeedbackFacts(
    workout_name="Upper A",
    duration_min=59,
    completion_pct=100,
    effort=8,
    rating=4,
    volume_kg=4200,
    exercises=7,
    previous_volume_kg=3900,
    avg_bpm=118,
)


def _texto(headline: str, body: str) -> dict:
    return {"headline": headline, "body": body}


def test_aceita_texto_com_numeros_dos_fatos():
    assert _valido(_texto("Sessão completa", "Você levantou 4200 kg em 59 minutos."), FATOS)


def test_recusa_numero_inventado():
    # 5100 não está em lugar nenhum dos fatos.
    assert not _valido(_texto("Sessão completa", "Você levantou 5100 kg."), FATOS)


def test_a_diferenca_entre_as_cargas_e_citavel():
    # 4200 menos 3900: é a observação mais útil que existe aqui, e o modelo
    # pode fazer essa conta.
    assert _valido(_texto("Mais peso que antes", "São 300 kg a mais que na última vez."), FATOS)


def test_recusa_texto_vazio_ou_longo_demais():
    assert not _valido(_texto("", "corpo"), FATOS)
    assert not _valido(_texto("t", "x" * 400), FATOS)


def test_prompt_omite_o_que_nao_foi_medido():
    magros = WorkoutFeedbackFacts(workout_name="Lower B", duration_min=30)
    p = _prompt(magros)
    assert "Esforço percebido" not in p
    assert "Carga total" not in p
    assert "Batimento médio" not in p


def test_prompt_traz_a_comparacao_quando_existe():
    p = _prompt(FATOS)
    assert "3900 kg" in p
    assert "4200 kg" in p
