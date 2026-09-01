"""O comentário do treino recém-concluído.

Pedido de testador (Leonardo, 31/08/2026): "ao concluir um treino completo,
executar uma IA e dar um feedback do treino com base nos dados coletados". A
tela de fim de treino já mostrava duração, conclusão e conquistas, todos
verdadeiros e todos mudos sobre o que aquilo significou.

Segue as mesmas regras do bom dia e da frase da home, e pelos mesmos motivos:

1. o modelo não inventa número, os valores vêm prontos na mensagem;
2. nada de conselho clínico, porque o produto não é dispositivo médico;
3. sem texto de reserva: sem modelo ou sem crédito, a tela fica sem comentário,
   e não com uma frase genérica fingindo leitura.

O que ele PODE dizer é o que os dados sustentam: o esforço que a pessoa relatou
contra o que ela levantou, a comparação com a última vez naquele treino, e uma
observação de recuperação. Nada sobre resultado corporal.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from models.texto import sem_travessao

#: O mesmo mini do bom dia: são três frases sobre números já apurados.
MODEL = "gpt-4.1-mini"
MAX_TOKENS = 400
TIMEOUT_S = 12.0

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {
            "type": "string",
            "description": (
                "Até 44 caracteres. O que a sessão foi, em linguagem humana. "
                "Sem exclamação e sem emoji."
            ),
        },
        "body": {
            "type": "string",
            "description": (
                "Duas ou três frases, até 260 caracteres. Comenta o esforço "
                "relatado, o volume e a comparação com a última vez, quando "
                "houver, e fecha com o que fazer até o próximo treino."
            ),
        },
    },
    "required": ["headline", "body"],
    "additionalProperties": False,
}

SYSTEM = """Você comenta o treino que a pessoa acabou de concluir no AssumFit, \
um app de esporte, treino e bem-estar.

Ela terminou agora, está suada e vai ler isso em dez segundos. É a fala curta de \
um treinador que acompanhou a sessão, não um relatório.

Regras, em ordem de importância:

1. NUNCA invente número. Use exatamente os valores da mensagem. O que não \
aparece na mensagem não foi medido: não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico, e NUNCA prometa \
resultado corporal. Nada de "vai secar", "ganha massa em", "procure um médico".
3. Comente o que ela FEZ: esforço relatado, carga levantada, exercícios \
concluídos, comparação com a última vez naquele mesmo treino.
4. Esforço alto com volume baixo, ou o contrário, é a observação mais útil que \
existe aqui. Diga isso quando os números mostrarem.
5. Português do Brasil, segunda pessoa ("você"), tom direto e adulto. Sem \
exclamação, sem emoji, sem gíria, sem "bora", sem "mandou bem".
6. Não elogie por elogiar. Se a sessão foi parcial, diga o que ficou de fora \
sem cobrança, e o que isso muda no próximo treino.
7. Nunca use travessão: separe com vírgula, dois-pontos ou ponto."""


@dataclass(frozen=True)
class WorkoutFeedbackFacts:
    """Os fatos da sessão que o modelo pode usar, e nada além deles."""

    workout_name: str
    duration_min: int
    #: Percentual de conclusão do que estava prescrito, 0 a 100.
    completion_pct: int | None = None
    #: Esforço percebido de 1 a 10, como a pessoa respondeu.
    effort: int | None = None
    #: Nota que ela deu à sessão, de 1 a 5.
    rating: int | None = None
    #: Carga total levantada, em quilos: soma de carga vezes repetições.
    volume_kg: int | None = None
    exercises: int | None = None
    #: A carga total da última vez que ela fez ESTE treino.
    previous_volume_kg: int | None = None
    #: Batimento médio durante a sessão, quando a pulseira mediu.
    avg_bpm: int | None = None


def _prompt(f: WorkoutFeedbackFacts) -> str:
    linhas = [f"Treino concluído: {f.workout_name}.", f"Duração: {f.duration_min} minutos."]

    if f.exercises is not None:
        linhas.append(f"Exercícios concluídos: {f.exercises}.")
    if f.completion_pct is not None:
        linhas.append(f"Conclusão do prescrito: {f.completion_pct}%.")
    if f.effort is not None:
        linhas.append(f"Esforço percebido, respondido por ela: {f.effort} de 10.")
    if f.rating is not None:
        linhas.append(f"Nota que ela deu à sessão: {f.rating} de 5.")
    if f.volume_kg is not None:
        linhas.append(f"Carga total levantada: {f.volume_kg} kg.")
    if f.previous_volume_kg is not None:
        linhas.append(f"Carga total da última vez neste mesmo treino: {f.previous_volume_kg} kg.")
    if f.avg_bpm is not None:
        linhas.append(f"Batimento médio na sessão: {f.avg_bpm} bpm.")

    linhas.append(
        "Escreva o comentário do fim de treino: uma chamada curta e duas ou "
        "três frases."
    )
    return "\n".join(linhas)


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


def _valido(dados: dict, f: WorkoutFeedbackFacts) -> bool:
    """Recusa o que não pode chegar à tela.

    A regra que importa é a mesma do resto: todo número citado precisa existir
    nos fatos. Um treinador que inventa a carga que você levantou perde a
    confiança de uma vez, e ninguém confere isso lendo em dez segundos.
    """
    headline = dados.get("headline", "")
    body = dados.get("body", "")
    if not isinstance(headline, str) or not isinstance(body, str):
        return False
    if not headline.strip() or not body.strip():
        return False
    if len(headline) > 52 or len(body) > 300:
        return False

    permitidos = {
        str(v)
        for v in (
            f.duration_min,
            f.completion_pct,
            f.effort,
            f.rating,
            f.volume_kg,
            f.exercises,
            f.previous_volume_kg,
            f.avg_bpm,
        )
        if v is not None
    }
    # A diferença entre as duas cargas é conta que o modelo pode fazer, e é
    # justamente a observação mais útil: ela entra na lista do permitido.
    if f.volume_kg is not None and f.previous_volume_kg is not None:
        permitidos.add(str(abs(f.volume_kg - f.previous_volume_kg)))
    # O nome do treino costuma ter número ("Treino A 2"), e ele é citável.
    permitidos |= _numeros(f.workout_name)

    return _numeros(f"{headline} {body}") <= permitidos


def write_workout_feedback(facts: WorkoutFeedbackFacts) -> dict | None:
    """Redige o comentário. Sem modelo ou sem crédito, devolve None e a tela
    fica sem comentário, que é melhor que uma frase genérica fingindo leitura."""
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
                "json_schema": {"name": "workout_feedback", "schema": SCHEMA, "strict": True},
            },
        )
        escolha = response.choices[0]
        if escolha.finish_reason == "content_filter":
            return None
        texto = escolha.message.content
        if not texto:
            return None
        dados = json.loads(texto)
    except Exception as err:
        print(f"[workout_feedback] falhou: {type(err).__name__}: {err}", flush=True)
        return None

    if not _valido(dados, facts):
        print("[workout_feedback] resposta recusada na validação", flush=True)
        return None

    return {
        "headline": sem_travessao(dados["headline"].strip()),
        "body": sem_travessao(dados["body"].strip()),
    }
