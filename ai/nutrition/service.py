"""Análise de refeição por foto — o desenho do MUVX, no vocabulário do AssumFit.

A visão identifica os alimentos e estima a PORÇÃO EM GRAMAS; a caloria final é
determinística, da tabela TACO sobre esses gramas. A faixa de kcal que o
modelo devolve é só reserva para alimento fora da tabela. Foto sem comida é
resposta válida (`is_food=False`), nunca erro.

Modelo: Haiku. Visão de prato é tarefa de identificação, não de juízo — e é a
chamada mais frequente do produto depois do chat, então o custo manda.
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from core.logging import get_logger
from core.settings import settings
from llm.client import complete
from nutrition.taco import PORTION_MARGIN, match_food

log = get_logger("nutrition.service")


class AnalyzeMealInput(BaseModel):
    image_b64: str = Field(min_length=1)
    media_type: str = "image/jpeg"
    description: str | None = None
    request_id: str | None = None


class MealFood(BaseModel):
    name: str
    portion: str
    grams: float | None
    kcal_min: int
    kcal_max: int
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    uncertain: bool
    #: Nome oficial da TACO quando houve casamento — auditável na tela.
    matched: str | None


class MealAnalysis(BaseModel):
    is_food: bool
    foods: list[MealFood]
    kcal_total_min: int
    kcal_total_max: int
    confidence: float
    notes: str
    model_id: str


class MealAnalysisError(Exception):
    """Falha de modelo ou de parse — o chamador decide o retry."""


class RecomputeFoodInput(BaseModel):
    """Um alimento como a pessoa o deixou ao editar — nome e gramas mandam."""

    name: str = Field(min_length=1)
    portion: str = ""
    grams: float | None = None
    #: Reserva para item sem casamento na TACO: o que o cliente mandar fica.
    kcal_min: int = 0
    kcal_max: int = 0
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    uncertain: bool = False


class RecomputeInput(BaseModel):
    foods: list[RecomputeFoodInput]


class RecomputeResult(BaseModel):
    foods: list[MealFood]
    kcal_total_min: int
    kcal_total_max: int


def recompute_foods(inp: RecomputeInput) -> RecomputeResult:
    """Recalcula uma refeição EDITADA — determinístico, sem modelo.

    Editar nome ou gramas passa o item de novo pela TACO; casou, a caloria e os
    macros vêm da tabela sobre os gramas novos. Não casou, fica o que o cliente
    mandou — que para item recém-criado é zero, e a tela mostra o traço em vez
    de um número inventado.
    """
    foods: list[MealFood] = []
    for item in inp.foods:
        match = match_food(item.name.strip(), item.grams)
        if match is not None:
            foods.append(
                MealFood(
                    name=item.name.strip(),
                    portion=item.portion.strip(),
                    grams=match.grams,
                    kcal_min=max(0, round(match.kcal * (1 - PORTION_MARGIN))),
                    kcal_max=round(match.kcal * (1 + PORTION_MARGIN)),
                    protein_g=match.protein_g,
                    carbs_g=match.carbs_g,
                    fat_g=match.fat_g,
                    uncertain=item.uncertain,
                    matched=match.description,
                )
            )
        else:
            kcal_min, kcal_max = sorted((max(0, item.kcal_min), max(0, item.kcal_max)))
            foods.append(
                MealFood(
                    name=item.name.strip(),
                    portion=item.portion.strip(),
                    grams=item.grams,
                    kcal_min=kcal_min,
                    kcal_max=kcal_max,
                    protein_g=_opt(item.protein_g),
                    carbs_g=_opt(item.carbs_g),
                    fat_g=_opt(item.fat_g),
                    uncertain=item.uncertain,
                    matched=None,
                )
            )
    return RecomputeResult(
        foods=foods,
        kcal_total_min=sum(f.kcal_min for f in foods),
        kcal_total_max=sum(f.kcal_max for f in foods),
    )


_SYSTEM = (
    "Voce e um assistente de nutricao de um app brasileiro de bem-estar (AssumFit). "
    "Analise a FOTO de uma refeicao, identifique os alimentos visiveis e estime a "
    "porcao de cada um em linguagem caseira E EM GRAMAS.\n\n"
    "O QUE IMPORTA: identificar TODOS os alimentos e acertar a PORCAO EM GRAMAS. As "
    "calorias finais serao calculadas por uma tabela nutricional oficial a partir do "
    "nome e dos gramas que voce der.\n\n"
    "REGRAS:\n"
    "1. Liste TODOS os alimentos visiveis, um por um — nao agrupe nem omita. Olhe o "
    "prato inteiro, inclusive o que esta parcialmente coberto ou nas bordas.\n"
    "1a. PRATO BRASILEIRO: procure ATIVAMENTE os acompanhamentos discretos — farofa "
    "(granulada, amarelada, por cima do arroz ou num canto; nao e arroz), couve "
    "refogada, vinagrete, pure, mandioca/aipim, torresmo. Farofa passa despercebida "
    "com frequencia: so conclua que nao ha depois de procurar.\n"
    "1b. PROTEINA: distinga frango, carne bovina, porco e peixe pela fibra, cor e "
    "formato — frango desfia em fibras claras; carne bovina e mais escura e densa. "
    "Sem certeza, use nome generico (\"Carne grelhada\") com incerto=true; NUNCA "
    "escolha a especie por palpite.\n"
    "2. name: portugues CORRETO E ACENTUADO, primeira letra maiuscula, nome comum e "
    "especifico (ex.: \"Feijão carioca cozido\", \"Filé de frango grelhado\"). Nunca "
    "invente alimento que nao da para ver nem inferir da descricao.\n"
    "3. porcaoDescricao caseira (\"1 concha média\") e gramas sempre > 0, calibrados "
    "por referencias visuais (prato, talheres).\n"
    "4. kcalEstimadaMin/Max: faixa APROXIMADA, so como reserva.\n"
    "5. Macros (proteinaG, carboidratoG, gorduraG) quando conseguir; senao null.\n"
    "6. Foto sem comida identificavel: isFood=false e foods vazio — nao e erro.\n"
    "7. confianca 0 a 1 sobre a identificacao geral.\n"
    "8. incerto=true no item que voce nao tem certeza — prefira sinalizar a chutar em "
    "silencio; a pessoa confirma ou corrige.\n"
    "9. Voce NAO aconselha, NAO diagnostica e NAO julga a refeicao. So identifica.\n\n"
    "FORMATO — retorne APENAS um JSON valido, sem markdown:\n"
    '{"isFood": true, "foods": [{"name": "", "porcaoDescricao": "", "gramas": 0, '
    '"incerto": false, "kcalEstimadaMin": 0, "kcalEstimadaMax": 0, "proteinaG": 0, '
    '"carboidratoG": 0, "gorduraG": 0}], "confianca": 0.0, "observacoes": ""}'
)

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _user_content(inp: AnalyzeMealInput) -> list[dict]:
    texto = "Analise esta refeicao: liste os alimentos e estime a porcao de cada um em gramas."
    if inp.description and inp.description.strip():
        texto += (
            f'\n\nDescricao da pessoa: "{inp.description.strip()}"\n'
            "Os itens que ela cita tem PRECEDENCIA: procure cada um na foto e "
            "inclua-o (a menos que claramente nao esteja la). A descricao tambem "
            "desempata especie de carne e revela o que a foto esconde."
        )
    texto += "\n\nRetorne apenas o JSON no formato especificado."
    return [
        {"type": "image", "source": {"type": "base64", "media_type": inp.media_type, "data": inp.image_b64}},
        {"type": "text", "text": texto},
    ]


def _int(v: object, default: int = 0) -> int:
    try:
        return max(0, int(round(float(v))))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _opt(v: object) -> float | None:
    if v is None:
        return None
    try:
        return max(0.0, float(v))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _food_from(item: object) -> MealFood | None:
    if not isinstance(item, dict):
        return None
    nome = item.get("name")
    if not isinstance(nome, str) or not nome.strip():
        return None
    gramas = _opt(item.get("gramas"))
    kcal_min, kcal_max = _int(item.get("kcalEstimadaMin")), _int(item.get("kcalEstimadaMax"))
    if kcal_max < kcal_min:
        kcal_min, kcal_max = kcal_max, kcal_min

    porcao = item.get("porcaoDescricao")
    match = match_food(nome.strip(), gramas)
    if match is not None:
        return MealFood(
            name=nome.strip(),
            portion=porcao.strip() if isinstance(porcao, str) else "",
            grams=match.grams,
            kcal_min=max(0, round(match.kcal * (1 - PORTION_MARGIN))),
            kcal_max=round(match.kcal * (1 + PORTION_MARGIN)),
            protein_g=match.protein_g,
            carbs_g=match.carbs_g,
            fat_g=match.fat_g,
            uncertain=item.get("incerto") is True,
            matched=match.description,
        )
    return MealFood(
        name=nome.strip(),
        portion=porcao.strip() if isinstance(porcao, str) else "",
        grams=gramas,
        kcal_min=kcal_min,
        kcal_max=kcal_max,
        protein_g=_opt(item.get("proteinaG")),
        carbs_g=_opt(item.get("carboidratoG")),
        fat_g=_opt(item.get("gorduraG")),
        uncertain=item.get("incerto") is True,
        matched=None,
    )


async def analyze_meal(inp: AnalyzeMealInput) -> MealAnalysis:
    raw = await complete(
        system=_SYSTEM,
        user=_user_content(inp),
        model=settings.nutrition_model,
        max_tokens=1500,
        effort="low",
    )

    texto = raw.strip()
    cercado = _FENCE.search(texto)
    if cercado:
        texto = cercado.group(1).strip()
    try:
        data = json.loads(texto)
    except json.JSONDecodeError as exc:
        log.error("nutrition.parse_failed", request_id=inp.request_id)
        raise MealAnalysisError("resposta do modelo nao e JSON") from exc
    if not isinstance(data, dict):
        raise MealAnalysisError("resposta do modelo tem forma invalida")

    foods = [f for f in (_food_from(i) for i in data.get("foods") or []) if f is not None]
    is_food = data.get("isFood") is True and len(foods) > 0

    resultado = MealAnalysis(
        is_food=is_food,
        foods=foods,
        kcal_total_min=sum(f.kcal_min for f in foods),
        kcal_total_max=sum(f.kcal_max for f in foods),
        confidence=min(1.0, max(0.0, _opt(data.get("confianca")) or 0.0)),
        notes=str(data.get("observacoes") or ""),
        model_id=settings.nutrition_model,
    )
    log.info(
        "nutrition.analyzed",
        request_id=inp.request_id,
        is_food=resultado.is_food,
        foods=len(foods),
        matched=sum(1 for f in foods if f.matched),
    )
    return resultado
