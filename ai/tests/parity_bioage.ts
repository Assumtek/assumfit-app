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
  hrv_ms: number;
  resting_hr: number;
  spo2_pct: number;
  deep_sleep_pct: number;
  temp_range_c: number;
};

const cases: PyCase[] = JSON.parse(process.argv[2]);

const results = cases.map((c) => {
  const input: BioAgeInput = {
    realAge: c.real_age,
    sex: c.sex,
    hrvMs: c.hrv_ms,
    restingHr: c.resting_hr,
    spo2Pct: c.spo2_pct,
    deepSleepPct: c.deep_sleep_pct,
    tempRangeC: c.temp_range_c,
  };
  const { bioAge, delta } = calcBioAge(input);
  return { bioAge, delta };
});

process.stdout.write(JSON.stringify(results));
