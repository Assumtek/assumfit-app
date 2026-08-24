"""O catálogo como o modelo o vê, e a volta do nome para o id.

O catálogo ia como JSON indentado com todos os campos, e isso custava 42.262
tokens de entrada em TODA chamada: 81% do prompt de geração. Medido em
24/08/2026, com o contador da própria API.

A maior parte era o que o modelo menos precisa: **13.300 tokens só de UUIDs**,
cerca de 34 por id, porque `c923ccde-bf84-4fe5-...` vira dezenas de pedaços na
tokenização. O id não ajuda a escolher exercício; serve para o modelo copiar de
volta, e essa cópia é justamente onde ele erra e inventa.

Então o catálogo passa a ir por NOME, uma linha por exercício, com o que decide
a escolha: grupo muscular e equipamento. São 12.580 tokens, 70% a menos. Os 390
nomes são únicos mesmo normalizando acento e caixa (verificado), e a volta é
determinística: `id_do_nome` casa o que o modelo escreveu com o catálogo real.
"""

from __future__ import annotations

import json
import re
import unicodedata

from agent.models import CatalogExercise

#: Equipamento que só existe em academia. A mesma lista de `validate.py`, aqui
#: para FILTRAR antes, em vez de avisar depois: o que não pode ser prescrito
#: não precisa nem ser oferecido.
SO_NA_ACADEMIA = {"machine", "cable", "smith", "leg press", "maquina", "máquina", "polia"}


def normalizar(nome: str) -> str:
    """Sem acento, sem caixa, sem espaço sobrando e sem pontuação decorativa."""
    sem_acento = unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]+", " ", sem_acento.lower()).strip()


def para_o_lugar(exercicios: list[CatalogExercise], local: str | None) -> list[CatalogExercise]:
    """O catálogo que cabe no lugar onde a pessoa treina.

    Em casa, exercício de máquina sai da lista. Não é economia de token apenas:
    é a diferença entre um plano que ela consegue seguir e um que ela abandona
    na primeira sessão.
    """
    if not local or local.lower().startswith("academ"):
        return exercicios
    return [
        e
        for e in exercicios
        if not any(termo in (e.equipment or "").lower() for termo in SO_NA_ACADEMIA)
    ]


def como_texto(exercicios: list[CatalogExercise]) -> str:
    """Uma linha por exercício: nome | grupo | equipamento | nível."""
    linhas = [
        "# Catalogo permitido (prescreva SOMENTE estes, pelo NOME exato)",
        "# formato: nome | grupo muscular | equipamento | nivel",
    ]
    for e in exercicios:
        linhas.append(
            f"{e.name} | {e.muscle_group or '-'} | {e.equipment or '-'} | {e.level or '-'}"
        )
    return "\n".join(linhas)


def id_do_nome(exercicios: list[CatalogExercise]) -> dict[str, str]:
    """Índice de nome normalizado para id, para a volta."""
    return {normalizar(e.name): e.id for e in exercicios}


def resolver_nomes(plan_json: str, exercicios: list[CatalogExercise]) -> tuple[str, list[str]]:
    """Troca `exerciseName` por `exerciseId` no plano que o modelo devolveu.

    Devolve o plano e a lista de nomes que NÃO existem no catálogo. Nome
    desconhecido não é silenciado nem chutado por semelhança: ele volta como
    erro para o mesmo caminho que já trata id inventado, que é quem sabe
    substituir por um exercício do mesmo tipo ou remover.
    """
    try:
        plan = json.loads(plan_json)
    except json.JSONDecodeError:
        return plan_json, []

    indice = id_do_nome(exercicios)
    desconhecidos: list[str] = []

    def visitar(node: object) -> None:
        if isinstance(node, list):
            for item in node:
                visitar(item)
            return
        if not isinstance(node, dict):
            return
        nome = node.get("exerciseName")
        if isinstance(nome, str) and "exerciseId" not in node:
            encontrado = indice.get(normalizar(nome))
            if encontrado:
                node["exerciseId"] = encontrado
            else:
                desconhecidos.append(nome)
                # Marca com o próprio nome: o validador acusa "fora do
                # catálogo" e o reparo por semelhança decide o que fazer.
                node["exerciseId"] = f"nome-desconhecido:{nome}"
        for valor in node.values():
            visitar(valor)

    visitar(plan)
    return json.dumps(plan, ensure_ascii=False), desconhecidos
