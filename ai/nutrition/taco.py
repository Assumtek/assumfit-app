"""Tabela TACO em memória — a caloria oficial por trás da análise de foto.

O desenho vem do MUVX: a visão identifica o alimento e estima GRAMAS; a
caloria sai daqui, determinística (kcal/100g × gramas), nunca do modelo. A
diferença é o casamento: lá é embedding + pgvector; aqui, com 597 alimentos e
sem banco neste serviço, é texto normalizado com pontuação por tokens — e o
prompt já obriga o modelo a devolver o nome canônico acentuado, que é o que
faz esse casamento simples funcionar.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "taco.json"

#: Margem da faixa de kcal sobre o valor determinístico: o erro que sobra é o
#: da porção estimada pela visão, não o da tabela.
PORTION_MARGIN = 0.25

#: Pontuação mínima para aceitar um casamento. Abaixo disso, é outro alimento
#: com palavras parecidas — e caloria do alimento errado é pior que a faixa
#: aproximada do modelo.
MIN_SCORE = 0.5

_STOPWORDS = {"de", "da", "do", "com", "sem", "ao", "a", "e", "em", "tipo"}


@dataclass(frozen=True)
class TacoMatch:
    description: str
    grams: float
    kcal: float
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None


def _normalizar(texto: str) -> set[str]:
    plano = unicodedata.normalize("NFD", texto.lower())
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    tokens = {t.strip(",.()") for t in plano.split()}
    return {t for t in tokens if t and t not in _STOPWORDS}


def _num(valor: object) -> float | None:
    try:
        return float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


@lru_cache
def _tabela() -> list[tuple[set[str], dict]]:
    itens = json.loads(DATA.read_text(encoding="utf-8"))
    return [(_normalizar(item["description"]), item) for item in itens if _num(item.get("energy_kcal"))]


def match_food(name: str, grams: float | None) -> TacoMatch | None:
    """Melhor casamento da TACO para um nome vindo da visão, escalado à porção.

    Sem gramas não há o que escalar — devolve `None` e o chamador fica com a
    faixa de reserva do modelo.
    """
    if not grams or grams <= 0:
        return None
    consulta = _normalizar(name)
    if not consulta:
        return None
    # "Farofa" chega da visão com adjetivos que a tabela não tem ("pronta",
    # "de bacon"), e um token só não alcança o escore mínimo. O apelido ancora
    # na entrada real da TACO ("Mandioca, farofa, temperada").
    if "farofa" in consulta:
        consulta |= {"mandioca", "temperada"}

    melhor: tuple[float, dict] | None = None
    for tokens, item in _tabela():
        inter = len(consulta & tokens)
        if inter == 0:
            continue
        # Jaccard puxado para a CONSULTA: "arroz branco" deve casar com
        # "Arroz, polido, cozido" mesmo que a tabela tenha tokens a mais.
        score = inter / len(consulta) * 0.7 + inter / len(tokens) * 0.3
        if melhor is None or score > melhor[0]:
            melhor = (score, item)

    if melhor is None or melhor[0] < MIN_SCORE:
        return None

    item = melhor[1]
    fator = grams / 100.0
    escala = lambda campo: (v * fator if (v := _num(item.get(campo))) is not None else None)  # noqa: E731
    kcal = escala("energy_kcal")
    if kcal is None:
        return None
    return TacoMatch(
        description=item["description"],
        grams=grams,
        kcal=kcal,
        protein_g=escala("protein_g"),
        carbs_g=escala("carbohydrate_g"),
        fat_g=escala("lipid_g"),
    )
