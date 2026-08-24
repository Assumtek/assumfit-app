"""O resumo da semana, redigido pelo modelo.

Pedido de testador (22/08/2026): todo domingo, uma visão consolidada da semana
com ações acionáveis, levando em conta os feedbacks dados ao concluir as
atividades. Sem modelo, devolve None e a rota responde 503: texto pronto de
reserva não entra (decisão da fundadora, 22/08/2026).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from models.texto import sem_travessao_em

#: Migrado para a OpenAI em 24/08/2026 (decisão da fundadora, "tudo GPT").
MODEL = "gpt-4.1-mini"
MAX_TOKENS = 900
TIMEOUT_S = 15.0

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "maxLength": 80},
        "resumo": {"type": "string", "maxLength": 420},
        "acoes": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string", "maxLength": 60},
                    "porque": {"type": "string", "maxLength": 160},
                },
                "required": ["titulo", "porque"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "resumo", "acoes"],
    "additionalProperties": False,
}

SYSTEM = """Você escreve o resumo semanal do AssumFit, um app de esporte, treino e \
bem-estar que lê biometria de uma pulseira. A pessoa lê no domingo de manhã.
Regras, em ordem de importância:
1. NUNCA invente número. Use só os valores da mensagem. Sinal ausente não foi medido: não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico.
3. O resumo conta a semana em movimento, sono, hidratação e alimentação, em até três frases.
4. As ações são concretas e executáveis na semana seguinte (ajustar o treino, dormir mais cedo num \
dia específico, registrar água), no máximo três, e cada uma diz POR QUE, apoiada num número da mensagem.
5. As notas que a pessoa deu ao concluir as atividades (1 a 5) pesam: nota baixa repetida pede \
ajuste de treino; nota alta pede manter.
6. Português do Brasil, segunda pessoa, tom direto e adulto. Sem exclamação, sem emoji, sem gíria.
7. Nunca use travessão: separe com vírgula, dois-pontos ou ponto."""


@dataclass(frozen=True)
class WeeklyFacts:
    atividades: int
    minutos: int
    esportes: int
    kcal: int
    nota_media: float | None
    notas: tuple[int, ...] = ()
    treinos: tuple[str, ...] = ()
    sono_medio: int | None = None
    sono_minutos_medio: int | None = None
    passos_medio: int | None = None
    agua_media_ml: int | None = None
    dias_com_agua: int = 0
    refeicoes: int = 0
    plano_dias: int | None = None
    extra: dict = field(default_factory=dict)


def _prompt(f: WeeklyFacts) -> str:
    linhas = [
        f"Atividades concluídas: {f.atividades} ({f.minutos} minutos no total; {f.esportes} sessões de esporte, {f.kcal} kcal).",
    ]
    if f.treinos:
        linhas.append("Treinos feitos: " + ", ".join(f.treinos) + ".")
    if f.plano_dias is not None:
        linhas.append(f"O plano previa {f.plano_dias} treinos na semana.")
    if f.notas:
        linhas.append(f"Notas dadas ao concluir (1 a 5): {', '.join(str(n) for n in f.notas)}; média {f.nota_media}.")
    if f.sono_medio is not None:
        dur = f" ({f.sono_minutos_medio} minutos por noite)" if f.sono_minutos_medio is not None else ""
        linhas.append(f"Sono: score médio {f.sono_medio}{dur}.")
    if f.passos_medio is not None:
        linhas.append(f"Passos: média de {f.passos_medio} por dia.")
    if f.agua_media_ml is not None:
        linhas.append(f"Água: média de {f.agua_media_ml} ml nos {f.dias_com_agua} dias com registro.")
    if f.refeicoes:
        linhas.append(f"Refeições registradas: {f.refeicoes}.")
    return "\n".join(linhas)


def write_weekly(facts: WeeklyFacts) -> dict | None:
    if not os.environ.get("OPENAI_API_KEY"):
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    try:
        client = OpenAI(timeout=TIMEOUT_S, max_retries=1)
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": _prompt(facts)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "weekly", "schema": SCHEMA, "strict": True},
            },
        )
        texto = response.choices[0].message.content
        if not texto:
            return None
        dados = json.loads(texto)
        # Travessão se troca por vírgula, não custa o resumo inteiro: descartar
        # aqui era jogar fora um texto bom por um sinal de pontuação.
        return sem_travessao_em(dados)
    except Exception as err:  # noqa: BLE001
        print(f"[weekly] openai falhou: {type(err).__name__}: {err}", flush=True)
        return None
