"""O contexto que o agente de ajuste recebe.

O que se testa aqui é o CONTRATO com o modelo: o que entra no JSON e o que
não entra. Uma chave a mais ou a menos muda a resposta de quem lê.
"""

from agent.adjust import WorkoutAdjustInput, build_adjust_user


def entrada(**extras) -> WorkoutAdjustInput:
    base = {"message": "revisa meu treino com base na semana", "current_plan": {"days": []}}
    base.update(extras)
    return WorkoutAdjustInput(**base)


def test_semana_entra_no_payload_quando_existe():
    blocos = build_adjust_user(entrada(week_feedback="Sessões desta semana (1):\nsegunda: Pernas"))
    texto = blocos[0]["text"]
    assert "week_feedback" in texto
    assert "segunda: Pernas" in texto


def test_sem_semana_a_chave_nao_aparece():
    # Chave vazia convida o modelo a comentar a ausência, que é ruído.
    texto = build_adjust_user(entrada())[0]["text"]
    assert "week_feedback" not in texto


def test_semana_so_de_espacos_conta_como_ausente():
    texto = build_adjust_user(entrada(week_feedback="   \n  "))[0]["text"]
    assert "week_feedback" not in texto


def test_mensagem_e_plano_continuam_no_payload():
    texto = build_adjust_user(entrada(week_feedback="algo"))[0]["text"]
    assert "current_plan" in texto
    assert "revisa meu treino" in texto
