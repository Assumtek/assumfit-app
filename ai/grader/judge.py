"""Avaliação do plano por modelo — nota de 0 a 10 por critério."""

from __future__ import annotations

import json
import re
from textwrap import dedent

from core.settings import settings
from grader.criteria import Criterion
from llm.client import complete

JUDGE_SYSTEM = dedent(
    """\
    Voce e um avaliador clinico rigoroso de planos de treino. Para cada criterio recebido,
    atribua uma nota inteira de 0 a 10 e justifique em uma frase curta.

    Priorize seguranca: qualquer exercicio contraindicado para o perfil deve derrubar a
    nota de seguranca. Considere que o plano vai direto para a pessoa, que treina sozinha,
    sem nenhum profissional acompanhando a execucao.

    A PRIMEIRA frase de cada "reason" e mostrada a pessoa que vai treinar, como
    "o que foi contido no seu plano". Escreva-a para ela: o que foi limitado e por
    que, em palavras comuns — sem siglas (RIR, ACSM), sem "tier", "flag", "conta
    nova", "nao pode ser confirmado" ou "hierarquia de seguranca", e sem soar como
    desconfianca do que ela declarou ("mantive cargas moderadas nas duas primeiras
    semanas para calibrar", nao "o nivel declarado nao foi confirmado"). O detalhe
    tecnico vem DEPOIS dessa frase, para o revisor.

    Responda APENAS um JSON valido no formato:
    {"criterios": [{"name": "...", "score": 0-10, "reason": "..."}]}
    """
)


async def judge(*, question: str, answer: str, context: str, criteria: list[Criterion]) -> dict:
    criteria_json = json.dumps([c.model_dump() for c in criteria], ensure_ascii=False, indent=2)
    # As referências são estáveis por combinação de flags — bloco cacheado. O
    # perfil, o plano e os critérios variam a cada avaliação e vêm depois.
    user = [
        {
            "type": "text",
            "text": "# Contexto clinico recuperado (referencias)\n" + (context or "(vazio)"),
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": (
                "# Perfil e solicitacao\n"
                f"{question}\n\n"
                "# Plano a avaliar\n"
                f"{answer}\n\n"
                "# Criterios\n"
                f"{criteria_json}"
            ),
        },
    ]
    # Teto folgado de propósito, por duas razões que se somam. Um plano de sete
    # dias com três fases por dia rende um veredito longo; e o raciocínio vem
    # LIGADO por padrão, consumindo o MESMO orçamento de `max_tokens`. Aqui ele
    # fica ligado de propósito — avaliar segurança clínica é exatamente o que se
    # quer que o modelo pense —, então o orçamento precisa caber os dois.
    #
    # Veredito truncado vira JSON inválido → critérios vazios → nota 0 → plano
    # bom bloqueado por um motivo que não é o dele.
    raw = await complete(
        system=JUDGE_SYSTEM,
        user=user,
        model=settings.llm_grader_model,
        max_tokens=12000,
        effort=settings.llm_effort,
    )
    return _parse_json(raw)


def _parse_json(raw: str) -> dict:
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return {"criterios": []}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"criterios": []}
