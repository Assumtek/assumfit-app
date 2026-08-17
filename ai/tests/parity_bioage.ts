/**
 * Ponte de paridade: roda a implementação TypeScript da idade biológica com os
 * mesmos casos do teste Python e imprime o resultado em JSON.
 *
 * Existe porque há duas implementações da mesma conta — a do app, que funciona
 * offline, e a do serviço Python, que é a fonte da verdade. Sem esta ponte elas
 * divergem em silêncio e o usuário vê um número com rede e outro sem.
 */
import { calcBioAge, type BioAgeInput } from '../../app/src/domain/bioAge';

type PyCase = {
  real_age: number;
  sex: 'f' | 'm';
  hrv_ms: number | null;
  resting_hr: number;
  deep_sleep_pct: number | null;
  bmi?: number | null;
  weekly_active_min?: number | null;
};

const cases: PyCase[] = JSON.parse(process.argv[2]);

const results = cases.map((c) => {
  const input: BioAgeInput = {
    realAge: c.real_age,
    sex: c.sex,
    hrvMs: c.hrv_ms,
    restingHr: c.resting_hr,
    deepSleepPct: c.deep_sleep_pct,
    bmi: c.bmi ?? null,
    weeklyActiveMin: c.weekly_active_min ?? null,
  };
  // O VO₂máx entra na comparação: é o intermediário que carrega a equação
  // inteira, e uma divergência nele apareceria no número final já diluída
  // pela média ponderada.
  const { bioAge, delta, vo2max } = calcBioAge(input);
  return { bioAge, delta, vo2max };
});

process.stdout.write(JSON.stringify(results));
