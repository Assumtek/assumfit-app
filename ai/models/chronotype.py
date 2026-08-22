"""Identificação de cronótipo.

A spec promete cronótipo em 7 dias. O sinal usado aqui é o **ponto médio do
sono** (midsleep), que é o marcador padrão em cronobiologia, é o que o MSFsc
do Munich Chronotype Questionnaire mede, só que observado em vez de perguntado.

Escolha deliberada: usar midsleep em vez do horário de pico de HRV. O HRV
depende de treino, álcool, doença e estresse do dia, então o pico varia demais
para classificar alguém em uma semana. O horário de dormir é muito mais estável.

Devolve `None` enquanto não houver noites suficientes. Chutar "intermediário"
por falta de dado seria pior que admitir que ainda não sabemos: o app usaria a
curva errada e o usuário não teria como saber.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Literal

Chronotype = Literal["matutino", "vespertino", "intermediario"]

MIN_NIGHTS = 7

#: Limiares de ponto médio do sono, em horas decimais desde a meia-noite.
#: Antes das 3h30 é matutino; depois das 5h é vespertino.
EARLY_THRESHOLD = 3.5
LATE_THRESHOLD = 5.0


@dataclass(frozen=True)
class Night:
    """Uma noite observada, em horas decimais desde a meia-noite."""

    sleep_onset: float  # 23.5 = 23h30
    wake_time: float  # 7.25 = 7h15


@dataclass(frozen=True)
class ChronotypeResult:
    chronotype: Chronotype | None
    midsleep: float | None
    nights_used: int
    confident: bool

    def to_dict(self) -> dict:
        return {
            "chronotype": self.chronotype,
            "midsleep": self.midsleep,
            "nights_used": self.nights_used,
            "confident": self.confident,
        }


def _midsleep(night: Night) -> float:
    """Ponto médio entre adormecer e acordar, tratando a virada da meia-noite."""
    onset = night.sleep_onset
    wake = night.wake_time
    if wake < onset:
        wake += 24  # dormiu antes da meia-noite e acordou depois
    return ((onset + wake) / 2) % 24


def identify(nights: list[Night]) -> ChronotypeResult:
    if len(nights) < MIN_NIGHTS:
        return ChronotypeResult(chronotype=None, midsleep=None, nights_used=len(nights), confident=False)

    # Mediana, não média: uma única noite de festa ou plantão deslocaria a média
    # o suficiente para reclassificar a pessoa.
    mid = median(_midsleep(n) for n in nights)

    if mid < EARLY_THRESHOLD:
        chronotype: Chronotype = "matutino"
    elif mid > LATE_THRESHOLD:
        chronotype = "vespertino"
    else:
        chronotype = "intermediario"

    return ChronotypeResult(chronotype=chronotype, midsleep=round(mid, 2), nights_used=len(nights), confident=True)
