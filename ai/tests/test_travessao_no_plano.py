"""O travessão no PLANO, que é onde ele mais se lê.

O prompt proíbe e o modelo escreve mesmo assim, de vez em quando. A defesa
existia para o insight, o bom dia e o resumo semanal desde ago/2026, e o plano
tinha ficado de fora, justamente o texto mais visível dos quatro: o nome do
treino vira título de tela, item de lista e legenda do card compartilhado.
"""

from models.texto import sem_travessao_em

PLANO = {
    "name": "Plano de força",
    "workouts": [
        {
            "name": "Superior A — Empurrar",
            "notes": "Foco em peito e ombro — pare duas repetições antes da falha.",
            "exercises": [{"exerciseId": "abc", "sets": 3}],
        }
    ],
    "rationale": "Três dias — o que cabe na sua semana.",
}


def test_o_nome_do_treino_perde_o_travessao():
    limpo = sem_travessao_em(PLANO)
    assert "—" not in limpo["workouts"][0]["name"]
    assert "Superior A" in limpo["workouts"][0]["name"]
    assert "Empurrar" in limpo["workouts"][0]["name"]


def test_alcança_observacao_e_fundamentacao():
    limpo = sem_travessao_em(PLANO)
    assert "—" not in limpo["workouts"][0]["notes"]
    assert "—" not in limpo["rationale"]


def test_nao_mexe_no_que_nao_e_texto():
    limpo = sem_travessao_em(PLANO)
    assert limpo["workouts"][0]["exercises"][0]["sets"] == 3
    assert limpo["workouts"][0]["exercises"][0]["exerciseId"] == "abc"


def test_operacao_de_renomear_tambem_e_limpa():
    """RENAME_WORKOUT escreve o nome no banco: o sinal sobreviveria à conversa."""
    ops = [{"op": "RENAME_WORKOUT", "day_of_week": 1, "name": "Costas — Puxar"}]
    assert "—" not in sem_travessao_em(ops)[0]["name"]
