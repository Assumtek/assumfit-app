"""Score de energia por hora.

A spec pondera HRV 40%, sono 25%, FC de repouso 20%, hidratação 10% e
temperatura 5%. Quatro coisas que a fórmula sozinha não resolve e que estão
tratadas aqui:

1. **Normalização.** HRV saudável varia de ~20 a ~200 ms entre pessoas, então o
   valor absoluto não informa nada — só o desvio contra a linha de base da
   própria pessoa. Sem baseline, caímos numa faixa populacional ampla e o
   resultado sai marcado como `calibrating`, para a interface poder ser honesta
   sobre a precisão.

2. **O circadiano modula, não domina.** Multiplicar o score pelo fator do
   horário fazia o vale das 14h derrubar quem estava bem recuperado. Aqui ele
   responde por no máximo 35% do resultado: a curva do dia continua visível, mas
   quem manda é a fisiologia.

3. **Sinal ausente não vira número inventado.** Quando não há dado de sono, o
   peso dele é REDISTRIBUÍDO entre os sinais que existem, em vez de entrar um
   valor plausível qualquer. Chutar 80 desloca um quarto do score em cima de
   nada, e ninguém consegue auditar depois de que veio o número.

4. **Hidratação entra neutra só enquanto não houver registro.** Com registro do
   dia, ela pesa de verdade — é o único sinal do score que depende da pessoa
   anotar, e por isso o único cuja ausência não é falha de sensor.

Cada componente sai junto do resultado, com o valor legível. É isso que permite
a camada de insight dizer QUAL sinal está segurando o dia em vez de repetir uma
frase genérica por faixa.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Chronotype = Literal["matutino", "vespertino", "intermediario"]

_PRIOR = json.loads((Path(__file__).parent.parent / "data" / "circadian_prior.json").read_text())

#: Dias de histórico necessários para abandonar a referência populacional.
CALIBRATION_DAYS = 7
#: Quanto do resultado o horário do dia pode mover.
CIRCADIAN_WEIGHT = 0.35

WEIGHTS = {"hrv": 0.40, "sleep": 0.25, "hr": 0.20, "hydration": 0.10, "temp": 0.05}

#: Limiares de faixa. A régua da tela desenha as MESMAS divisões.
BANDS = {"mid": 38, "high": 65}

#: Meta padrão de água, espelhando o app. Vira cálculo por peso quando o
#: cadastro tiver peso corporal.
DEFAULT_WATER_GOAL_ML = 2500


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def circadian_factor(
    hour: int,
    chronotype: Chronotype = "intermediario",
    shift_hours: float | None = None,
) -> float:
    """Prior de cronobiologia, deslocado.

    O matutino tem o pico mais cedo e cai antes; o vespertino é o oposto. Sem o
    deslocamento, o app diria a um vespertino que ele está em vale às 20h,
    justamente quando ele rende mais.

    `shift_hours` existe porque o cronótipo de três posições NÃO representa quem
    trabalha à noite. Vespertino é quem tem o pico no fim da tarde — dois passos
    de curva. Quem dorme às 9h da manhã tem o ciclo inteiro invertido, coisa de
    dez passos, e classificá-lo como vespertino produzia praticamente a mesma
    curva de um trabalhador diurno. São fenômenos diferentes, e tratá-los com o
    mesmo enum era erro de categoria.

    Quando presente, o deslocamento explícito SUBSTITUI o do cronótipo: ele vem
    do horário de sono declarado, que é observação, contra uma classificação.
    """
    curve = _PRIOR["curva_base"]
    shift = _PRIOR["deslocamento_cronotipo"][chronotype] if shift_hours is None else shift_hours
    return curve[round(hour - shift) % 24]


@dataclass(frozen=True)
class EnergyPoint:
    hour: int
    score: int


@dataclass(frozen=True)
class Component:
    """Um sinal que entra no score, com o que é preciso para explicá-lo."""

    key: str
    label: str
    #: 0 a 1, já normalizado.
    norm: float
    #: Peso efetivo — difere de `WEIGHTS` quando algum sinal falta.
    weight: float
    #: Valor legível, para a frase citar o número de verdade.
    value: str
    #: True quando o sinal entrou por convenção, não por medição.
    assumed: bool = False

    @property
    def deficit(self) -> float:
        """Quanto este sinal está TIRANDO do score, em pontos percentuais."""
        return self.weight * (1 - self.norm)

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "norm": round(self.norm, 3),
            "weight": round(self.weight, 3),
            "value": self.value,
            "assumed": self.assumed,
            "deficit": round(self.deficit, 3),
        }


@dataclass(frozen=True)
class EnergyResult:
    score: int
    level: Literal["high", "mid", "low"]
    calibrating: bool
    chronotype: Chronotype
    curve: list[EnergyPoint]
    components: list[Component]
    #: Base fisiológica antes da modulação circadiana, de 0 a 1.
    base: float

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "level": self.level,
            "calibrating": self.calibrating,
            "chronotype": self.chronotype,
            "curve": [p.__dict__ for p in self.curve],
            "components": [c.to_dict() for c in self.components],
            "base": round(self.base, 4),
        }


def _components(
    hrv_ms: float,
    sleep_score: float | None,
    resting_hr: float,
    temperature_c: float,
    hrv_baseline: float | None,
    water_ml: float | None,
    water_goal_ml: float,
) -> list[Component]:
    if hrv_baseline is None:
        # Faixa populacional ampla: não diz muito, mas é honesto sobre isso.
        hrv_norm = _clamp01((hrv_ms - 25) / 75)
        hrv_value = f"{round(hrv_ms)} ms"
    else:
        # O que importa é o desvio relativo à própria média.
        hrv_norm = _clamp01(0.5 + (hrv_ms - hrv_baseline) / (hrv_baseline * 0.6))
        delta = round(hrv_ms - hrv_baseline)
        hrv_value = f"{round(hrv_ms)} ms, {delta:+d} vs. sua média"

    present = [
        Component("hrv", "Recuperação", hrv_norm, WEIGHTS["hrv"], hrv_value),
        Component("hr", "Coração", _clamp01((90 - resting_hr) / 40), WEIGHTS["hr"], f"{round(resting_hr)} bpm"),
        Component(
            "temp",
            "Temperatura",
            _clamp01(1 - abs(temperature_c - 36.6) / 1.5),
            WEIGHTS["temp"],
            f"{temperature_c:.1f} °C".replace(".", ","),
        ),
    ]

    if sleep_score is not None:
        present.append(
            Component("sleep", "Sono", _clamp01(sleep_score / 100), WEIGHTS["sleep"], f"{round(sleep_score)} de 100")
        )

    if water_ml is None:
        # Sem registro, entra neutra: a pessoa provavelmente bebeu algo, só não
        # anotou. Marcada como assumida para a frase não citar o que não foi medido.
        present.append(Component("hydration", "Hidratação", 0.5, WEIGHTS["hydration"], "sem registro", assumed=True))
    else:
        liters = f"{water_ml / 1000:.1f}".replace(".", ",")
        goal = f"{water_goal_ml / 1000:.1f}".replace(".", ",")
        present.append(
            Component(
                "hydration",
                "Hidratação",
                _clamp01(water_ml / water_goal_ml) if water_goal_ml > 0 else 0.5,
                WEIGHTS["hydration"],
                f"{liters} L de {goal} L",
            )
        )

    # Redistribui o peso do que faltou, proporcionalmente ao que sobrou. Sem
    # isso, um sinal ausente viraria zero e derrubaria o score de quem só não
    # tem o sensor — o oposto do que a falta de dado deveria significar.
    #
    # Com todos os sinais presentes a divisão é PULADA, não é só otimização:
    # `0,40 + 0,25 + 0,20 + 0,10 + 0,05` não dá exatamente 1,0 em ponto
    # flutuante, e dividir por esse quase-um desloca cada peso na última casa.
    # A implementação TypeScript do app não divide, então numa borda de
    # arredondamento os dois lados devolveriam scores diferentes por 1 ponto.
    total = sum(c.weight for c in present)
    if total <= 0 or abs(total - 1.0) < 1e-9:
        return present
    return [Component(c.key, c.label, c.norm, c.weight / total, c.value, c.assumed) for c in present]


def score_at_hour(base: float, hour: int, chronotype: Chronotype, shift_hours: float | None = None) -> int:
    modulation = (1 - CIRCADIAN_WEIGHT) + CIRCADIAN_WEIGHT * circadian_factor(hour, chronotype, shift_hours)
    return round(base * modulation * 100)


def level_of(score: int) -> Literal["high", "mid", "low"]:
    return "high" if score >= BANDS["high"] else "mid" if score >= BANDS["mid"] else "low"


def calc_energy(
    *,
    hrv_ms: float,
    sleep_score: float | None,
    resting_hr: float,
    temperature_c: float = 36.6,
    hour: int,
    hrv_baseline: float | None = None,
    chronotype: Chronotype = "intermediario",
    water_ml: float | None = None,
    water_goal_ml: float = DEFAULT_WATER_GOAL_ML,
    circadian_shift: float | None = None,
) -> EnergyResult:
    components = _components(
        hrv_ms, sleep_score, resting_hr, temperature_c, hrv_baseline, water_ml, water_goal_ml
    )
    base = sum(c.norm * c.weight for c in components)
    now = score_at_hour(base, hour, chronotype, circadian_shift)

    return EnergyResult(
        score=now,
        level=level_of(now),
        calibrating=hrv_baseline is None,
        chronotype=chronotype,
        # A curva do dia inteiro é o que alimenta a linha do tempo da tela.
        curve=[EnergyPoint(hour=h, score=score_at_hour(base, h, chronotype, circadian_shift)) for h in range(24)],
        components=components,
        base=base,
    )
