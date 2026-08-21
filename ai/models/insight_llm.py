"""A frase da tela inicial, escrita por um modelo de linguagem.

`insight.py` preenche moldes: o dado escolhe o molde e preenche os números. Isso
garante que nada seja inventado, mas o repertório é finito e a frase repete.
Aqui um LLM redige a partir dos MESMOS fatos já calculados.

O que este módulo NÃO faz, e por que:

1. **Não calcula nada.** Score, componentes, curva e transição continuam saindo
   de `energy_score.py` e `insight.py` — código determinístico, com paridade
   testada contra a implementação TypeScript do app. Um número de saúde que muda
   de valor entre duas chamadas com o mesmo dado seria indefensável.
2. **Não recebe o dado bruto.** O modelo recebe os fatos já apurados, em texto,
   e a instrução de só usar aqueles. Ele redige; não interpreta biometria.
3. **Não decide a ação.** O botão da home continua vindo da faixa de energia,
   porque ele navega para telas específicas do app.

E se falhar — sem chave, sem rede, timeout, resposta fora do formato — devolve
`None` e quem chama usa o molde determinístico. A tela nunca fica sem frase.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from models.insight import HomeInsight

#: Sonnet 5. Medido contra Opus 5 na mesma tarefa: a frase sai equivalente, e
#: redigir duas frases a partir de fatos prontos não é trabalho de modelo de topo.
#: Haiku pela mesma régua do resto (jul/2026): redigir duas frases sobre fatos
#: prontos é exatamente o trabalho dele, e esta é a chamada mais FREQUENTE do
#: produto — roda a cada abertura da Home. O molde determinístico continua
#: sendo o fallback quando o modelo falha.
MODEL = "claude-haiku-4-5"

#: Teto de saída, com folga deliberada.
#:
#: Era 300, e isso truncava o JSON no meio — a resposta chegava sem fechar aspas,
#: `json.loads` estourava, e a frase caía no molde sem nenhuma pista do motivo. A
#: causa é que o thinking é LIGADO POR PADRÃO nos modelos 5 e consome o MESMO
#: orçamento de `max_tokens`: o raciocínio comia os 300 tokens antes do texto.
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
Se um sinal não aparece na mensagem, ele não foi medido — não fale dele.
2. NUNCA dê conselho médico, diagnóstico ou alerta clínico. O produto não é \
dispositivo médico. Nada de "procure um médico", "pode ser sinal de", "risco de".
3. Fale com a pessoa sobre o dia dela em termos de MOVIMENTO: prontidão para \
treinar, esporte, recuperação, descanso, sono e hidratação. O app incentiva \
treino e bem-estar — produtividade no trabalho (reuniões, foco, tarefas) não é \
o assunto e não deve ser sugerida.
4. Português do Brasil, segunda pessoa ("você"), tom direto e adulto. Sem \
exclamação, sem emoji, sem "vamos lá", sem elogio vazio.
4a. Registro NEUTRO, não coloquial. Escreva "para o", não "pro"; "Aproveite", \
não "Aproveita". A marca é sóbria — nada de gíria ou intimidade forçada.
4b. Capitalização: `eyebrow` todo em minúscula; `headline` e `detail` começam \
com maiúscula. Isso é regra de design da tela, não preferência.
5. O `detail` cita o número do sinal que está pesando. É o que separa observação \
de adivinhação: "sua recuperação está 27 ms abaixo da sua média" vale; "você \
parece cansado" não.
6. Se a mensagem disser que nenhum sinal se destaca, NÃO invente um culpado. \
Diga que o dia está equilibrado e siga para a orientação."""


@dataclass(frozen=True)
class Facts:
    """Os fatos apurados que o modelo pode usar — e nada além deles."""

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


def _prompt(f: Facts) -> str:
    linhas = [
        # "Prontidão", não "energia": é a palavra que a tela usa, e o modelo
        # repete o vocabulário que recebe — nomear diferente aqui faria a home
        # falar duas línguas na mesma dobra.
        f"Prontidão do corpo: {f.score} de 100 (faixa: {f.level}).",
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
        linhas.append(f"Sinal que mais PUXA PARA BAIXO: {nome} — {valor}.")
    if f.lift:
        nome, valor = f.lift
        linhas.append(f"Sinal que mais SUSTENTA: {nome} — {valor}.")
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
            "Teça NO MÁXIMO um deles no texto — o mais relevante para a orientação "
            "de agora. Não liste todos; não cobre o que não foi feito, apenas oriente."
        )

    return "\n".join(linhas)


def write(facts: Facts, fallback: HomeInsight) -> HomeInsight | None:
    """Redige a frase. `None` em qualquer falha — quem chama usa o molde.

    `fallback` entra para preservar o que o modelo NÃO decide: a ação do botão
    e o rótulo de transição, ambos calculados.
    """
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
            # NEM `thinking` NEM `effort`: o Haiku 4.5 é anterior à família que
            # aceita `output_config.effort` e REJEITA o parâmetro com 400 — em
            # produção TODA chamada falhava e a frase caía no molde, em
            # silêncio. Omitir `thinking` já significa "sem thinking" nesta
            # geração (confirmado na referência da API, ago/2026). O controle
            # de custo aqui é a escolha do próprio Haiku.
            output_config={
                "format": {"type": "json_schema", "schema": SCHEMA},
            },
            messages=[{"role": "user", "content": _prompt(facts)}],
        )

        # Classificador de segurança pode recusar. Numa tela de saúde isso é
        # plausível, e a resposta certa é o molde — não uma tela vazia.
        if response.stop_reason == "refusal":
            return None

        texto = next((b.text for b in response.content if b.type == "text"), None)
        if not texto:
            return None
        dados = json.loads(texto)
    except Exception as err:
        # Rede, chave inválida, timeout, JSON quebrado: todos têm a mesma
        # resposta correta — cair no molde. Mas o MOTIVO vai para o log: sem
        # isso, "a frase não veio" e "a frase veio errada" ficam
        # indistinguíveis, e não há como saber se o LLM está sequer sendo
        # chamado.
        print(f"[insight_llm] falhou: {type(err).__name__}: {err}", flush=True)
        return None

    if not _plausivel(dados, facts):
        print(f"[insight_llm] recusado pela checagem: {dados}", flush=True)
        return None

    return HomeInsight(
        eyebrow=dados["eyebrow"],
        headline=dados["headline"],
        detail=dados["detail"],
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


def _plausivel(dados: dict, facts: Facts) -> bool:
    """Barreira final: o texto pode ser recusado, mas nunca corrigido.

    O esquema garante a forma, não o conteúdo. Estas checagens pegam o que dá
    para verificar mecanicamente — comprimento absurdo e, principalmente, número
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
