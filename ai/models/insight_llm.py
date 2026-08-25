"""A frase da tela inicial, escrita por um modelo de linguagem.

`insight.py` preenche moldes: o dado escolhe o molde e preenche os números. Isso
garante que nada seja inventado, mas o repertório é finito e a frase repete.
Aqui um LLM redige a partir dos MESMOS fatos já calculados.

O que este módulo NÃO faz, e por que:

1. **Não calcula nada.** Score, componentes, curva e transição continuam saindo
   de `energy_score.py` e `insight.py`, código determinístico, com paridade
   testada contra a implementação TypeScript do app. Um número de saúde que muda
   de valor entre duas chamadas com o mesmo dado seria indefensável.
2. **Não recebe o dado bruto.** O modelo recebe os fatos já apurados, em texto,
   e a instrução de só usar aqueles. Ele redige; não interpreta biometria.
3. **Não decide a ação.** O botão da home continua vindo da faixa de energia,
   porque ele navega para telas específicas do app.

E se falhar, sem chave, sem rede, timeout, resposta fora do formato, devolve
`None` e quem chama usa o molde determinístico. A tela nunca fica sem frase.

## Fornecedor

Desde 21/08/2026 (decisão da fundadora) a frase é redigida pela **API da
OpenAI**. O motivo foi operacional: a tela mostrava o molde quase sempre, e o
log não dizia nada, `write()` saía em silêncio por falta de chave no
contêiner. A troca veio junto com duas regras novas: **chave ausente vira
linha de log** (uma por processo, não uma por chamada), e a Anthropic fica
como segunda via enquanto a chave da OpenAI não estiver em produção, para o
deploy não piorar nada.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from models.insight import HomeInsight
from models.texto import sem_travessao
import time

#: Modelo da OpenAI. A tarefa é redigir duas frases a partir de fatos prontos —
#: a classe "mini" é a régua certa de custo e latência, e esta é a chamada mais
#: FREQUENTE do produto (roda a cada abertura da Home). Troca-se por variável
#: de ambiente, sem deploy de código.
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

#: Segunda via, enquanto a chave da OpenAI não estiver no contêiner.
ANTHROPIC_MODEL = "claude-haiku-4-5"

#: Teto de saída, com folga deliberada.
#:
#: Era 300, e isso truncava o JSON no meio — a resposta chegava sem fechar aspas,
#: `json.loads` estourava, e a frase caía no molde sem nenhuma pista do motivo.
MAX_TOKENS = 1500

#: Segundos. A home mostra o cálculo local enquanto isso; passar disso é pior
#: que a frase determinística, porque a tela fica esperando.
TIMEOUT_S = 8.0

SCHEMA = {
    "type": "object",
    "properties": {
        "eyebrow": {
            "type": "string",
            "description": "Rótulo curto em minúsculas, até 24 caracteres. Ex: 'hora de recuperar'.",
        },
        "headline": {
            "type": "string",
            "description": "Frase principal, até 42 caracteres, sem ponto final.",
        },
        "detail": {
            "type": "string",
            "description": (
                "Duas frases: a primeira nomeia o sinal que está pesando E CITA O NÚMERO "
                "fornecido; a segunda diz o que fazer com isso agora."
            ),
        },
    },
    "required": ["eyebrow", "headline", "detail"],
    "additionalProperties": False,
}

SYSTEM = """Você escreve a frase da tela inicial do AssumFit, um app de esporte, \
treino e bem-estar que lê biometria de uma pulseira.

Sua função é REDIGIR, não avaliar. Todos os números já foram calculados e vêm \
prontos na mensagem.

Regras, em ordem de importância:

1. NUNCA invente, estime ou arredonde um número. Use exatamente os valores dados. \
Se um sinal não aparece na mensagem, ele não foi medido, não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico. O produto não é \
dispositivo médico. Nada de "procure um médico", "pode ser sinal de", "risco de".
3. Fale com a pessoa sobre o dia dela em termos de MOVIMENTO: prontidão para \
treinar, esporte, recuperação, descanso, sono e hidratação. O app incentiva \
treino e bem-estar, produtividade no trabalho (reuniões, foco, tarefas) não é \
o assunto e não deve ser sugerida.
4. Português do Brasil, segunda pessoa ("você"), tom direto e adulto. Sem \
exclamação, sem emoji, sem "vamos lá", sem elogio vazio.
4a. Registro NEUTRO, não coloquial. Escreva "para o", não "pro"; "Aproveite", \
não "Aproveita". A marca é sóbria, nada de gíria ou intimidade forçada.
4b. Capitalização: `eyebrow` todo em minúscula; `headline` e `detail` começam \
com maiúscula. Isso é regra de design da tela, não preferência.
5. O `detail` cita o número do sinal que está pesando. É o que separa observação \
de adivinhação: "sua recuperação está 27 ms abaixo da sua média" vale; "você \
parece cansado" não.
6. Se a mensagem disser que nenhum sinal se destaca, NÃO invente um culpado. \
Diga que o dia está equilibrado e siga para a orientação.
7. Nunca use travessão nem meia-risca fazendo papel de travessão: separe com \
vírgula, dois-pontos ou ponto. É regra de escrita do produto, não estilo.
8. Responda SOMENTE com o JSON pedido: chaves eyebrow, headline e detail."""


@dataclass(frozen=True)
class Facts:
    """Os fatos apurados que o modelo pode usar, e nada além deles."""

    score: int
    level: str
    calibrating: bool
    #: Sinal que mais TIRA do score, com o valor já formatado. `None` quando
    #: nenhum se destaca — caso comum de quem está bem.
    driver: tuple[str, str] | None
    #: Sinal que mais SUSTENTA, mesma forma.
    lift: tuple[str, str] | None
    #: Frase de transição já calculada sobre a curva da pessoa, ou `None`.
    next_label: str | None
    hour: int
    #: Contexto de rotina do onboarding, já resolvido. Ex: "hoje é dia de treino".
    routine: str | None
    #: Fatos do DIA já apurados (treino, esporte, refeições, passos),
    #: em frases curtas separadas por "; ". `None` quando não há nada medido.
    day_notes: str | None = None
    #: O que já foi dito nas últimas horas — para variar, não para citar.
    recent: tuple[str, ...] = ()


# O nível é um enum interno em inglês, e o modelo REPETE o vocabulário que
# recebe: a home chegou a mostrar "um valor da faixa mid" para quem usa o app
# em português (encontrado em 24/08/2026, testando a tela com o texto grande do
# iOS). Nada em inglês entra no prompt sem tradução.
FAIXA_EM_PALAVRAS = {"low": "baixa", "mid": "média", "high": "alta"}


def _prompt(f: Facts) -> str:
    linhas = [
        # "Prontidão", não "energia": é a palavra que a tela usa, e o modelo
        # repete o vocabulário que recebe — nomear diferente aqui faria a home
        # falar duas línguas na mesma dobra.
        f"Prontidão do corpo: {f.score} de 100 (faixa {FAIXA_EM_PALAVRAS.get(f.level, f.level)}).",
        f"Hora do dia: {f.hour}h.",
    ]

    if f.calibrating:
        linhas.append(
            "O app ainda está calibrando: a linha de base pessoal de HRV não tem "
            "dias suficientes, então a comparação é com a faixa da população. "
            "Mencione isso apenas se couber naturalmente."
        )

    if f.driver:
        nome, valor = f.driver
        linhas.append(f"Sinal que mais PUXA PARA BAIXO: {nome}, {valor}.")
    if f.lift:
        nome, valor = f.lift
        linhas.append(f"Sinal que mais SUSTENTA: {nome}, {valor}.")
    if not f.driver and not f.lift:
        linhas.append(
            "Nenhum sinal isolado se destaca hoje, para cima ou para baixo. "
            "Não invente um responsável."
        )

    if f.next_label:
        linhas.append(f"Transição já calculada na curva do dia: {f.next_label}.")
    if f.routine:
        linhas.append(f"Contexto da rotina: {f.routine}.")
    if f.day_notes:
        linhas.append(
            f"Fatos do dia da pessoa: {f.day_notes}. "
            "Teça NO MÁXIMO um deles no texto, o mais relevante para a orientação "
            "de agora. Não liste todos; não cobre o que não foi feito, apenas oriente."
        )

    if f.recent:
        linhas.append(
            "Frases mostradas nas últimas horas: "
            + " | ".join(f"\"{r}\"" for r in f.recent)
            + ". NÃO repita a forma nem o conselho delas: mude o ângulo (o que o "
            "corpo está fazendo, o que o horário pede, o que a rotina permite) e a "
            "ação sugerida. Ler a mesma frase de novo ensina a pessoa a ignorar a tela."
        )

    return "\n".join(linhas)


#: Avisar UMA vez por processo que não há chave nenhuma. Antes, `write()` saía
#: em silêncio, e "o modelo nunca foi chamado" e "o modelo falhou" eram
#: indistinguíveis no log — foi assim que a home ficou dias no molde sem que
#: nada acusasse (ago/2026).
_avisou_sem_chave = False


def write(facts: Facts, fallback: HomeInsight) -> HomeInsight | None:
    """Redige a frase. `None` em qualquer falha, quem chama usa o molde.

    `fallback` entra para preservar o que o modelo NÃO decide: a ação do botão
    e o rótulo de transição, ambos calculados.
    """
    global _avisou_sem_chave

    tem_openai = bool(os.environ.get("OPENAI_API_KEY"))
    tem_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
    if not tem_openai and not tem_anthropic:
        if not _avisou_sem_chave:
            print("[insight_llm] sem OPENAI_API_KEY nem ANTHROPIC_API_KEY: a home fica no molde", flush=True)
            _avisou_sem_chave = True
        return None

    # OpenAI primeiro; se ela FALHAR (não só se faltar a chave), a Anthropic
    # tenta antes de entregar o molde. A primeira versão só caía na segunda via
    # quando a chave da OpenAI estava ausente, e no primeiro dia a conta da
    # OpenAI estava sem créditos (429 insufficient_quota): chave presente,
    # chamada falhando, e a home no molde com a Anthropic parada ao lado.
    #
    # Conta sem crédito não é falha passageira: ela vai falhar em TODAS as
    # requisições até alguém pagar. Insistir custa uma chamada perdida e a
    # latência dela antes de cada texto (visto no deploy de 24/08, com o log
    # cheio de 429 e o texto saindo pela Anthropic). `_openai_fora_ate` é a
    # trégua: depois de um erro de cota, a OpenAI sai da frente por um tempo, e
    # a próxima requisição vai direto a quem está funcionando.
    dados = _redigir_openai(facts) if tem_openai and not _openai_em_trégua() else None
    if dados is None and tem_anthropic:
        dados = _redigir_anthropic(facts)

    if dados is None:
        return None

    if not _plausivel(dados, facts):
        print(f"[insight_llm] recusado pela checagem: {dados}", flush=True)
        return None

    return HomeInsight(
        # `sem_travessao` é higiene de pontuação, não reescrita: o prompt proíbe
        # o travessão e o modelo o usa mesmo assim, de vez em quando.
        eyebrow=sem_travessao(dados["eyebrow"]),
        headline=sem_travessao(dados["headline"]),
        detail=sem_travessao(dados["detail"]),
        # Ação e transição continuam do cálculo: a primeira navega para telas
        # do app, a segunda é resultado de varrer a curva.
        action=fallback.action,
        next_label=fallback.next_label,
        next_hour=fallback.next_hour,
        driver_key=fallback.driver_key,
        driver_label=fallback.driver_label,
        context=fallback.context,
        # Marca a origem: dá para separar, no banco e no log, a frase redigida
        # da que veio do molde — sem isso não há como avaliar a qualidade de uma
        # contra a outra depois.
        source="llm",
    )


#: Até quando a OpenAI fica fora, em epoch. Zero é "disponível".
_openai_fora_ate = 0.0
#: Quanto dura a trégua depois de um erro de COTA (a conta não se recupera
#: sozinha em minutos; meia hora só evita que um pagamento demore a valer).
TREGUA_DE_COTA_S = 1800


def _openai_em_trégua() -> bool:
    return time.time() < _openai_fora_ate


def _openai_fora_por_cota(err: Exception) -> bool:
    """O erro é de conta sem crédito, e não uma falha passageira?"""
    texto = f"{type(err).__name__}: {err}".lower()
    return "insufficient_quota" in texto or "credit_balance_exhausted" in texto


def _redigir_openai(facts: Facts) -> dict | None:
    """Uma chamada à OpenAI com saída presa ao esquema. `None` em qualquer falha."""
    try:
        from openai import OpenAI
    except ImportError:
        print("[insight_llm] pacote openai não instalado", flush=True)
        return None

    try:
        client = OpenAI(timeout=TIMEOUT_S, max_retries=1)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": _prompt(facts)},
            ],
            # `strict` faz a API garantir a FORMA: três chaves, sem extras. O
            # CONTEÚDO continua passando por `_plausivel`, que é quem barra
            # número inventado.
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "home_insight", "schema": SCHEMA, "strict": True},
            },
        )
        escolha = response.choices[0]
        # Recusa do classificador vem como campo próprio, com `content` vazio.
        if getattr(escolha.message, "refusal", None):
            print(f"[insight_llm] openai recusou: {escolha.message.refusal[:120]}", flush=True)
            return None
        texto = escolha.message.content
        if not texto:
            print(f"[insight_llm] openai sem texto (finish_reason={escolha.finish_reason})", flush=True)
            return None
        return json.loads(texto)
    except Exception as err:
        # Rede, chave inválida, timeout, JSON quebrado: todos têm a mesma
        # resposta correta — cair no molde. Mas o MOTIVO vai para o log: sem
        # isso, "a frase não veio" e "a frase veio errada" ficam
        # indistinguíveis, e não há como saber se o modelo está sequer sendo
        # chamado.
        global _openai_fora_ate
        if _openai_fora_por_cota(err):
            _openai_fora_ate = time.time() + TREGUA_DE_COTA_S
            print(
                f"[insight_llm] openai sem crédito: fora por {TREGUA_DE_COTA_S // 60} min, "
                "o texto sai pela anthropic",
                flush=True,
            )
        else:
            print(f"[insight_llm] openai falhou: {type(err).__name__}: {err}", flush=True)
        return None


def _redigir_anthropic(facts: Facts) -> dict | None:
    """Segunda via, idêntica à versão anterior deste módulo."""
    try:
        import anthropic
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic(timeout=TIMEOUT_S, max_retries=1)
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            # NEM `thinking` NEM `effort`: o Haiku 4.5 é anterior à família que
            # aceita `output_config.effort` e REJEITA o parâmetro com 400.
            output_config={
                "format": {"type": "json_schema", "schema": SCHEMA},
            },
            messages=[{"role": "user", "content": _prompt(facts)}],
        )
        if response.stop_reason == "refusal":
            return None
        texto = next((b.text for b in response.content if b.type == "text"), None)
        if not texto:
            return None
        return json.loads(texto)
    except Exception as err:
        print(f"[insight_llm] anthropic falhou: {type(err).__name__}: {err}", flush=True)
        return None


def _plausivel(dados: dict, facts: Facts) -> bool:
    """Barreira final: o texto pode ser recusado, mas nunca corrigido.

    O esquema garante a forma, não o conteúdo. Estas checagens pegam o que dá
    para verificar mecanicamente, comprimento absurdo e, principalmente, número
    que não foi fornecido. Reescrever a saída do modelo seria pior: produziria
    uma frase que nem o modelo nem o molde escreveram.
    """
    if any(not isinstance(dados.get(k), str) for k in ("eyebrow", "headline", "detail")):
        return False
    if len(dados["eyebrow"]) > 32 or len(dados["headline"]) > 60:
        return False
    if len(dados["detail"]) > 320:
        return False

    permitidos = {str(facts.score), str(facts.hour)}
    for par in (facts.driver, facts.lift):
        if par:
            permitidos.update(_numeros(par[1]))
    if facts.next_label:
        permitidos.update(_numeros(facts.next_label))
    # O contexto de rotina também vai no prompt e também carrega número — "8
    # horas sentado" vem do perfil. Sem esta linha o guarda rejeitava texto
    # legítimo por citar um dado que ELE MESMO forneceu ao modelo.
    if facts.routine:
        permitidos.update(_numeros(facts.routine))
    # Idem para os fatos do dia: passos, kcal e minutos vêm todos daqui.
    if facts.day_notes:
        permitidos.update(_numeros(facts.day_notes))

    # Todo número no texto tem que ter vindo dos fatos. É a checagem que impede
    # a falha mais grave possível aqui: um valor biométrico inventado com cara
    # de medição.
    # Números GENÉRICOS passam: "37 de 100", "por cinco minutos", "às 5h",
    # "8 horas sentado". A guarda existe contra medição inventada ("HRV de 52
    # ms" quando é 48) — e medição nunca é 100 nem cabe em um relógio. Antes
    # disto, 217 textos em 14 h foram recusados por causa do "de 100", e o app
    # mostrava o molde quase sempre (ago/2026).
    return all(n in permitidos or _generico(n) for n in _numeros(dados["detail"]))


def _generico(n: str) -> bool:
    """Escala (100) e números de relógio/duração curta (0–24) não são medição."""
    return n == "100" or (n.isdigit() and int(n) <= 24)


def _numeros(texto: str) -> set[str]:
    saida: set[str] = set()
    atual = ""
    for ch in texto:
        if ch.isdigit():
            atual += ch
        elif atual:
            saida.add(atual)
            atual = ""
    if atual:
        saida.add(atual)
    return saida
