from models.texto import sem_travessao


def test_travessao_entre_oracoes_vira_virgula():
    assert (
        sem_travessao("A melhor janela fica às 17h — até lá, movimento leve.")
        == "A melhor janela fica às 17h, até lá, movimento leve."
    )


def test_intervalo_numerico_vira_meia_risca():
    assert sem_travessao("17—18h") == "17–18h"


def test_travessao_colado_a_palavra_vira_virgula():
    assert sem_travessao("dormiu pouco—treine leve") == "dormiu pouco,treine leve"


def test_meia_risca_como_travessao_tambem_sai():
    assert sem_travessao("hoje – amanhã") == "hoje, amanhã"


def test_texto_sem_travessao_passa_intacto():
    original = "Sua recuperação está em 47 ms, abaixo do esperado."
    assert sem_travessao(original) == original


def test_vazio_e_none_nao_quebram():
    assert sem_travessao("") == ""


def test_estrutura_aninhada_inteira():
    from models.texto import sem_travessao_em

    entrada = {
        "titulo": "Semana firme — com uma ressalva",
        "itens": [{"texto": "dormiu bem — treinou pouco"}],
        "numero": 7,
    }
    saida = sem_travessao_em(entrada)
    assert saida["titulo"] == "Semana firme, com uma ressalva"
    assert saida["itens"][0]["texto"] == "dormiu bem, treinou pouco"
    assert saida["numero"] == 7
