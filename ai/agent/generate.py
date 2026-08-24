"""Geração do plano: monta o prompt e chama a Anthropic.

O template NÃO passa por `str.format()`, o formato de saída é JSON, e as chaves
do exemplo seriam interpretadas como campos de formatação. O que varia é anexado
como bloco de conteúdo separado.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from agent.catalogo import como_texto, para_o_lugar
from agent.models import WorkoutGenerationInput
from core.logging import get_logger
from core.settings import settings
from llm.client import complete

log = get_logger(__name__)

ROOT = Path(__file__).resolve().parents[1]
SYSTEM_PROMPT = ROOT / "prompts" / "system.md"

#: Marca o fim do prefixo estável do prompt. Instruções e catálogo são idênticos
#: entre gerações, então a Anthropic reaproveita o cache (leitura a ~0,1× do
#: preço) em vez de reprocessar mais de 20 mil tokens a cada plano.
_CACHE_CONTROL = {"type": "ephemeral"}


def _load_system_template() -> str:
    if not SYSTEM_PROMPT.exists():
        raise FileNotFoundError(f"prompt de sistema não encontrado em {SYSTEM_PROMPT}")
    return SYSTEM_PROMPT.read_text(encoding="utf-8")


def _catalog_text(inp: WorkoutGenerationInput) -> str:
    """O catálogo por NOME, já filtrado pelo lugar onde a pessoa treina.

    Era JSON indentado com todos os campos: 42.262 tokens, 81% do prompt. Ver
    `agent/catalogo.py` para o porquê de cada corte.
    """
    return como_texto(para_o_lugar(inp.allowed_exercises, inp.constraints.get("local")))


def _references_text(inp: WorkoutGenerationInput) -> str:
    knowledge = (
        "\n\n---\n\n".join(inp.knowledge) if inp.knowledge else "(nenhuma referencia recuperada)"
    )
    return "# Conhecimento recuperado (use como fundamento)\n" + knowledge


def _person_text(inp: WorkoutGenerationInput) -> str:
    payload = {
        "profile": inp.profile,
        "flags": inp.flags,
        "history_summary": inp.history_summary,
        "constraints": inp.constraints,
    }
    return (
        "# Dados da pessoa (JSON)\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "Gere o plano agora, respondendo SOMENTE o JSON no formato especificado."
    )


def build_generation_system(inp: WorkoutGenerationInput) -> list[dict]:
    """Bloco de sistema: instruções + catálogo permitido.

    Os dois são idênticos entre requisições, então o `cache_control` no último
    bloco faz a Anthropic cachear o prefixo inteiro.
    """
    return [
        {"type": "text", "text": _load_system_template()},
        {"type": "text", "text": _catalog_text(inp), "cache_control": _CACHE_CONTROL},
    ]


def build_generation_user(
    inp: WorkoutGenerationInput, correction: str | None = None
) -> list[dict]:
    """Bloco do usuário: referências (estáveis por flags, cacheadas) + a pessoa.

    As referências são as mesmas para quem tem as mesmas flags clínicas, então
    também entram no cache; o bloco volátil vem por último, fora dele. A
    correção, quando presente, é anexada ao fim para reorientar a re-geração.
    """
    blocks = [
        {"type": "text", "text": _references_text(inp), "cache_control": _CACHE_CONTROL},
        {"type": "text", "text": _person_text(inp)},
    ]
    if correction:
        blocks.append({"type": "text", "text": correction})
    return blocks


_CODE_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def strip_code_fence(text: str) -> str:
    """Remove a cerca markdown que o modelo às vezes adiciona, devolvendo o JSON
    cru. Sem cerca, devolve o texto como está."""
    stripped = text.strip()
    match = _CODE_FENCE.search(stripped)
    return match.group(1).strip() if match else stripped


async def generate_plan(inp: WorkoutGenerationInput, correction: str | None = None) -> str:
    """Devolve o JSON cru do plano candidato, ainda não validado nem julgado."""
    raw = await complete(
        system=build_generation_system(inp),
        user=build_generation_user(inp, correction),
        model=settings.llm_main_model,
        max_tokens=settings.llm_max_tokens,
        effort=settings.llm_effort,
    )
    return strip_code_fence(raw)
