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


def test_o_dia_de_hoje_entra_no_payload():
    # Sem isto o agente pergunta que dia é hoje a quem pediu treino para hoje.
    texto = build_adjust_user(entrada(today={"data": "2026-08-24", "dia_da_semana": "segunda"}))[0]["text"]
    assert "today" in texto
    assert "segunda" in texto


def test_sem_dia_a_chave_nao_aparece():
    assert "today" not in build_adjust_user(entrada())[0]["text"]


def test_a_resposta_de_falha_nao_diz_que_esta_fora_de_escopo():
    """Tentar e não conseguir é diferente de não fazer.

    A pessoa pediu quatro dias de treino, o agente tentou, as operações não
    passaram no contrato e a tela respondeu que isso se resolve refazendo a
    anamnese, o que é falso: o prompt manda resolver frequência semanal com
    SET_DAY_TYPE (fundadora, 24/08/2026).
    """
    from agent.adjust import _NAO_CONSEGUI_MONTAR, _OUT_OF_SCOPE_REPLY

    assert "anamnese" not in _NAO_CONSEGUI_MONTAR
    assert "Não consegui montar" in _NAO_CONSEGUI_MONTAR
    # A de fora de escopo continua existindo, para o que realmente está fora.
    assert "anamnese" in _OUT_OF_SCOPE_REPLY
