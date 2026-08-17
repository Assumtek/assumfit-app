/**
 * Idade biológica — idade fisiológica estimada, a partir de literatura revisada.
 *
 * Espelho em TypeScript de `ai/models/bio_age.py`, que é a fonte da verdade.
 * Existe para o número aparecer offline, e o teste de paridade
 * (`ai/tests/test_models.py::TestParidadeComTypeScript`) impede as duas contas
 * de divergirem em silêncio. **Mexeu aqui, rode aquele teste.**
 *
 * O que este número é: a idade em que os marcadores medidos seriam a MEDIANA
 * da população. Não é relógio epigenético, exame nem diagnóstico.
 *
 * O caminho da conta, com as fontes:
 *
 * 1. VO₂máx estimado por equação de não-exercício — Jurca R, et al. *Assessing
 *    cardiorespiratory fitness without performing exercise testing*. Am J Prev
 *    Med. 2005;29(3):185-193 (Tabela 5, coluna NASA).
 * 2. Idade da aptidão pela mediana populacional — Kaminsky LA, Arena R, Myers
 *    J. Mayo Clin Proc. 2015;90(11):1515-1523 (registro FRIEND, esteira).
 * 3. Idade do HRV pela lei de potência do RMSSD medido por PPG de pulseira —
 *    Natarajan A, et al. Lancet Digit Health. 2020;2(12):e650-e657 (Tabela 1).
 * 4. Idade do sono profundo — Ohayon MM, et al. Sleep. 2004;27(7):1255-1273.
 *
 * A versão anterior comparava percentis inventados (o arquivo de dados avisava
 * disso em maiúsculas) e somava pesos em anos escolhidos a olho: o número saía
 * plausível e não significava nada.
 */
import { DASH } from './ratings';
import type { BioAge, BioAgeFactor, Sex } from './types';

/** 1 MET = 3,5 mL O₂ · kg⁻¹ · min⁻¹ — a definição do próprio Jurca. */
const ML_POR_MET = 3.5;

/** Jurca 2005, Tabela 5 (NASA): R = 0,81; SEE = 1,45 MET. */
const VO2_EQ = {
  intercepto: 18.07,
  sexoMasculino: 2.77,
  porAnoDeIdade: -0.1,
  porPontoDeImc: -0.17,
  porBpmDeFcRepouso: -0.03,
};

/**
 * Categorias SR-PA de Jurca (Tabela 1, NASA), traduzidas para os minutos
 * semanais REGISTRADOS no app — dado medido no lugar de autorrelato.
 */
const ATIVIDADE = [
  { nivel: 0, coef: 0.0, minSemanais: 0, descricao: 'pouca atividade além de caminhar' },
  { nivel: 1, coef: 0.32, minSemanais: 1, descricao: 'alguma prática regular de esporte ou recreação' },
  { nivel: 2, coef: 1.06, minSemanais: 20, descricao: '20 a 60 minutos de aeróbio por semana' },
  { nivel: 3, coef: 1.76, minSemanais: 60, descricao: '1 a 3 horas de aeróbio por semana' },
  { nivel: 4, coef: 3.03, minSemanais: 180, descricao: 'mais de 3 horas de aeróbio por semana' },
];

/** FRIEND (Kaminsky 2015): percentil 50 de VO₂máx no ponto médio de cada década. */
const VO2_NORMA = {
  idadeCentral: [24.5, 34.5, 44.5, 54.5, 64.5, 74.5],
  m: [48.0, 42.4, 37.8, 32.6, 28.2, 24.4],
  f: [37.6, 30.2, 26.7, 23.4, 20.0, 18.3],
  /** O estudo cobre 20 a 79 anos; fora disso não se afirma idade. */
  idadeMinima: 20,
  idadeMaxima: 79,
};

/** Natarajan 2020, Tabela 1: HRV(idade) = HRV30 × (idade/30)^α. */
const HRV_NORMA = {
  idadeDeReferencia: 30,
  m: { rmssdAos30: 44.8, alfa: -0.804 },
  f: { rmssdAos30: 43.7, alfa: -0.666 },
  idadeMinima: 20,
  idadeMaxima: 79,
};

/** Ohayon 2004: o N3 cai ~2 pontos percentuais por década até os 60 anos. */
const SONO_NORMA = { fracaoAos30: 0.2, quedaPorAno: 0.002, idadeDePlato: 60 };

/**
 * Peso de cada idade equivalente. É CALIBRAÇÃO declarada, não resultado de
 * estudo: a aptidão pesa mais porque tem a associação mais forte com
 * mortalidade entre os marcadores usados (o próprio Jurca cita 9–10 METs em
 * homens e 7–8 em mulheres associados a ≥50% menos risco de morte).
 */
const PESOS = { aptidao: 0.6, hrv: 0.25, sono: 0.15 };

const LIMITES = {
  desvioMaximoPorFator: 20,
  desvioMaximoTotal: 15,
  idadeMinima: 18,
  imcMinimo: 15,
  imcMaximo: 50,
  /** Meio da faixa saudável da OMS: o palpite que menos move o resultado. */
  imcPadrao: 24,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type BioAgeInput = {
  realAge: number;
  sex: Sex;
  hrvMs: number | null;
  restingHr: number;
  /** `null` sem noite medida — sai da média em vez de valer zero. */
  deepSleepPct: number | null;
  /** Da anamnese (peso e altura). `null` usa o IMC padrão. */
  bmi?: number | null;
  /** Minutos de treino e esporte registrados na semana. */
  weeklyActiveMin?: number | null;
  /** Aceitos e ignorados: saíram do cálculo por falta de norma por idade. */
  spo2Pct?: number | null;
  tempRangeC?: number | null;
};

export function activityLevel(weeklyActiveMin: number | null | undefined): number {
  if (weeklyActiveMin == null) return 0;
  let nivel = 0;
  for (const faixa of ATIVIDADE) if (weeklyActiveMin >= faixa.minSemanais) nivel = faixa.nivel;
  return nivel;
}

export function estimateVo2max(input: {
  age: number;
  sex: Sex;
  bmi: number;
  restingHr: number;
  weeklyActiveMin: number | null | undefined;
}): number {
  const nivel = activityLevel(input.weeklyActiveMin);
  const coefPa = ATIVIDADE.find((f) => f.nivel === nivel)!.coef;

  const mets =
    VO2_EQ.intercepto +
    (input.sex === 'm' ? VO2_EQ.sexoMasculino : 0) +
    VO2_EQ.porAnoDeIdade * input.age +
    VO2_EQ.porPontoDeImc * clamp(input.bmi, LIMITES.imcMinimo, LIMITES.imcMaximo) +
    VO2_EQ.porBpmDeFcRepouso * input.restingHr +
    coefPa;

  // Piso de 1 MET: a reta pode devolver negativo em combinações extremas que
  // não existem em fisiologia.
  return Math.max(1, mets) * ML_POR_MET;
}

/** A idade cuja mediana populacional de VO₂máx é este valor (FRIEND). */
export function fitnessAge(vo2max: number, sex: Sex): number {
  const idades = VO2_NORMA.idadeCentral;
  const medianas = VO2_NORMA[sex];

  if (vo2max >= medianas[0]) {
    const inclinacao = (medianas[1] - medianas[0]) / (idades[1] - idades[0]);
    return idades[0] + (vo2max - medianas[0]) / inclinacao;
  }
  if (vo2max <= medianas[medianas.length - 1]) {
    const n = idades.length - 1;
    const inclinacao = (medianas[n] - medianas[n - 1]) / (idades[n] - idades[n - 1]);
    return idades[n] + (vo2max - medianas[n]) / inclinacao;
  }
  for (let i = 0; i < idades.length - 1; i++) {
    const alto = medianas[i];
    const baixo = medianas[i + 1];
    if (vo2max <= alto && vo2max >= baixo) {
      const fracao = (alto - vo2max) / (alto - baixo);
      return idades[i] + fracao * (idades[i + 1] - idades[i]);
    }
  }
  return idades[idades.length - 1];
}

/** A idade em que este RMSSD é o típico (Natarajan 2020). */
export function hrvAge(rmssdMs: number, sex: Sex): number {
  const p = HRV_NORMA[sex];
  if (rmssdMs <= 0) return HRV_NORMA.idadeDeReferencia;
  return HRV_NORMA.idadeDeReferencia * Math.pow(rmssdMs / p.rmssdAos30, 1 / p.alfa);
}

/** A idade em que esta fração de sono profundo é a esperada (Ohayon 2004). */
export function deepSleepAge(deepFraction: number): number {
  const esperadoNoPlato =
    SONO_NORMA.fracaoAos30 - SONO_NORMA.quedaPorAno * (SONO_NORMA.idadeDePlato - 30);
  if (deepFraction <= esperadoNoPlato) return SONO_NORMA.idadeDePlato;
  return 30 + (SONO_NORMA.fracaoAos30 - deepFraction) / SONO_NORMA.quedaPorAno;
}

function medianaNaIdade(age: number, sex: Sex): number {
  const idades = VO2_NORMA.idadeCentral;
  const medianas = VO2_NORMA[sex];
  if (age <= idades[0]) return medianas[0];
  if (age >= idades[idades.length - 1]) return medianas[medianas.length - 1];
  for (let i = 0; i < idades.length - 1; i++) {
    if (age >= idades[i] && age <= idades[i + 1]) {
      const fracao = (age - idades[i]) / (idades[i + 1] - idades[i]);
      return medianas[i] + fracao * (medianas[i + 1] - medianas[i]);
    }
  }
  return medianas[medianas.length - 1];
}

const hrvTipico = (age: number, sex: Sex) =>
  HRV_NORMA[sex].rmssdAos30 * Math.pow(age / HRV_NORMA.idadeDeReferencia, HRV_NORMA[sex].alfa);

const sonoTipico = (age: number) =>
  SONO_NORMA.fracaoAos30 - SONO_NORMA.quedaPorAno * (Math.min(age, SONO_NORMA.idadeDePlato) - 30);

export function calcBioAge(input: BioAgeInput): BioAge {
  const { realAge, sex, hrvMs, restingHr, deepSleepPct } = input;
  const imc = clamp(input.bmi ?? LIMITES.imcPadrao, LIMITES.imcMinimo, LIMITES.imcMaximo);
  const limite = LIMITES.desvioMaximoPorFator;

  const vo2 = estimateVo2max({
    age: realAge,
    sex,
    bmi: imc,
    restingHr,
    weeklyActiveMin: input.weeklyActiveMin,
  });

  // Dois limites, por razões diferentes: o DOMÍNIO é onde o estudo olhou, e o
  // limite por fator protege contra artefato de medição.
  const idadeAptidao = clamp(
    clamp(fitnessAge(vo2, sex), VO2_NORMA.idadeMinima, VO2_NORMA.idadeMaxima),
    realAge - limite,
    realAge + limite,
  );
  const idadeHrv =
    hrvMs == null
      ? null
      : clamp(
          clamp(hrvAge(hrvMs, sex), HRV_NORMA.idadeMinima, HRV_NORMA.idadeMaxima),
          realAge - limite,
          realAge + limite,
        );
  const idadeSono =
    deepSleepPct == null
      ? null
      : clamp(deepSleepAge(deepSleepPct), realAge - limite, realAge + limite);

  // Média ponderada só do que existe: o peso do ausente é redistribuído.
  const partes: [number, number][] = [[idadeAptidao, PESOS.aptidao]];
  if (idadeHrv != null) partes.push([idadeHrv, PESOS.hrv]);
  if (idadeSono != null) partes.push([idadeSono, PESOS.sono]);
  const pesoTotal = partes.reduce((s, [, p]) => s + p, 0);
  const idadeEstimada = partes.reduce((s, [v, p]) => s + v * p, 0) / pesoTotal;

  const desvio = clamp(
    idadeEstimada - realAge,
    -LIMITES.desvioMaximoTotal,
    LIMITES.desvioMaximoTotal,
  );
  const bioAge = Math.max(LIMITES.idadeMinima, Math.round(realAge + desvio));

  const nivel = activityLevel(input.weeklyActiveMin);
  const descricaoAtividade = ATIVIDADE.find((f) => f.nivel === nivel)!.descricao;

  const factors: BioAgeFactor[] = [
    {
      key: 'fitness',
      label: 'Aptidão cardiorrespiratória',
      value: `VO₂máx ${vo2.toFixed(1).replace('.', ',')} ml/kg/min`,
      reference: `mediana da sua idade: ${medianaNaIdade(realAge, sex).toFixed(1).replace('.', ',')}`,
      years: idadeAptidao - realAge,
    },
    {
      key: 'hrv',
      label: 'HRV',
      value: hrvMs == null ? DASH : `${Math.round(hrvMs)} ms`,
      reference: `típico aos ${realAge}: ${Math.round(hrvTipico(realAge, sex))} ms`,
      years: idadeHrv == null ? 0 : idadeHrv - realAge,
    },
    {
      key: 'sleep',
      label: 'Sono profundo',
      value: deepSleepPct == null ? DASH : `${Math.round(deepSleepPct * 100)}%`,
      reference: `típico aos ${realAge}: ${Math.round(sonoTipico(realAge) * 100)}%`,
      years: idadeSono == null ? 0 : idadeSono - realAge,
    },
    {
      key: 'activity',
      label: 'Atividade semanal',
      value: input.weeklyActiveMin == null ? DASH : `${Math.round(input.weeklyActiveMin)} min`,
      reference: descricaoAtividade,
      // A atividade ENTRA na aptidão; somá-la de novo seria contar duas vezes.
      years: 0,
    },
  ];

  return { realAge, bioAge, delta: realAge - bioAge, factors, vo2max: Number(vo2.toFixed(1)) };
}

/**
 * `-2.4` → `−2,4a`. O sinal é o da CONTA, não da leitura: anos negativos
 * significam que o marcador puxa a idade para baixo — mais jovem.
 */
export function formatYears(years: number): string {
  const sinal = years <= 0 ? '−' : '+';
  return `${sinal}${Math.abs(years).toFixed(1).replace('.', ',')}a`;
}
