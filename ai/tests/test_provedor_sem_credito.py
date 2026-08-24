"""Conta sem crédito sai da frente em vez de falhar a cada requisição.

O erro de cota não é passageiro: ele vai se repetir em toda chamada até
alguém pagar. Insistir custa a latência de uma chamada perdida antes de cada
texto, e um log que esconde os erros de verdade.
"""

import time

import models.insight_llm as m


def setup_function():
    m._openai_fora_ate = 0.0


def test_reconhece_o_erro_de_cota():
    class RateLimitError(Exception):
        pass

    err = RateLimitError(
        "Error code: 429 - {'error': {'message': 'You have no credits remaining.', "
        "'code': 'credit_balance_exhausted'}}"
    )
    assert m._openai_fora_por_cota(err) is True


def test_erro_passageiro_nao_tira_o_provedor_da_frente():
    # Timeout e 500 são para tentar de novo, não para desligar o provedor.
    assert m._openai_fora_por_cota(TimeoutError("timed out")) is False
    assert m._openai_fora_por_cota(RuntimeError("500 internal server error")) is False


def test_a_tregua_vale_e_expira():
    assert m._openai_em_trégua() is False
    m._openai_fora_ate = time.time() + 60
    assert m._openai_em_trégua() is True
    m._openai_fora_ate = time.time() - 1
    assert m._openai_em_trégua() is False
