"""O perfil de rotina entrando no cálculo.

Sem este módulo o onboarding seria um formulário que não muda nada — e um
formulário que não muda nada é atrito puro, cobrado da pessoa logo no primeiro
uso. Cada campo coletado precisa alterar uma recomendação concreta, e é aqui que
isso acontece.

Três usos, em ordem de impacto:

1. **Turno desloca a curva.** É de longe o mais importante. Quem trabalha à
   noite tem o ritmo circadiano invertido, e a curva padrão erra em TODA hora do
   dia para essa pessoa — não é um ajuste fino, é a diferença entre o app servir
   ou não servir. O cronótipo estimado aqui vale até haver sete noites medidas,
   quando o dado real substitui a estimativa.

2. **Dia de treino muda a recomendação.** Energia alta numa terça em que a
   pessoa treina não é a mesma coisa que energia alta num sábado. O app deixa de
   dizer só "aproveite" e passa a dizer onde o treino cai na curva.

3. **Postura muda o aviso de movimento.** Oito horas sentado e oito horas em pé
   produzem cansaço parecido no relato e fisiologia diferente; recomendar
   "levante-se" a quem já passou o dia em pé é ruído.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Chronotype = Literal["matutino", "vespertino", "intermediario"]


@dataclass(frozen=True)
class Lifestyle:
    occupation: str | None = None
    work_posture: Literal["sitting", "standing", "alternating", "moving"] | None = None
    posture_hours: int | None = None
    work_schedule: Literal["business", "shifts", "night", "flexible"] | None = None
    #: Hora decimal de dormir, declarada no onboarding.
    bedtime: float | None = None
    exercises: Literal["regular", "sometimes", "none"] | None = None
    activities: list[str] = field(default_factory=list)
    #: 0 = domingo.
    train_days: list[int] = field(default_factory=list)
    train_period: str | None = None
    goal: str | None = None


#: Faixa de horas de cada período declarado no onboarding. Aproximação
#: deliberada: a pessoa disse "à noite", não "às 19h37".
PERIOD_HOURS = {
    "manhã": 7,
    "almoço": 12,
    "tarde": 16,
    "noite": 19,
}

#: Horas seguidas na mesma posição a partir das quais vale avisar.
#: Abaixo disso, o aviso viraria ruído diário para quem já se move o suficiente.
LONG_POSTURE_HOURS = 6


def chronotype_from(lifestyle: Lifestyle | None) -> Chronotype:
    """Cronótipo ESTIMADO pelo perfil, para valer enquanto não há noites medidas.

    É explicitamente inferior ao cronótipo observado por `chronotype.py`, que usa
    o ponto médio do sono de sete noites. Mas na primeira semana a alternativa
    seria assumir "intermediário" para todo mundo — e para quem trabalha de
    madrugada isso significa o app inteiro errado justamente no período em que a
    pessoa decide se continua assinando.
    """
    if lifestyle is None:
        return "intermediario"

    if lifestyle.work_schedule == "night":
        return "vespertino"

    if lifestyle.bedtime is not None:
        # Dormir de madrugada ou de manhã é o marcador mais forte que temos sem
        # medir; deitar cedo, o oposto.
        if 2 <= lifestyle.bedtime <= 11:
            return "vespertino"
        if lifestyle.bedtime < 23:
            return "matutino"

    return "intermediario"


def trains_on(lifestyle: Lifestyle | None, weekday: int) -> bool:
    """`weekday` no padrão do JavaScript: 0 = domingo."""
    return bool(lifestyle and lifestyle.train_days and weekday in lifestyle.train_days)


@dataclass(frozen=True)
class Context:
    """Frase de contexto e, quando faz sentido, uma ação diferente."""

    sentence: str
    action_override: Literal["play", "calendar", "drop", "rest"] | None = None

    def to_dict(self) -> dict:
        return {"sentence": self.sentence, "actionOverride": self.action_override}


def personalize(
    lifestyle: Lifestyle | None,
    *,
    level: str,
    hour: int,
    weekday: int,
    curve: list,
) -> Context | None:
    """Uma frase a mais, derivada do perfil. `None` quando não há o que dizer.

    Uma frase, não três: o espaço da tela inicial é o recurso escasso do produto,
    e empilhar contexto genérico afogaria a informação que veio da fisiologia.
    A ordem abaixo é de prioridade — a primeira regra que casar, ganha.
    """
    if lifestyle is None:
        return None

    treina_hoje = trains_on(lifestyle, weekday)

    # 1. Dia de treino é o contexto mais forte que existe: é um compromisso que
    #    a pessoa já assumiu, e a energia do dia decide se ele vai render.
    if treina_hoje and lifestyle.train_period:
        alvo = PERIOD_HOURS.get(lifestyle.train_period)
        if alvo is not None and alvo > hour:
            projetado = next((p.score for p in curve if p.hour == alvo), None)
            if projetado is not None:
                if level == "low":
                    return Context(
                        f"Hoje é dia de treino, e seu corpo está pedindo pausa. Às {alvo}h a projeção é {projetado} —"
                        " treino leve rende mais que forçar.",
                        action_override="rest",
                    )
                return Context(
                    f"Hoje é dia de treino. Às {alvo}h sua energia projetada é {projetado}.",
                )
        elif alvo is not None and alvo <= hour and level == "low":
            return Context("Você treinou hoje. A queda de agora é esperada — recuperação é parte do treino.")

    # 2. Postura, só quando a energia não está alta. Com energia alta a pessoa
    #    tem coisa melhor a fazer do que ouvir sobre a cadeira.
    if level != "high" and lifestyle.work_posture == "sitting":
        horas = lifestyle.posture_hours
        if horas and horas >= LONG_POSTURE_HOURS:
            return Context(
                f"São {horas}h seguidas sentado no seu dia: cinco minutos em pé agora recuperam parte do alerta"
                " sem custo nenhum.",
            )
        return Context("Você trabalha sentado — levantar por alguns minutos custa pouco e ajuda agora.")

    if level != "high" and lifestyle.work_posture in {"standing", "moving"}:
        return Context(
            "Você passa o dia em pé, então parte deste cansaço é postural, não de recuperação. Sentar cinco minutos"
            " vale mais que café.",
        )

    # 3. Quem não pratica recebe a sugestão mais barata possível, e só quando a
    #    energia permite — sugerir movimento a quem está mal é o oposto do útil.
    if lifestyle.exercises == "none" and level == "high":
        return Context("Sua energia está no alto: é o tipo de dia em que dez minutos de caminhada custam pouco.")

    return None


#: Hora de dormir que a curva-base assume. O pico dela é às 10h, compatível com
#: quem deita por volta das 23h.
BASELINE_BEDTIME = 23.0


def circadian_shift(lifestyle: Lifestyle | None) -> float | None:
    """Quantas horas deslocar a curva, a partir do horário de sono declarado.

    Substitui o cronótipo de três posições para quem tem rotina fora do padrão.
    O cálculo é a diferença para a hora de dormir da curva-base, normalizada
    para o menor arco: quem deita às 9h da manhã está 10 horas ADIANTE, não 14
    atrás, e sem essa normalização o deslocamento sairia pelo lado errado do
    relógio.

    Devolve `None` quando não há o que deslocar — aí vale o cronótipo, medido ou
    estimado.
    """
    if lifestyle is None:
        return None

    bedtime = lifestyle.bedtime
    if bedtime is None:
        # Turno noturno sem horário declarado: assume sono pela manhã, que é o
        # padrão de quem sai do plantão. É estimativa grosseira, e ainda assim
        # muito mais próxima que tratar a pessoa como diurna.
        if lifestyle.work_schedule == "night":
            bedtime = 9.0
        else:
            return None

    diff = (bedtime - BASELINE_BEDTIME + 12) % 24 - 12
    # Menos de duas horas de diferença não justifica deslocar: está dentro da
    # variação de uma semana qualquer, e mexer na curva por isso seria ruído.
    return diff if abs(diff) >= 2 else None
