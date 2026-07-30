/**
 * Idade biológica — cálculo local do MVP (Fase 1).
 *
 * ATENÇÃO às referências abaixo: são PROVISÓRIAS. A spec original trazia uma
 * única tabela calibrada para 30–35 anos e a aplicava a qualquer idade, o que
 * penaliza injustamente quem tem 55 anos com fisiologia normal para a idade.
 * Aqui a tabela está segmentada por faixa etária para que a estrutura do
 * cálculo já esteja certa, mas os percentis ainda são estimativas de trabalho,
 * não curvas de meta-análise. As curvas reais entram em
 * `ai/data/bio_age_references.json` na Fase 2 e passam a vir do backend.
 *
 * Não é diagnóstico médico.
 */
import { DASH } from './ratings';
import type { BioAge, BioAgeFactor, Sex } from './types';

type Band = {
  maxAge: number;
  hrv: { p10: number; p50: number; p90: number };
  hr: { p10: number; p50: number; p90: number };
  spo2: { p50: number; p90: number };
  deepPct: number;
};

/** HRV cai com a idade; FC de repouso varia pouco. Ordenado por faixa. */
const BANDS: Band[] = [
  { maxAge: 29, hrv: { p10: 45, p50: 64, p90: 88 }, hr: { p10: 50, p50: 66, p90: 80 }, spo2: { p50: 97, p90: 99 }, deepPct: 0.22 },
  { maxAge: 39, hrv: { p10: 38, p50: 54, p90: 74 }, hr: { p10: 52, p50: 68, p90: 82 }, spo2: { p50: 96, p90: 98 }, deepPct: 0.2 },
  { maxAge: 49, hrv: { p10: 31, p50: 45, p90: 62 }, hr: { p10: 53, p50: 69, p90: 83 }, spo2: { p50: 96, p90: 98 }, deepPct: 0.17 },
  { maxAge: 59, hrv: { p10: 26, p50: 37, p90: 52 }, hr: { p10: 54, p50: 70, p90: 84 }, spo2: { p50: 95, p90: 97 }, deepPct: 0.15 },
  { maxAge: 200, hrv: { p10: 21, p50: 30, p90: 43 }, hr: { p10: 55, p50: 70, p90: 85 }, spo2: { p50: 95, p90: 97 }, deepPct: 0.13 },
];

/** Mulheres têm HRV ligeiramente maior e FC de repouso ligeiramente maior. */
const SEX_SHIFT: Record<Sex, { hrv: number; hr: number }> = {
  f: { hrv: 2, hr: 3 },
  m: { hrv: 0, hr: 0 },
};

function bandFor(age: number, sex: Sex): Band {
  const base = BANDS.find((b) => age <= b.maxAge) ?? BANDS[BANDS.length - 1];
  const shift = SEX_SHIFT[sex];
  return {
    ...base,
    hrv: { p10: base.hrv.p10 + shift.hrv, p50: base.hrv.p50 + shift.hrv, p90: base.hrv.p90 + shift.hrv },
    hr: { p10: base.hr.p10 + shift.hr, p50: base.hr.p50 + shift.hr, p90: base.hr.p90 + shift.hr },
  };
}

/**
 * Um dado ruim — HRV de 8 ms por artefato de movimento, por exemplo — não pode
 * produzir uma idade absurda. Cada fator e o total são limitados.
 */
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

export type BioAgeInput = {
  realAge: number;
  sex: Sex;
  hrvMs: number | null;
  restingHr: number;
  spo2Pct: number | null;
  /** `null` sem noite medida — contribui 0 anos, não penaliza. */
  deepSleepPct: number | null;
  /** Amplitude de variação da temperatura no dia, em °C. */
  /** `null` quando o aparelho não tem sensor de temperatura. */
  tempRangeC: number | null;
};

const fmt = (n: number, digits = 0) => n.toFixed(digits).replace('.', ',');

/**
 * Idade biológica a partir do que FOI medido.
 *
 * Sinal ausente contribui com zero anos — ou seja, sai da conta em vez de puxar
 * o resultado. Tratar `null` como valor mediria a pessoa contra uma referência
 * que ela não forneceu: sem HRV, `0 - p50` produziria vários anos de penalidade
 * por dado inexistente, e o número apareceria na tela com a mesma autoridade de
 * um cálculo completo.
 *
 * `factors` só lista o que entrou, então a tela mostra a decomposição honesta.
 */
export function calcBioAge(input: BioAgeInput): BioAge {
  const { realAge, sex, hrvMs, restingHr, spo2Pct, deepSleepPct, tempRangeC } = input;
  const ref = bandFor(realAge, sex);

  const dHrv = hrvMs == null ? 0 : clamp(((hrvMs - ref.hrv.p50) / (ref.hrv.p90 - ref.hrv.p50)) * 4.0, 6);
  const dHr = clamp(((ref.hr.p50 - restingHr) / (ref.hr.p50 - ref.hr.p10)) * 2.5, 4);
  const dSpo2 = spo2Pct == null ? 0 : clamp(((spo2Pct - ref.spo2.p50) / (ref.spo2.p90 - ref.spo2.p50)) * 0.8, 2);
  /*
   Ausente contribui ZERO ano, como já faziam HRV e SpO₂ logo acima.

   A alternativa seria a tela inventar um valor para satisfazer o tipo — que era
   exatamente o que acontecia: `tempRangeC: 0.8` fixo no código, para um sensor
   que esta pulseira não tem, e uma noite de sono de exemplo.
   */
  const dSleep = deepSleepPct == null ? 0 : clamp(((deepSleepPct - ref.deepPct) / 0.25) * 2.5, 4);
  const dTemp = tempRangeC == null ? 0 : clamp(((0.7 - tempRangeC) / 0.7) * 0.5, 1);

  const delta = clamp(dHrv + dHr + dSpo2 + dSleep + dTemp, 15);
  const bioAge = Math.max(18, Math.round(realAge - delta));

  const factors: BioAgeFactor[] = [
    {
      key: 'hrv',
      label: 'HRV',
      value: hrvMs == null ? DASH : `${Math.round(hrvMs)} ms`,
      reference: `média da faixa: ${ref.hrv.p50} ms`,
      years: -dHrv,
    },
    {
      key: 'sleep',
      label: 'Sono profundo',
      value: deepSleepPct == null ? DASH : `${Math.round(deepSleepPct * 100)}%`,
      reference: `média da faixa: ${Math.round(ref.deepPct * 100)}%`,
      years: -dSleep,
    },
    {
      key: 'hr',
      label: 'FC repouso',
      value: `${Math.round(restingHr)} bpm`,
      reference: `média da faixa: ${ref.hr.p50} bpm`,
      years: -dHr,
    },
    {
      key: 'spo2',
      label: 'Oxigênio noturno',
      value: spo2Pct == null ? DASH : `${Math.round(spo2Pct)}%`,
      reference: `média da faixa: ${ref.spo2.p50}%`,
      years: -dSpo2,
    },
    {
      key: 'temp',
      label: 'Regulação térmica',
      value: tempRangeC == null ? DASH : `variação ${fmt(tempRangeC, 1)}°`,
      reference: `média: 0,7°`,
      years: -dTemp,
    },
  ];

  return {
    realAge,
    bioAge,
    delta: realAge - bioAge,
    factors,
  };
}

/** Rótulo de um fator: "−3,2a" rejuvenesce, "+0,4a" envelhece. */
export function formatYears(years: number): string {
  const sign = years <= 0 ? '−' : '+';
  return `${sign}${fmt(Math.abs(years), 1)}a`;
}
