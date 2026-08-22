"""Idade biológica, idade fisiológica estimada a partir de literatura revisada.

O que este número É: a idade em que os marcadores medidos desta pessoa seriam
a MEDIANA da população. O que ele NÃO é: um relógio epigenético, um exame ou
qualquer coisa que se pareça com diagnóstico. A tela diz isso, e este módulo
também.

## O caminho da conta

1. **VO2max estimado**, equação de não-exercício de Jurca et al. (2005),
   que usa sexo, idade, IMC, FC de repouso e nível de atividade física. É a
   única das quatro entradas que o AssumFit não precisa pedir: a pulseira mede
   a FC de repouso e o app já conta os minutos de treino da semana.
2. **Idade da aptidão**, a idade cuja mediana de VO2max (registro FRIEND,
   Kaminsky et al. 2015) iguala o VO2max estimado. É o mesmo raciocínio do
   "fitness age" do NTNU, com as normas americanas medidas em esteira.
3. **Idade do HRV**, a relação do RMSSD com a idade é uma lei de potência
   medida por PPG de pulseira em 8 milhões de pessoas (Natarajan et al. 2020),
   e por isso pode ser invertida analiticamente.
4. **Idade do sono profundo**, o N3 cai cerca de 2 pontos percentuais por
   década até os 60 anos (Ohayon et al. 2004).
5. **Combinação**, média ponderada das idades equivalentes que existem, com
   limite por fator e no total.

A versão anterior deste arquivo comparava percentis INVENTADOS (o próprio
arquivo de dados avisava, em letras maiúsculas, que eram "valores
provisórios") e somava pesos em anos escolhidos a olho. O número saía
plausível e não significava nada.

## O que mudou no contrato

`calc_bio_age` passou a aceitar `bmi` e `weekly_active_min`, e a FC de repouso
virou obrigatória de fato, sem ela não há aptidão, que é o eixo principal.
SpO₂ e temperatura saíram do cálculo: não achei norma por idade que suporte
converter qualquer um dos dois em anos, e fator sem fonte é exatamente o que
esta reescrita veio remover. Os dois continuam medidos e exibidos nas telas
deles.

Esta implementação é a fonte da verdade. A cópia em TypeScript no app existe
para funcionar offline e é verificada contra esta por teste de paridade.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Sex = Literal["f", "m"]

_REF = json.loads((Path(__file__).parent.parent / "data" / "bio_age_references.json").read_text())
_VO2_EQ = _REF["vo2max_nao_exercicio"]
_VO2_NORMA = _REF["vo2max_mediana_por_idade"]
_HRV = _REF["hrv_por_idade"]
_SONO = _REF["sono_profundo_por_idade"]
_PESOS = _REF["combinacao"]["pesos"]
_LIM = _REF["limites"]

#: 1 MET = 3,5 mL O2 · kg-1 · min-1 — a definição usada pelo próprio Jurca.
ML_POR_MET = 3.5


@dataclass(frozen=True)
class Factor:
    key: str
    label: str
    value: str
    reference: str
    #: Anos que ESTE fator soma à idade real. Negativo rejuvenesce.
    years: float


@dataclass(frozen=True)
class BioAgeResult:
    real_age: int
    bio_age: int
    #: real_age − bio_age. Positivo = mais jovem que a idade cronológica.
    delta: int
    factors: list[Factor]
    #: VO2max estimado, em mL/kg/min — o número intermediário que mais explica
    #: o resultado, e que a tela mostra por isso.
    vo2max: float | None = None

    def to_dict(self) -> dict:
        return {
            "real_age": self.real_age,
            "bio_age": self.bio_age,
            "delta": self.delta,
            "factors": [f.__dict__ for f in self.factors],
            "vo2max": None if self.vo2max is None else round(self.vo2max, 1),
        }


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def activity_level(weekly_active_min: float | None) -> int:
    """Minutos semanais registrados → categoria SR-PA de Jurca (0 a 4).

    O artigo pergunta por autorrelato; aqui a categoria sai do que foi de fato
    registrado no app, treino do plano concluído mais sessão de esporte. É
    dado medido no lugar de lembrança, e a única liberdade que tomamos com a
    equação original.
    """
    if weekly_active_min is None:
        return 0
    nivel = 0
    for faixa in _VO2_EQ["atividade"]:
        if weekly_active_min >= faixa["min_semanais"]:
            nivel = faixa["nivel"]
    return nivel


def estimate_vo2max(
    *, age: int, sex: Sex, bmi: float, resting_hr: float, weekly_active_min: float | None
) -> float:
    """VO2max em mL/kg/min pela equação de não-exercício (Jurca 2005, NASA)."""
    nivel = activity_level(weekly_active_min)
    coef_pa = next(f["coef"] for f in _VO2_EQ["atividade"] if f["nivel"] == nivel)

    mets = (
        _VO2_EQ["intercepto"]
        + (_VO2_EQ["sexo_masculino"] if sex == "m" else 0.0)
        + _VO2_EQ["por_ano_de_idade"] * age
        + _VO2_EQ["por_ponto_de_imc"] * _clamp(bmi, _LIM["imc_minimo"], _LIM["imc_maximo"])
        + _VO2_EQ["por_bpm_de_fc_repouso"] * resting_hr
        + coef_pa
    )
    # Piso de 1 MET: a equação é linear e pode devolver negativo em combinações
    # extremas (IMC 50 com FC 100), que não existem em fisiologia.
    return max(1.0, mets) * ML_POR_MET


def fitness_age(vo2max: float, sex: Sex) -> float:
    """A idade cuja mediana populacional de VO2max é este valor (FRIEND).

    Interpola linearmente entre os pontos médios das décadas e extrapola pela
    inclinação das pontas, quem tem VO2max acima da mediana dos 20 anos não
    "não tem idade": tem uma idade estimada abaixo de 24,5, e o clamp global
    cuida do resto.
    """
    idades = _VO2_NORMA["idade_central"]
    medianas = _VO2_NORMA[sex]

    # A curva é decrescente: VO2max alto → idade baixa.
    if vo2max >= medianas[0]:
        inclinacao = (medianas[1] - medianas[0]) / (idades[1] - idades[0])
        return idades[0] + (vo2max - medianas[0]) / inclinacao
    if vo2max <= medianas[-1]:
        inclinacao = (medianas[-1] - medianas[-2]) / (idades[-1] - idades[-2])
        return idades[-1] + (vo2max - medianas[-1]) / inclinacao

    for i in range(len(idades) - 1):
        alto, baixo = medianas[i], medianas[i + 1]
        if baixo <= vo2max <= alto:
            fracao = (alto - vo2max) / (alto - baixo)
            return idades[i] + fracao * (idades[i + 1] - idades[i])
    return float(idades[-1])


def hrv_age(rmssd_ms: float, sex: Sex) -> float:
    """A idade em que este RMSSD é o típico (Natarajan 2020, PPG de pulseira).

    Inverte HRV(idade) = HRV30 · (idade/30)^α. Como α é negativo, RMSSD maior
    devolve idade menor, que é o comportamento fisiológico esperado.
    """
    p = _HRV[sex]
    if rmssd_ms <= 0:
        return float(_HRV["idade_de_referencia"])
    return _HRV["idade_de_referencia"] * (rmssd_ms / p["rmssd_aos_30"]) ** (1.0 / p["alfa"])


def deep_sleep_age(deep_fraction: float) -> float:
    """A idade em que esta fração de sono profundo é a esperada (Ohayon 2004).

    A relação vale até os 60 anos; depois o N3 estabiliza. Acima do platô a
    função devolve a própria idade de platô, porque ali o marcador deixa de
    discriminar idade, afirmar 80 anos a partir de N3 baixo seria ler a
    curva onde ela não existe.
    """
    esperado_no_plato = _SONO["fracao_aos_30"] - _SONO["queda_por_ano"] * (
        _SONO["idade_de_platô"] - 30
    )
    if deep_fraction <= esperado_no_plato:
        return float(_SONO["idade_de_platô"])
    return 30 + (_SONO["fracao_aos_30"] - deep_fraction) / _SONO["queda_por_ano"]


def calc_bio_age(
    *,
    real_age: int,
    sex: Sex,
    hrv_ms: float | None,
    resting_hr: float,
    deep_sleep_pct: float | None,
    bmi: float | None = None,
    weekly_active_min: float | None = None,
    # Aceitos e IGNORADOS: os dois entravam no cálculo antigo com peso
    # inventado. Continuam no contrato para não quebrar quem chama, e o
    # docstring do módulo explica por que saíram da conta.
    spo2_pct: float | None = None,
    temp_range_c: float | None = None,
) -> BioAgeResult:
    imc = _clamp(bmi if bmi is not None else _LIM["imc_padrao"], _LIM["imc_minimo"], _LIM["imc_maximo"])
    limite = _LIM["desvio_maximo_por_fator_anos"]

    vo2 = estimate_vo2max(
        age=real_age, sex=sex, bmi=imc, resting_hr=resting_hr, weekly_active_min=weekly_active_min
    )
    # Dois limites, por razões diferentes: o DOMÍNIO é onde o estudo olhou
    # (20 a 79 anos) e fora dele não se afirma nada; o limite por fator protege
    # contra artefato de medição, que é outro problema.
    piso, teto = _VO2_NORMA["idade_minima_afirmavel"], _VO2_NORMA["idade_maxima_afirmavel"]
    idade_aptidao = _clamp(
        _clamp(fitness_age(vo2, sex), piso, teto), real_age - limite, real_age + limite
    )

    idade_hrv = (
        None
        if hrv_ms is None
        else _clamp(
            _clamp(hrv_age(hrv_ms, sex), _HRV["idade_minima_afirmavel"], _HRV["idade_maxima_afirmavel"]),
            real_age - limite,
            real_age + limite,
        )
    )
    idade_sono = (
        None
        if deep_sleep_pct is None
        else _clamp(deep_sleep_age(deep_sleep_pct), real_age - limite, real_age + limite)
    )

    # Média ponderada só do que existe: o peso do ausente é redistribuído entre
    # os presentes, nunca tratado como zero.
    partes = [(idade_aptidao, _PESOS["aptidao"])]
    if idade_hrv is not None:
        partes.append((idade_hrv, _PESOS["hrv"]))
    if idade_sono is not None:
        partes.append((idade_sono, _PESOS["sono"]))
    peso_total = sum(p for _, p in partes)
    idade_estimada = sum(v * p for v, p in partes) / peso_total

    desvio = _clamp(
        idade_estimada - real_age,
        -_LIM["desvio_maximo_total_anos"],
        _LIM["desvio_maximo_total_anos"],
    )
    bio_age = max(_LIM["idade_minima"], round(real_age + desvio))

    nivel = activity_level(weekly_active_min)
    descricao_atividade = next(f["descricao"] for f in _VO2_EQ["atividade"] if f["nivel"] == nivel)

    factors = [
        Factor(
            "fitness",
            "Aptidão cardiorrespiratória",
            f"VO₂máx {vo2:.1f} ml/kg/min",
            f"mediana da sua idade: {_mediana_na_idade(real_age, sex):.1f}",
            idade_aptidao - real_age,
        ),
        Factor(
            "hrv",
            "HRV",
            "–" if hrv_ms is None else f"{round(hrv_ms)} ms",
            f"típico aos {real_age}: {_hrv_tipico(real_age, sex):.0f} ms",
            0.0 if idade_hrv is None else idade_hrv - real_age,
        ),
        Factor(
            "sleep",
            "Sono profundo",
            "–" if deep_sleep_pct is None else f"{round(deep_sleep_pct * 100)}%",
            f"típico aos {real_age}: {_sono_tipico(real_age) * 100:.0f}%",
            0.0 if idade_sono is None else idade_sono - real_age,
        ),
        Factor(
            "activity",
            "Atividade semanal",
            "–" if weekly_active_min is None else f"{round(weekly_active_min)} min",
            descricao_atividade,
            # A atividade não é um fator à parte: ela ENTRA na aptidão, e
            # somá-la de novo seria contá-la duas vezes.
            0.0,
        ),
    ]

    return BioAgeResult(
        real_age=real_age,
        bio_age=bio_age,
        delta=real_age - bio_age,
        factors=factors,
        vo2max=vo2,
    )


def _mediana_na_idade(age: int, sex: Sex) -> float:
    """A mediana de VO2max da idade da pessoa, a régua contra a qual ela é lida."""
    idades = _VO2_NORMA["idade_central"]
    medianas = _VO2_NORMA[sex]
    if age <= idades[0]:
        return medianas[0]
    if age >= idades[-1]:
        return medianas[-1]
    for i in range(len(idades) - 1):
        if idades[i] <= age <= idades[i + 1]:
            fracao = (age - idades[i]) / (idades[i + 1] - idades[i])
            return medianas[i] + fracao * (medianas[i + 1] - medianas[i])
    return medianas[-1]


def _hrv_tipico(age: int, sex: Sex) -> float:
    p = _HRV[sex]
    return p["rmssd_aos_30"] * (age / _HRV["idade_de_referencia"]) ** p["alfa"]


def _sono_tipico(age: int) -> float:
    idade = min(age, _SONO["idade_de_platô"])
    return _SONO["fracao_aos_30"] - _SONO["queda_por_ano"] * (idade - 30)
