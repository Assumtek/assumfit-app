"""A explicação de UM número, sob toque.

A regra que importa é a mesma de toda camada de texto do produto: número que
não está nos fatos não pode aparecer. Aqui pesa mais que no resto, porque a
frase compara a pessoa com ela mesma, e um valor inventado nessa comparação
soa exatamente como conhecimento sobre ela.
"""

from models.explicar import FatosDaMetrica, _prompt, _valido

FATOS = FatosDaMetrica(
    metrica="sono",
    rotulo="Sono",
    valor=92,
    unidade="de 100",
    avaliacao="ótimo",
    componentes=["7h10 dormidas", "22% de sono profundo", "duas vezes acordado"],
    media_pessoal=78,
    dias_de_historico=21,
    melhor="92 em 25 de setembro",
    relacao="nas noites acima de 7h o score passa de 85",
)


def _resposta(**kw):
    base = {
        "de_onde_vem": "Vem de 7h10 dormidas com 22% de sono profundo.",
        "onde_voce_esta": "A sua média de 21 dias é 78, então esta noite foi acima.",
        "o_que_mexe": "Nas suas noites acima de 7h o score passa de 85.",
    }
    base.update(kw)
    return base


def test_aceita_texto_com_numeros_dos_fatos():
    assert _valido(_resposta(), FATOS)


def test_recusa_numero_inventado():
    # 63 não está em lugar nenhum dos fatos.
    assert not _valido(_resposta(onde_voce_esta="A sua média é 63."), FATOS)


def test_recusa_campo_vazio():
    assert not _valido(_resposta(o_que_mexe="  "), FATOS)


def test_recusa_texto_longo_demais():
    assert not _valido(_resposta(de_onde_vem="x" * 300), FATOS)


def test_sem_historico_o_prompt_diz_isso_em_vez_de_comparar():
    magro = FatosDaMetrica(
        metrica="hrv", rotulo="HRV", valor=48, unidade="ms", avaliacao="bom")
    p = _prompt(magro)
    assert "não há histórico suficiente" in p
    assert "média desta pessoa" not in p


def test_o_prompt_leva_os_componentes_e_a_relacao():
    p = _prompt(FATOS)
    assert "7h10 dormidas" in p
    assert "nas noites acima de 7h" in p
