"""A montagem da mensagem que vai ao modelo no ajuste conversacional.

Aqui não há chamada de rede: o que se verifica é a FORMA do que sai daqui, que
é onde os erros silenciosos moram. Uma imagem que não entra na lista de blocos
não dá erro em lugar nenhum, o modelo apenas responde sem ter visto a foto, e
a pessoa conclui que ele não entendeu a pergunta dela.
"""

from agent.adjust import WorkoutAdjustInput, build_adjust_user

# ---------------------------------------------------------------------------
# A foto do aparelho (Leonardo, 31/08/2026)
# ---------------------------------------------------------------------------


def test_sem_foto_o_user_nao_tem_bloco_de_imagem():
    blocos = build_adjust_user(WorkoutAdjustInput(message="posso trocar o agachamento?"))
    assert all(b["type"] == "text" for b in blocos)


def test_a_foto_entra_antes_do_texto():
    """A imagem vem primeiro: é a ordem que a nutrição já usa, e o texto
    pergunta sobre a imagem que veio."""
    blocos = build_adjust_user(
        WorkoutAdjustInput(message="que aparelho é este?", image_b64="Zm90bw==")
    )
    assert blocos[0]["type"] == "image"
    assert blocos[0]["source"] == {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "Zm90bw==",
    }
    assert blocos[1]["type"] == "text"


def test_a_correcao_de_formato_nao_perde_a_foto():
    """O retry de parse remonta o `user`, e sem a imagem a segunda tentativa
    responderia sobre uma foto que não está mais lá."""
    blocos = build_adjust_user(
        WorkoutAdjustInput(message="que aparelho é este?", image_b64="Zm90bw=="),
        correction="responda só o JSON",
    )
    assert blocos[0]["type"] == "image"
    assert blocos[-1]["text"] == "responda só o JSON"
