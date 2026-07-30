"""Correlações automáticas entre hábito e resultado fisiológico.

O que o produto promete: "nas noites em que você dormiu antes das 22h30, seu HRV
da manhã seguinte foi 14 ms maior". Isso é uma afirmação causal disfarçada, e é
onde este tipo de feature costuma mentir.

Três salvaguardas, e elas são o motivo deste arquivo existir em vez de um
`corr()` solto:

1. **Amostra mínima.** Correlação sobre 5 pares acha padrão em ruído. Abaixo de
   `MIN_PAIRS` não reportamos nada.
2. **Significância, não só magnitude.** Um r de 0,6 com n=8 não é achado. Exigimos
   p < 0,05 além do tamanho de efeito.
3. **Linguagem associativa.** O texto gerado diz "acompanha", nunca "causa" — o
   dado é observacional e não controla nada.

Melhor não mostrar insight nenhum do que mostrar um que o usuário vai usar para
mudar um hábito com base em coincidência.
"""

from __future__ import annotations

from dataclasses import dataclass

from scipy import stats

#: Pares mínimos para sequer tentar. Abaixo disso, ruído vira padrão.
MIN_PAIRS = 14
#: Tamanho de efeito mínimo para valer a tela.
MIN_ABS_R = 0.35
MAX_P_VALUE = 0.05


@dataclass(frozen=True)
class Insight:
    key: str
    text: str
    r: float
    p_value: float
    n: int

    def to_dict(self) -> dict:
        return {"key": self.key, "text": self.text, "r": round(self.r, 3), "p_value": round(self.p_value, 4), "n": self.n}


def correlate(
    key: str,
    xs: list[float],
    ys: list[float],
    *,
    positive_text: str,
    negative_text: str,
) -> Insight | None:
    """Correlaciona duas séries pareadas e devolve insight só se ele se sustenta."""
    if len(xs) != len(ys):
        raise ValueError("séries pareadas precisam do mesmo tamanho")
    if len(xs) < MIN_PAIRS:
        return None
    # Variância zero quebra o cálculo e significa que não há o que correlacionar.
    if len(set(xs)) < 2 or len(set(ys)) < 2:
        return None

    result = stats.pearsonr(xs, ys)
    r = float(result.statistic)
    p = float(result.pvalue)

    if abs(r) < MIN_ABS_R or p > MAX_P_VALUE:
        return None

    return Insight(key=key, text=positive_text if r > 0 else negative_text, r=r, p_value=p, n=len(xs))


def sleep_onset_vs_next_hrv(onsets: list[float], next_day_hrv: list[float]) -> Insight | None:
    """Horário de dormir contra HRV da manhã seguinte."""
    return correlate(
        "sleep_onset_hrv",
        onsets,
        next_day_hrv,
        positive_text="Dormir mais tarde acompanha HRV mais alto na manhã seguinte — padrão incomum, vale observar mais.",
        negative_text="Nas noites em que você dormiu mais cedo, seu HRV da manhã seguinte foi consistentemente maior.",
    )


def water_vs_energy(water_ml: list[float], energy: list[float]) -> Insight | None:
    return correlate(
        "water_energy",
        water_ml,
        energy,
        positive_text="Os dias em que você bebeu mais água acompanham score de energia mais alto.",
        negative_text="Beber mais água acompanha score de energia mais baixo — provavelmente coincidência, não conclusão.",
    )


def steps_vs_deep_sleep(steps: list[float], deep_pct: list[float]) -> Insight | None:
    return correlate(
        "steps_deep_sleep",
        steps,
        deep_pct,
        positive_text="Dias com mais passos acompanham mais sono profundo na noite seguinte.",
        negative_text="Dias com mais passos acompanham menos sono profundo — vale checar horário do treino.",
    )
