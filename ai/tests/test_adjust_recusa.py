"""A frase da recusa determinística.

O que falha em `validate_operations` é CONTRATO: dia fora do plano, exercício
fora do catálogo, operação demais. Chamar isso de insegurança clínica mente
sobre a causa, e "me diga de outra forma" não diz para onde reformular.
"""

from agent.adjust import _UNSAFE_REPLY


def test_recusa_nao_fala_em_seguranca():
    # Segurança clínica tem outro caminho: a recusa que o próprio modelo
    # sinaliza, com o motivo dele.
    assert "segurança" not in _UNSAFE_REPLY.lower()


def test_recusa_diz_o_que_o_agente_faz():
    for capacidade in ["trocar exercício", "séries", "descanso", "mover o treino"]:
        assert capacidade in _UNSAFE_REPLY.lower(), capacidade


def test_recusa_e_curta():
    # A regra das respostas fixas: duas frases, o limite e o caminho.
    assert len(_UNSAFE_REPLY) < 260
