"""O que a tela inicial diz — derivado do dado, não escolhido de uma lista.

Antes disto, o app tinha três parágrafos fixos, um por faixa de energia, e duas
frases de transição cravadas no código: "começa a cair em 2h30" e "segundo pico
às 16h". Elas apareciam sempre com o mesmo texto, independentemente da hora, do
cronótipo e da fisiologia da pessoa — ou seja, eram **decoração com aparência de
informação**, que é pior que não ter nada. Um vespertino às 20h lia "próximo pico
às 16h", um horário que já tinha passado.

O que muda aqui:

1. **A transição é calculada** varrendo a curva do próprio dia da pessoa, já
   deslocada pelo cronótipo. Se não houver transição à frente, a frase some em
   vez de mentir.
2. **A explicação cita o sinal que está pesando.** O score é uma soma ponderada,
   então dá para ordenar os componentes por quanto cada um está TIRANDO do
   resultado e nomear o maior. "Seu sono puxou o dia para baixo — 54 de 100" é
   verificável; "corpo descansado e recuperado" é adivinhação.
3. **Sinal assumido nunca vira elogio nem cobrança.** Hidratação sem registro
   entra neutra, e uma frase sobre ela seria afirmação sobre o que não foi
   medido.

Continua não havendo geração de linguagem: são moldes preenchidos com o dado.
A diferença é que agora o dado escolhe o molde e preenche os números.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from models.energy_score import Component, EnergyResult, level_of
from models.lifestyle import Context, Lifestyle, personalize

Level = Literal["high", "mid", "low"]
ActionKey = Literal["play", "calendar", "drop"]


@dataclass(frozen=True)
class Action:
    key: ActionKey
    label: str

    def to_dict(self) -> dict:
        return {"key": self.key, "label": self.label}


@dataclass(frozen=True)
class HomeInsight:
    eyebrow: str
    headline: str
    detail: str
    #: Frase de transição. `None` quando não há transição à frente hoje.
    next_label: str | None
    next_hour: int | None
    action: Action
    #: Sinal que mais está segurando o score. `None` quando nada se destaca.
    driver_key: str | None
    driver_label: str | None
    #: Frase derivada do perfil de rotina. `None` quando não há perfil ou não há
    #: nada de útil a dizer — silêncio é melhor que contexto genérico.
    context: str | None = None
    source: str = "model"

    def to_dict(self) -> dict:
        return {
            "eyebrow": self.eyebrow,
            "headline": self.headline,
            "detail": self.detail,
            "nextLabel": self.next_label,
            "nextHour": self.next_hour,
            "action": self.action.to_dict(),
            "driverKey": self.driver_key,
            "driverLabel": self.driver_label,
            "context": self.context,
            "source": self.source,
        }


#: Um sinal precisa estar tirando ao menos isto do score para ser nomeado.
#: Abaixo disso, apontar um "culpado" é ruído — todos estão perto do teto.
#:
#: O valor está ABAIXO do menor peso da spec (temperatura, 0,05), e isso é
#: deliberado. Com o corte em 0,06, a temperatura jamais podia ser nomeada: o
#: déficit máximo dela é o próprio peso, então o ramo dela em `DRIVER_TEXT` era
#: código morto — alguém com 38,2 °C recebia uma frase sobre outro sinal. O eval
#: por personas encontrou isso; nenhum caso escrito à mão tinha encontrado.
#:
#: Baixar o corte não desordena a prioridade: a escolha continua sendo o MAIOR
#: déficit, e um HRV ruim (peso 0,40) supera a temperatura por um fator de oito.
MIN_DEFICIT = 0.04

#: E precisa estar BAIXO, não só pesado. O corte fica ABAIXO de 0,5 de
#: propósito: a normalização do HRV é centrada na média da própria pessoa, então
#: norm 0,5 significa "exatamente na sua média" — neutro, não fraco. Com o corte
#: em 0,55 o app acusava de "abaixo do normal" quem estava 2 ms abaixo da
#: própria média, que é ruído de medição.
#:
#: Sem esta segunda condição o HRV vence quase sempre: com peso 0,40 ele acumula
#: mais déficit absoluto num valor bom (norm 0,68) do que a temperatura acumula
#: num valor ruim. O app chegou a dizer "sua recuperação está abaixo do normal"
#: para um HRV 7 ms ACIMA da média da pessoa — tecnicamente derivado do dado, e
#: ainda assim falso.
WEAK_NORM = 0.40
#: Simétrico: só é elogio se o sinal estiver realmente forte.
STRONG_NORM = 0.60

HEADLINES: dict[Level, str] = {
    "high": "Você está no seu melhor momento",
    "mid": "Bom para reuniões e revisões",
    "low": "Seu corpo pede uma pausa",
}

EYEBROWS: dict[Level, str] = {
    "high": "seu estado agora",
    "mid": "hora de tarefas leves",
    "low": "hora de recuperar",
}

ACTIONS: dict[Level, Action] = {
    "high": Action("play", "Iniciar sessão de foco"),
    "mid": Action("calendar", "Abrir agenda"),
    "low": Action("drop", "Beber água agora"),
}

#: Como cada sinal é explicado quando ele é o que está pesando.
DRIVER_TEXT = {
    "hrv": "Sua recuperação está abaixo do seu normal — {value}.",
    "sleep": "O sono da noite passada é o que mais pesa hoje — {value}.",
    "hr": "Sua frequência cardíaca de repouso está alta — {value}.",
    "hydration": "Você ainda bebeu pouca água hoje — {value}.",
    "temp": "Sua temperatura está fora da faixa usual — {value}.",
}

#: E quando ele é o que está sustentando o dia.
LIFT_TEXT = {
    "hrv": "Sua recuperação está acima do seu normal — {value}.",
    "sleep": "O sono da noite passada sustentou o dia — {value}.",
    "hr": "Sua frequência cardíaca de repouso está baixa — {value}.",
    "hydration": "Você está bem hidratado — {value}.",
    "temp": "Sua temperatura está estável — {value}.",
}

ADVICE: dict[Level, str] = {
    "high": "Reserve a janela para o que exige concentração contínua.",
    "mid": "Bom momento para alinhar pendências e responder mensagens.",
    "low": "Evite decisões importantes e reserve o horário para tarefas leves.",
}


def _named(components: list[Component]) -> tuple[Component | None, Component | None]:
    """O sinal que mais tira e o que mais sustenta — ignorando os assumidos.

    Componente assumido entra por convenção, não por medição. Citá-lo faria o app
    afirmar algo sobre um dado que ninguém coletou.

    Devolve `None` nos dois lados quando nada se destaca de verdade. É o caso
    comum de quem está bem: ninguém precisa de um culpado todo dia.
    """
    measured = [c for c in components if not c.assumed]
    if not measured:
        return None, None

    weak = [c for c in measured if c.norm < WEAK_NORM and c.deficit >= MIN_DEFICIT]
    strong = [c for c in measured if c.norm >= STRONG_NORM]

    worst = max(weak, key=lambda c: c.deficit) if weak else None
    best = max(strong, key=lambda c: c.weight * c.norm) if strong else None
    return worst, best


RANK = {"low": 0, "mid": 1, "high": 2}

#: Ganho mínimo, em pontos, para chamar um horário de "melhor janela". Sem isso
#: uma diferença de 1 ponto — ruído de arredondamento — viraria recomendação.
MIN_PEAK_GAIN = 5


def next_transition(curve: list, hour: int, current_score: int) -> tuple[int | None, str | None]:
    """Quando a faixa muda, varrendo só o que ainda resta do dia.

    Devolve `(None, None)` quando nada relevante muda até a meia-noite. Nesse
    caso a tela não mostra frase nenhuma — que é a única saída honesta, e é
    exatamente o que a frase fixa antiga não sabia fazer.
    """
    level = level_of(current_score)
    ahead = [p for p in curve if p.hour > hour]

    for point in ahead:
        new = level_of(point.score)
        if new == level:
            continue
        if RANK[new] > RANK[level]:
            verb = "próximo pico" if new == "high" else "volta a subir"
            return point.hour, f"{verb} às {point.hour}h"
        return point.hour, f"começa a cair às {point.hour}h"

    # Sem troca de faixa, o melhor horário restante ainda é informação útil —
    # desde que o ganho justifique esperar por ele.
    if ahead:
        peak = max(ahead, key=lambda p: p.score)
        if peak.score - current_score >= MIN_PEAK_GAIN:
            return peak.hour, f"melhor janela restante às {peak.hour}h"
    return None, None


def build(
    energy: EnergyResult,
    hour: int,
    *,
    calibration_days: int = 7,
    lifestyle: Lifestyle | None = None,
    weekday: int | None = None,
) -> HomeInsight:
    level: Level = energy.level
    worst, best = _named(energy.components)
    next_hour, next_label = next_transition(energy.curve, hour, energy.score)

    # Em faixa alta a explicação nomeia o que está SUSTENTANDO; nas outras, o
    # que está segurando. Dizer a quem está bem "sua FC está alta" seria
    # tecnicamente verdadeiro e completamente inútil.
    if level == "high" and best is not None:
        cause = LIFT_TEXT[best.key].format(value=best.value)
        driver = best
    elif worst is not None:
        cause = DRIVER_TEXT[worst.key].format(value=worst.value)
        driver = worst
    else:
        # Nenhum sinal fraco e ainda assim fora da faixa alta: quem está
        # segurando é o RELÓGIO, não o corpo. É o caso mais comum do meio da
        # tarde, e dizer isso é mais útil que procurar um culpado fisiológico
        # que não existe — evita que a pessoa leia queda circadiana normal como
        # problema de saúde.
        #
        # Sem hora nesta frase, de propósito: `next_label` já carrega a
        # transição e é exibida logo abaixo. Citar um horário aqui produzia duas
        # horas diferentes na mesma tela — a primeira troca de faixa e o pico —,
        # ambas verdadeiras e juntas confusas.
        if energy.base >= 0.6:
            cause = (
                "Sua fisiologia está bem — o que pesa agora é o horário, não o corpo."
                if next_hour is not None
                else "Sua fisiologia está bem — o que pesa agora é o horário, e ele não melhora mais hoje."
            )
        else:
            cause = "Nenhum sinal isolado está puxando o resultado hoje."
        driver = None

    detail = f"{cause} {ADVICE[level]}"
    if energy.calibrating:
        detail += (
            f" Ainda estamos calibrando: com {calibration_days} dias de histórico"
            " a leitura passa a comparar você com você mesmo."
        )

    ctx: Context | None = None
    if weekday is not None:
        ctx = personalize(lifestyle, level=level, hour=hour, weekday=weekday, curve=energy.curve)

    # Dia de treino com energia baixa troca a AÇÃO, não só o texto: mandar
    # "iniciar sessão de foco" para quem precisa decidir se treina ou não é
    # responder outra pergunta.
    action = ACTIONS[level]
    if ctx and ctx.action_override == "rest":
        action = Action("drop", "Ver recuperação")

    return HomeInsight(
        eyebrow=EYEBROWS[level],
        headline=HEADLINES[level],
        detail=detail,
        context=ctx.sentence if ctx else None,
        next_label=next_label,
        next_hour=next_hour,
        action=action,
        driver_key=driver.key if driver else None,
        driver_label=driver.label if driver else None,
    )
