"""O que este número significa PARA ESTA PESSOA.

Pedido de testador, pelo exemplo: "tive um sono 92% ótimo, mas o que isso
significa?". O app dizia o valor e a avaliação, e parava aí: quem não sabe o
que é um score de sono fica com um número bonito e nenhuma leitura.

A diferença para as outras camadas de texto que já existem (frase da home, bom
dia, resumo semanal, comentário do treino) é o gatilho e o escopo. Aquelas
falam sozinhas, sobre o conjunto, e são sobre o DIA. Esta responde a um toque,
sobre UMA medida, e o material dela é o histórico da própria pessoa: onde esse
número cai na média dela, quando foi a última vez assim, o que mais pesa no
caso dela.

Sem histórico não há o que comparar, e aí a rota devolve 503 em vez de um
texto genérico com cara de personalizado.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from models.texto import sem_travessao

#: O mesmo mini das outras camadas: são três frases sobre números apurados.
MODEL = "gpt-4.1-mini"
MAX_TOKENS = 500
TIMEOUT_S = 12.0

SCHEMA = {
    "type": "object",
    "properties": {
        "de_onde_vem": {
            "type": "string",
            "description": (
                "Uma frase: de que partes este número é feito, com os valores "
                "que vieram na mensagem. Sem fórmula e sem percentual de peso."
            ),
        },
        "onde_voce_esta": {
            "type": "string",
            "description": (
                "Uma frase comparando com o histórico DESTA pessoa: a média "
                "dela, o melhor ou pior recente. Só com os números da mensagem."
            ),
        },
        "o_que_mexe": {
            "type": "string",
            "description": (
                "Uma frase sobre o que mais influencia este número no caso "
                "dela, a partir do que a mensagem diz. Sem conselho clínico e "
                "sem promessa de resultado."
            ),
        },
    },
    "required": ["de_onde_vem", "onde_voce_esta", "o_que_mexe"],
    "additionalProperties": False,
}

SYSTEM = """Você explica UM número do AssumFit para a pessoa que acabou de tocar \
nele, num app de esporte, treino e bem-estar que lê biometria de uma pulseira.

Ela viu um número e uma avaliação ("sono 92, ótimo") e quer saber o que isso \
quer dizer no caso dela. São três frases curtas, não uma aula.

Regras, em ordem de importância:

1. NUNCA invente número. Use exatamente os valores da mensagem. O que não \
aparece na mensagem não foi medido: não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico, e NUNCA prometa \
resultado. Nada de "procure um médico", "pode ser sinal de", "isso vai baixar".
3. A comparação é com o HISTÓRICO DELA, não com norma de população, a menos \
que a mensagem traga a norma explicitamente.
4. Não explique a fórmula nem cite pesos em porcentagem: ela quer saber o que o \
número diz, não como a conta é feita.
5. Português do Brasil, segunda pessoa ("você"), tom direto e adulto. Sem \
exclamação, sem emoji, sem gíria.
6. Se a mensagem disser que falta histórico para comparar, diga isso em vez de \
comparar com nada.
7. Nunca use travessão: separe com vírgula, dois-pontos ou ponto."""


@dataclass(frozen=True)
class FatosDaMetrica:
    """O que se sabe sobre a medida tocada, e nada além disso."""

    #: "sono", "energia", "hrv", "estresse", "repouso".
    metrica: str
    rotulo: str
    valor: float
    unidade: str
    #: A avaliação que a tela já mostra ("ótimo", "pode melhorar").
    avaliacao: str
    #: Partes que compõem o número, já apuradas ("7h10 dormidas", "22% profundo").
    componentes: list[str] = field(default_factory=list)
    #: Média da própria pessoa na janela recente, quando há histórico.
    media_pessoal: float | None = None
    dias_de_historico: int = 0
    #: Melhor e pior valor recente, com a data, quando há.
    melhor: str | None = None
    pior: str | None = None
    #: O que mais se relaciona com este número no histórico dela, em texto.
    relacao: str | None = None


def _prompt(f: FatosDaMetrica) -> str:
    linhas = [f"Medida: {f.rotulo} = {f.valor:g} {f.unidade}, avaliada como {f.avaliacao}."]
    if f.componentes:
        linhas.append("Do que ela é feita: " + "; ".join(f.componentes) + ".")
    if f.media_pessoal is not None and f.dias_de_historico > 0:
        linhas.append(
            f"A média desta pessoa nos últimos {f.dias_de_historico} dias medidos é "
            f"{f.media_pessoal:g} {f.unidade}."
        )
    else:
        linhas.append("Ainda não há histórico suficiente desta pessoa para comparar.")
    if f.melhor:
        linhas.append(f"Melhor recente: {f.melhor}.")
    if f.pior:
        linhas.append(f"Pior recente: {f.pior}.")
    if f.relacao:
        linhas.append(f"No histórico dela: {f.relacao}.")
    linhas.append("Explique este número em três frases, uma por campo.")
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


def _valido(dados: dict, f: FatosDaMetrica) -> bool:
    """Número citado tem que existir nos fatos, como em toda camada de texto."""
    campos = ["de_onde_vem", "onde_voce_esta", "o_que_mexe"]
    if any(not isinstance(dados.get(c), str) or not dados[c].strip() for c in campos):
        return False
    if any(len(dados[c]) > 240 for c in campos):
        return False

    permitidos: set[str] = set()
    fonte = [
        f"{f.valor:g}",
        f"{f.media_pessoal:g}" if f.media_pessoal is not None else "",
        str(f.dias_de_historico),
        *f.componentes,
        f.melhor or "",
        f.pior or "",
        f.relacao or "",
    ]
    for t in fonte:
        permitidos |= _numeros(t)

    return _numeros(" ".join(dados[c] for c in campos)) <= permitidos


def explicar_metrica(f: FatosDaMetrica) -> dict | None:
    """Sem modelo, sem crédito ou sem resposta válida, devolve None."""
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
                {"role": "user", "content": _prompt(f)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "explicar", "schema": SCHEMA, "strict": True},
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
        print(f"[explicar] falhou: {type(err).__name__}: {err}", flush=True)
        return None

    if not _valido(dados, f):
        print("[explicar] resposta recusada na validação", flush=True)
        return None

    return {k: sem_travessao(dados[k].strip()) for k in ("de_onde_vem", "onde_voce_esta", "o_que_mexe")}
