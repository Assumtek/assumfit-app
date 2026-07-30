"""Extração de respostas da fala livre da anamnese.

A pessoa abre a entrevista contando o que quer — "tenho 34 anos, treino em
academia há uns meses e quero ganhar massa, consigo ir 4 vezes por semana" — e
este módulo lê esse texto e preenche as perguntas do roteiro que JÁ FORAM
respondidas ali. A entrevista então pergunta só o que faltou, que é o desenho
da anamnese conversacional do MUVX (`AI_EXTRACTED` no contrato de lá).

## O que o modelo NÃO pode preencher

As perguntas do PAR-Q ficam fora da extração por decisão, não por limitação.
"Minha saúde vai bem" não é resposta para "você sente dor no peito ao se
exercitar?" — inferir um "não" clínico de uma frase otimista é exatamente o
tipo de erro que não aparece até machucar alguém. O chamador manda a lista de
perguntas extraíveis, e o PAR-Q nunca está nela.

## Confiança antes de cobertura

O prompt manda omitir o que não estiver EXPLÍCITO. Uma extração errada custa
mais que uma pergunta a mais: a resposta extraída pula a pergunta, e o erro só
seria visto na revisão — por alguém que não sabe que precisa procurá-lo.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from core.logging import get_logger
from core.settings import settings
from llm.client import complete

log = get_logger("agent.extract")

_SYSTEM = """Você extrai respostas de uma fala livre em português para preencher \
um questionário de treino. Devolva SOMENTE um objeto JSON, sem markdown.

Regras:
- Inclua uma chave apenas quando a resposta estiver EXPLÍCITA na fala.
- Para perguntas com opções, o valor precisa ser UMA das opções, letra por letra.
- Pergunta numérica: devolva só o número, sem unidade, convertido para a unidade \
que a pergunta pede. Trocar a unidade dita pela pedida NÃO é dedução — "1,80m" \
para altura em cm é "180", "90kg" para peso em kg é "90", "1h por treino" para \
minutos é "60".
- Se a fala não responde claramente uma pergunta, NÃO inclua a chave.
- Nunca deduza saúde: na dúvida, omita.
- Fala vaga ou fora de tópico → devolva {}.

Exemplo. Perguntas: id `weightKg`: Peso (kg); id `heightCm`: Altura (cm); \
id `daysPerWeek`: Dias por semana (opções: 2, 3, 4, 5); id `injuries`: Lesões.
Fala: "tenho 1,75m e uns 82kg, consigo treinar 4 vezes por semana"
Resposta: {"weightKg": "82", "heightCm": "175", "daysPerWeek": "4"}
(`injuries` fica de fora: a fala não diz nada sobre lesão.)"""


class ExtractQuestion(BaseModel):
    id: str
    label: str
    options: list[str] | None = None


class ExtractInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    questions: list[ExtractQuestion]


async def extract_answers(inp: ExtractInput) -> dict[str, str]:
    """Devolve `{question_id: opção canônica ou texto}` só para o que está explícito."""
    perguntas = "\n".join(
        f"- id `{q.id}`: {q.label}" + (f" (opções: {', '.join(q.options)})" if q.options else "")
        for q in inp.questions
    )
    user = f"Perguntas:\n{perguntas}\n\nFala da pessoa:\n{inp.text}"

    # Modelo barato EXPLÍCITO. Sem isso a extração segue o modelo principal —
    # foi assim que ela migrou para o Sonnet sem ninguém pedir e quebrou junto
    # com ele. Tarefa de extração é tarefa do Haiku por decisão, não por acaso.
    raw = await complete(
        system=_SYSTEM,
        user=user,
        model=settings.llm_chat_model,
        max_tokens=500,
        effort="low",
    )

    try:
        data = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```"))
    except json.JSONDecodeError:
        log.warning("agent.extract.invalid_json")
        return {}

    if not isinstance(data, dict):
        return {}

    # A validação final é NOSSA, não do prompt: opção fora da lista é descartada
    # mesmo que o modelo jure que extraiu. O prompt orienta; o código garante.
    by_id = {q.id: q for q in inp.questions}
    out: dict[str, str] = {}
    for key, value in data.items():
        q = by_id.get(key)
        if q is None or not isinstance(value, str) or not value.strip():
            continue
        if q.options is not None and value not in q.options:
            continue
        out[key] = value.strip()

    log.info("agent.extract.done", asked=len(inp.questions), extracted=len(out))
    return out
