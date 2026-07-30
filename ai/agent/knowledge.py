"""Recuperação das referências clínicas que fundamentam a prescrição.

**Determinística de propósito.** A partir das flags e do objetivo, GARANTE que
as referências certas entrem no prompt, lendo os arquivos direto do disco. Não
depende de busca por similaridade, e é essa a razão de existir: quem é
cardiopata precisa receber a referência de cardiopatas SEMPRE — não "quando o
recuperador achar que é relevante".

Não há banco vetorial aqui. Se um dia entrar busca semântica, ela COMPLEMENTA
esta camada; nunca a substitui.
"""

from __future__ import annotations

from pathlib import Path

from agent.models import WorkoutGenerationInput
from core.logging import get_logger

log = get_logger(__name__)

ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_DIR = ROOT / "knowledge" / "references"

#: Teto de caracteres por referência. Sem ele, três referências longas sozinhas
#: consomem o orçamento de contexto que o catálogo também precisa.
MAX_CHARS_PER_REF = 6000

#: Sempre incluída — fundamentos de prescrição.
ALWAYS_REFS = ["fundamentos-prescricao"]

FLAG_TO_REF = {
    "cardiopata": "condicao-cardiopatas",
    "arritmia": "condicao-cardiopatas",
    "pos-iam": "condicao-cardiopatas",
    "dor-toracica-nao-investigada": "condicao-cardiopatas",
    "hipertensao": "condicao-hipertensos",
    "diabetico": "condicao-diabeticos",
    "obeso": "condicao-obesos",
    "lesao-ortopedica": "condicao-patologias-ortopedicas",
    "hernia": "condicao-patologias-ortopedicas",
    "artrose": "condicao-patologias-ortopedicas",
    "lombalgia": "condicao-patologias-ortopedicas",
    "saude-mental": "condicao-saude-mental",
    "depressao": "condicao-saude-mental",
    "ansiedade": "condicao-saude-mental",
    "respiratorio": "condicao-respiratorios",
    "asma": "condicao-respiratorios",
    "dpoc": "condicao-respiratorios",
    "cancer": "condicao-cancer",
    "osteoporose": "condicao-osteoporose",
    "osteopenia": "condicao-osteoporose",
    "neurologico": "condicao-neurologicos",
    "parkinson": "condicao-neurologicos",
    "avc": "condicao-neurologicos",
    "glp1": "condicao-glp1-ozempic",
    "ozempic": "condicao-glp1-ozempic",
    "gestante": "publico-gestantes",
    "pos-parto": "publico-gestantes",
    "idoso": "publico-idosos",
    "iniciante": "publico-iniciantes",
    "40-mais": "publico-40-mais",
}

OBJETIVO_TO_REF = {
    "hipertrofia": "objetivo-hipertrofia",
    "emagrecimento": "objetivo-emagrecimento",
    "gluteo": "objetivo-gluteo",
    "performance": "objetivo-performance",
    "reabilitacao": "objetivo-reabilitacao",
}

MODALIDADE_TO_REF = {
    "musculacao": "modalidade-forca",
    "musculação": "modalidade-forca",
    "forca": "modalidade-forca",
    "powerlifting": "modalidade-forca",
    "funcional": "modalidade-funcional",
    "calistenia": "modalidade-calistenia",
    "hiit": "modalidade-hiit",
    "corrida": "modalidade-corrida",
    "caminhada": "modalidade-corrida",
    "natacao": "modalidade-natacao",
    "natação": "modalidade-natacao",
    "ciclismo": "modalidade-ciclismo",
    "lutas": "modalidade-lutas",
    "yoga": "modalidade-yoga",
    "pilates": "modalidade-pilates",
    "crossfit": "modalidade-cross-training",
    "cross-training": "modalidade-cross-training",
    "mobilidade": "modalidade-mobilidade",
    "outdoor": "modalidade-outdoor",
    "futebol": "modalidade-esportes-coletivos",
    "esportes-coletivos": "modalidade-esportes-coletivos",
}


def _norm(value: str) -> str:
    return value.strip().lower().replace("_", "-").replace(" ", "-")


def _modalidades(inp: WorkoutGenerationInput) -> list[str]:
    raw = inp.profile.get("modalidades") or inp.profile.get("modalidade") or []
    if isinstance(raw, str):
        raw = [raw]
    return [_norm(m) for m in raw]


def select_references(inp: WorkoutGenerationInput) -> list[str]:
    """Lista ordenada e sem repetição das referências a incluir."""
    refs: list[str] = list(ALWAYS_REFS)

    for flag in inp.flags:
        ref = FLAG_TO_REF.get(_norm(flag))
        if ref:
            refs.append(ref)

    objetivo = _norm(str(inp.profile.get("objetivo", "")))
    if objetivo in OBJETIVO_TO_REF:
        refs.append(OBJETIVO_TO_REF[objetivo])

    modalidades = _modalidades(inp)
    for modalidade in modalidades:
        if modalidade in MODALIDADE_TO_REF:
            refs.append(MODALIDADE_TO_REF[modalidade])

    # Duas ou mais modalidades na semana: treino concorrente tem interferência
    # própria, e ignorá-la é como prescrever os dois planos separados e somar.
    if len(modalidades) >= 2:
        refs.append("multiatividade-orquestrador")

    seen: set[str] = set()
    out: list[str] = []
    for ref in refs:
        if ref not in seen:
            seen.add(ref)
            out.append(ref)
    return out


def _read_reference(stem: str) -> str | None:
    path = KNOWLEDGE_DIR / f"{stem}.md"
    if not path.exists():
        log.warning("knowledge.ref_missing", stem=stem)
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    if len(text) > MAX_CHARS_PER_REF:
        text = text[:MAX_CHARS_PER_REF] + "\n[... referencia truncada ...]"
    return f"## Referencia: {stem}\n{text}"


def gather_knowledge(inp: WorkoutGenerationInput) -> list[str]:
    blocks: list[str] = []
    for stem in select_references(inp):
        block = _read_reference(stem)
        if block:
            blocks.append(block)
    log.info("knowledge.gathered", refs=len(blocks))
    return blocks
