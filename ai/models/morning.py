"""A saudação da manhã, a notificação das 7h30.

O texto era um molde de seis frases escolhidas por faixa de temperatura, e
chegava igual todo dia: quem usa o app por uma semana já viu todas. Aqui ele
passa pelo mesmo caminho da frase da home, o modelo REDIGE sobre fatos que já
foram apurados. Não há texto de reserva: sem modelo, a rota responde 503 e a
manhã fica sem notificação (decisão da fundadora, 22/08/2026).

Duas regras herdadas do insight da home, e pelas mesmas razões:

1. o modelo não inventa número, os valores vêm prontos na mensagem;
2. nada de conselho clínico: o produto não é dispositivo médico.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from models.texto import sem_travessao

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 400
TIMEOUT_S = 12.0

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": (
                "Até 40 caracteres. A chamada da notificação, sem emoji e sem "
                "exclamação. Começa com maiúscula."
            ),
        },
        "body": {
            "type": "string",
            "description": (
                "Uma ou duas frases, até 150 caracteres no total. Cita a "
                "temperatura prevista e diz o que a manhã pede."
            ),
        },
    },
    "required": ["title", "body"],
    "additionalProperties": False,
}

SYSTEM = """Você escreve a notificação matinal do AssumFit, um app de esporte, \
treino e bem-estar que lê biometria de uma pulseira.

A pessoa vai ler isso na tela de bloqueio, recém-acordada. É uma frase curta \
que dá o tom do dia, não um relatório.

Regras, em ordem de importância:

1. NUNCA invente número. Use exatamente os valores da mensagem. Sinal que não \
aparece na mensagem não foi medido: não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico. Nada de "procure um \
médico", "pode ser sinal de", "risco de".
3. O assunto é o DIA DA PESSOA em termos de movimento: treinar, se mover, \
recuperar, hidratar, dormir. Produtividade no trabalho não é o assunto.
4. Português do Brasil, segunda pessoa ("você"), tom direto e adulto. Sem \
exclamação, sem emoji, sem gíria, sem "bora", sem "vamos lá". Escreva "para o", \
nunca "pro".
5. NÃO repita a saudação "Bom dia" no corpo, ela já está no título quando cabe.
6. Se a mensagem disser que há treino marcado, a frase pode convidar para ele. \
Se disser que é dia de descanso, NÃO empurre treino.
7. Nunca escreva valor biométrico no texto: a tela de bloqueio é vista por quem \
passa perto. Temperatura do tempo pode; batimento, pressão e oxigenação, não.
8. A mensagem será lida NA MANHÃ do dia em questão: escreva "hoje", nunca "amanhã".
9. Se a mensagem listar frases recentes, não repita nenhuma delas, nem a estrutura.
10. Nunca use travessão: separe com vírgula, dois-pontos ou ponto."""


@dataclass(frozen=True)
class MorningFacts:
    """Os fatos da manhã que o modelo pode usar, e nada além deles."""

    #: Previsão para as 7h de amanhã, em graus Celsius, já arredondada.
    temperature_c: int | None
    humidity_pct: int | None
    #: Há treino marcado no plano para amanhã.
    trains_tomorrow: bool
    #: Nome do treino de amanhã, quando houver ("Corrida — tiros curtos").
    workout_name: str | None = None
    #: Sequência de dias com movimento — só entra quando vale a pena citar.
    streak_days: int = 0
    #: Cidade, para a frase soar de quem está aqui e não de um servidor.
    city: str | None = None
    #: Os últimos textos entregues: o modelo não pode repetir nenhum.
    recent: tuple[str, ...] = ()


def _prompt(f: MorningFacts) -> str:
    linhas = (
        [f"Previsão para as 7h de amanhã: {f.temperature_c}°C, umidade {f.humidity_pct}%."]
        if f.temperature_c is not None and f.humidity_pct is not None
        else ["Sem previsão do tempo para amanhã."]
    )
    if f.recent:
        linhas.append("Frases recentes, que NÃO podem se repetir: " + " | ".join(f.recent))
    if f.city:
        linhas.append(f"Cidade: {f.city}.")
    if f.trains_tomorrow:
        linhas.append(
            f"Amanhã é dia de treino no plano: {f.workout_name}."
            if f.workout_name
            else "Amanhã é dia de treino no plano."
        )
    else:
        linhas.append("Amanhã é dia de descanso no plano.")
    # A sequência só entra quando existe de verdade e já significa hábito —
    # "1 dia de sequência" não é conquista, é ruído.
    if f.streak_days >= 3:
        linhas.append(f"Sequência atual de movimento: {f.streak_days} dias.")
    linhas.append(
        "Escreva a notificação das 7h30 de amanhã: título curto e corpo de uma "
        "ou duas frases."
    )
    return "\n".join(linhas)


def _valido(dados: dict, f: MorningFacts) -> bool:
    """Recusa o que não pode chegar à tela de bloqueio.

    O modelo é bom, não infalível: um número inventado numa notificação de
    saúde é pior que o molde, porque ninguém tem como conferir de relance.
    """
    title = dados.get("title", "")
    body = dados.get("body", "")
    if not isinstance(title, str) or not isinstance(body, str):
        return False
    if not title.strip() or not body.strip():
        return False
    if len(title) > 48 or len(body) > 180:
        return False

    # Todo número citado tem que existir nos fatos. A temperatura é o único
    # valor que o texto pode carregar — o resto é adivinhação.
    permitidos = {str(f.temperature_c), str(f.humidity_pct), str(f.streak_days)}
    numeros = {n for n in _numeros(f"{title} {body}")}
    return numeros <= permitidos


def _numeros(texto: str) -> set[str]:
    atual, achados = "", set()
    for ch in texto:
        if ch.isdigit():
            atual += ch
        else:
            if atual:
                achados.add(atual)
            atual = ""
    if atual:
        achados.add(atual)
    return achados


def write_morning(facts: MorningFacts) -> dict | None:
    """Redige a saudação. Sem modelo, devolve None: texto pronto de reserva não
    entra (decisão da fundadora, 22/08/2026); a manhã fica em silêncio."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None

    try:
        import anthropic
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic(timeout=TIMEOUT_S, max_retries=1)
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            # Sem `thinking` e sem `effort`: o Haiku 4.5 rejeita `effort` com
            # 400 (visto em produção, ago/2026) e omitir `thinking` já
            # significa "sem thinking" nesta geração.
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": _prompt(facts)}],
        )
        if response.stop_reason == "refusal":
            return None

        texto = next((b.text for b in response.content if b.type == "text"), None)
        if not texto:
            return None
        dados = json.loads(texto)
    except Exception as err:
        print(f"[morning] falhou: {type(err).__name__}: {err}", flush=True)
        return None

    if not _valido(dados, facts):
        print("[morning] resposta recusada na validação", flush=True)
        return None

    return {
        "title": sem_travessao(dados["title"].strip()),
        "body": sem_travessao(dados["body"].strip()),
        "source": "llm",
    }
