"""O catálogo por nome, e a volta do nome para o id.

O id custava 13.300 dos 42.262 tokens do catálogo, e é justamente o campo em
que o modelo erra (inventa UUID). Por nome, ele escreve o que leu.
"""

import json

from agent.catalogo import como_texto, normalizar, para_o_lugar, resolver_nomes
from agent.models import CatalogExercise

SUPINO = CatalogExercise(id="id-1", name="Supino Reto (Barra)", muscle_group="peito", equipment="barbell")
POLIA = CatalogExercise(id="id-2", name="Cross Over (Polia Alta)", muscle_group="peito", equipment="cable")
AGACHA = CatalogExercise(id="id-3", name="Agachamento Livre", muscle_group="pernas", equipment="bodyweight")
CATALOGO = [SUPINO, POLIA, AGACHA]


def plano(nomes):
    return json.dumps({
        "status": "GENERATED",
        "days": [{"dayOfWeek": "MONDAY", "dayType": "WORKOUT", "workout": {
            "name": "T", "phases": [{"type": "TREINO", "exercises": [
                {"exerciseName": n, "subtype": "STRENGTH"} for n in nomes]}]}}],
    })


def test_o_texto_nao_carrega_id():
    texto = como_texto(CATALOGO)
    assert "id-1" not in texto
    assert "Supino Reto (Barra) | peito | barbell" in texto


def test_nome_vira_id():
    resolvido, faltando = resolver_nomes(plano(["Supino Reto (Barra)"]), CATALOGO)
    assert faltando == []
    assert json.loads(resolvido)["days"][0]["workout"]["phases"][0]["exercises"][0]["exerciseId"] == "id-1"


def test_acento_e_caixa_nao_atrapalham():
    # O modelo escreve "supino reto (barra)" e continua sendo o mesmo exercício.
    resolvido, faltando = resolver_nomes(plano(["supino reto (barra)"]), CATALOGO)
    assert faltando == []
    assert "id-1" in resolvido


def test_nome_inventado_volta_como_desconhecido():
    # Não se chuta por semelhança: quem decide substituir é quem já trata id
    # fora do catálogo, com a regra de mesmo tipo.
    resolvido, faltando = resolver_nomes(plano(["Supino Marciano"]), CATALOGO)
    assert faltando == ["Supino Marciano"]
    assert "nome-desconhecido:Supino Marciano" in resolvido


def test_em_casa_a_maquina_sai_do_catalogo():
    emCasa = para_o_lugar(CATALOGO, "casa")
    assert POLIA not in emCasa
    assert SUPINO in emCasa and AGACHA in emCasa


def test_na_academia_o_catalogo_e_inteiro():
    assert len(para_o_lugar(CATALOGO, "academia")) == 3
    assert len(para_o_lugar(CATALOGO, None)) == 3


def test_normalizar_ignora_pontuacao_decorativa():
    assert normalizar("Cross Over (Polia Alta)") == normalizar("cross over  polia alta")


def test_json_quebrado_volta_intacto():
    resolvido, faltando = resolver_nomes("{quebrado", CATALOGO)
    assert resolvido == "{quebrado" and faltando == []
