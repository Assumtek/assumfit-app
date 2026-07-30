"""Idade biológica.

Compara métricas fisiológicas com percentis de referência da faixa etária e do
sexo da pessoa, e converte o desvio em anos.

Duas decisões que valem explicação, porque não são óbvias:

1. **Referência por faixa, não tabela única.** Aplicar percentis de 30–35 anos a
   todo mundo pune alguém de 58 com fisiologia normal para a idade dele. A
   pergunta que a métrica responde é "como você está em relação a quem tem a sua
   idade", e isso exige a curva certa.

2. **Clamp por fator e no total.** HRV de 8 ms costuma ser artefato de movimento,
   não fisiologia. Sem limite, um único dado ruim produz idade absurda e destrói
   a confiança no número inteiro.

Esta implementação é a fonte da verdade. A cópia em TypeScript no app existe
para funcionar offline e é verificada contra esta por teste de paridade.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Sex = Literal["f", "m"]

_REFERENCES = json.loads((Path(__file__).parent.parent / "data" / "bio_age_references.json").read_text())
_WEIGHTS = _REFERENCES["_pesos_anos"]
_LIMITS = _REFERENCES["_limites"]


@dataclass(frozen=True)
class Factor:
    key: str
    label: str
    value: str
    reference: str
    #: Anos somados à idade real. Negativo rejuvenesce.
    years: float


@dataclass(frozen=True)
class BioAgeResult:
    real_age: int
    bio_age: int
    #: real_age − bio_age. Positivo = mais jovem que a idade cronológica.
    delta: int
    factors: list[Factor]

    def to_dict(self) -> dict:
        return {
            "real_age": self.real_age,
            "bio_age": self.bio_age,
            "delta": self.delta,
            "factors": [f.__dict__ for f in self.factors],
        }


def _clamp(value: float, limit: float) -> float:
    return max(-limit, min(limit, value))


def band_for(age: int, sex: Sex) -> dict:
    """Percentis da faixa etária, já deslocados pelo sexo."""
    band = next((b for b in _REFERENCES["faixas"] if age <= b["max_idade"]), _REFERENCES["faixas"][-1])
    shift = _REFERENCES["ajuste_sexo"][sex]
    return {
        "hrv": {k: v + shift["hrv"] for k, v in band["hrv"].items()},
        "hr": {k: v + shift["hr"] for k, v in band["hr"].items()},
        "spo2": dict(band["spo2"]),
        "deep_pct": band["deep_pct"],
    }


def calc_bio_age(
    *,
    real_age: int,
    sex: Sex,
    hrv_ms: float | None,
    resting_hr: float,
    spo2_pct: float | None,
    deep_sleep_pct: float | None,
    temp_range_c: float | None = None,
) -> BioAgeResult:
    ref = band_for(real_age, sex)
    limits = _LIMITS["clamp_por_fator"]

    # Ausente contribui ZERO ano — mesma regra do sono e da temperatura, e a
    # mesma do espelho em `bioAge.ts`. Exigir HRV fazia a idade biológica
    # simplesmente não existir para quem tem um aparelho que ainda não mediu.
    d_hrv = (
        0.0
        if hrv_ms is None
        else _clamp(((hrv_ms - ref["hrv"]["p50"]) / (ref["hrv"]["p90"] - ref["hrv"]["p50"])) * _WEIGHTS["hrv"], limits["hrv"])
    )
    d_hr = _clamp(((ref["hr"]["p50"] - resting_hr) / (ref["hr"]["p50"] - ref["hr"]["p10"])) * _WEIGHTS["hr"], limits["hr"])
    d_spo2 = (
        0.0
        if spo2_pct is None
        else _clamp(
            ((spo2_pct - ref["spo2"]["p50"]) / (ref["spo2"]["p90"] - ref["spo2"]["p50"])) * _WEIGHTS["spo2"],
            limits["spo2"],
        )
    )
    # Ausente contribui ZERO ano, como já faziam HRV e SpO₂. O espelho em
    # TypeScript (`bioAge.ts`) faz o mesmo — sem isso, a implementação do app
    # aceitaria ausência e a daqui não, que é a divergência silenciosa que o
    # teste de paridade existe para impedir.
    d_sleep = (
        0.0
        if deep_sleep_pct is None
        else _clamp(((deep_sleep_pct - ref["deep_pct"]) / 0.25) * _WEIGHTS["sleep"], limits["sleep"])
    )
    d_temp = (
        0.0
        if temp_range_c is None
        else _clamp(((0.7 - temp_range_c) / 0.7) * _WEIGHTS["temp"], limits["temp"])
    )

    delta = _clamp(d_hrv + d_hr + d_spo2 + d_sleep + d_temp, _LIMITS["clamp_total_anos"])
    bio_age = max(_LIMITS["idade_minima"], round(real_age - delta))

    factors = [
        Factor(
            "hrv",
            "HRV",
            "—" if hrv_ms is None else f"{round(hrv_ms)} ms",
            f"média da faixa: {ref['hrv']['p50']} ms",
            -d_hrv,
        ),
        Factor(
            "sleep",
            "Sono profundo",
            "—" if deep_sleep_pct is None else f"{round(deep_sleep_pct * 100)}%",
            f"média da faixa: {round(ref['deep_pct'] * 100)}%",
            -d_sleep,
        ),
        Factor("hr", "FC repouso", f"{round(resting_hr)} bpm", f"média da faixa: {ref['hr']['p50']} bpm", -d_hr),
        Factor(
            "spo2",
            "Oxigênio noturno",
            "—" if spo2_pct is None else f"{round(spo2_pct)}%",
            f"média da faixa: {ref['spo2']['p50']}%",
            -d_spo2,
        ),
        Factor(
            "temp",
            "Regulação térmica",
            "—" if temp_range_c is None else f"variação {temp_range_c:.1f}°",
            "média: 0,7°",
            -d_temp,
        ),
    ]

    return BioAgeResult(real_age=real_age, bio_age=bio_age, delta=real_age - bio_age, factors=factors)
