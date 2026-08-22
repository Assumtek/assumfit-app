import { energyState, type EnergyInput } from '../energy';
import type { Reading, SleepNight } from '../types';

/**
 * O score de energia carrega a ressalva mais importante do produto: HRV em
 * valor absoluto não significa nada, só o desvio contra a linha de base da
 * própria pessoa. Estes testes travam justamente isso — que o modo calibrando
 * seja honesto, e que com baseline a mesma leitura produza scores diferentes
 * para pessoas diferentes.
 */

const reading = (over: Partial<Reading> = {}): Reading => ({
  recordedAt: Date.now(),
  hrvMs: 60,
  heartRate: 60,
  spo2Pct: 98,
  temperatureC: 36.6,
  steps: 5000,
  bpSystolic: 118,
  bpDiastolic: 76,
  stressScore: 30,
  respRate: 14,
  source: 'mock', ...over,
});

const sleep: SleepNight = {
  date: 'hoje',
  score: 80,
  deepContinuity: null,
  totalMin: 420,
  phases: { rem: 90, deep: 170, light: 130, awake: 30 },
  segments: [{ phase: 'deep', minutes: 420 }],
  spo2Night: [97],
};

const input = (over: Partial<EnergyInput> = {}): EnergyInput => ({
  reading: reading(),
  sleep,
  hour: 9, ...over,
});

describe('calibração', () => {
  it('declara-se calibrando sem linha de base pessoal', () => {
    expect(energyState(input()).calibrating).toBe(true);
  });

  it('sai do modo calibrando quando recebe a linha de base', () => {
    expect(energyState(input({ hrvBaseline: 60 })).calibrating).toBe(false);
  });

  it('a MESMA leitura vale coisas diferentes para linhas de base diferentes', () => {
    // 60 ms é ótimo para quem tem base de 45, e ruim para quem tem base de 90.
    const acimaDaPropriaBase = energyState(input({ hrvBaseline: 45 }));
    const abaixoDaPropriaBase = energyState(input({ hrvBaseline: 90 }));

    expect(acimaDaPropriaBase.score).toBeGreaterThan(abaixoDaPropriaBase.score);
  });
});

describe('prior circadiano', () => {
  it('reconhece o vale da tarde entre o pico da manhã e o segundo pico', () => {
    const manha = energyState(input({ hour: 9 })).score;
    const vale = energyState(input({ hour: 14 })).score;
    const segundoPico = energyState(input({ hour: 17 })).score;

    expect(vale).toBeLessThan(manha);
    expect(segundoPico).toBeGreaterThan(vale);
  });

  it('mantém a madrugada baixa', () => {
    expect(energyState(input({ hour: 3 })).score).toBeLessThan(energyState(input({ hour: 9 })).score);
  });
});

describe('sinais fisiológicos', () => {
  it('sobe com HRV maior e desce com FC de repouso maior', () => {
    const bom = energyState(input({ reading: reading({ hrvMs: 85, heartRate: 50 }) }));
    const ruim = energyState(input({ reading: reading({ hrvMs: 30, heartRate: 85 }) }));
    expect(bom.score).toBeGreaterThan(ruim.score);
  });

  it('sobe com sono melhor', () => {
    const dormiuBem = energyState(input({ sleep: { ...sleep, score: 95 } }));
    const dormiuMal = energyState(input({ sleep: { ...sleep, score: 35 } }));
    expect(dormiuBem.score).toBeGreaterThan(dormiuMal.score);
  });
});

describe('saída para a tela', () => {
  it('o score fica sempre entre 0 e 100', () => {
    const extremos = [
      energyState(input({ reading: reading({ hrvMs: 0, heartRate: 200, temperatureC: 30 }), hour: 3 })),
      energyState(input({ reading: reading({ hrvMs: 999, heartRate: 30 }), hour: 9 })),
    ];
    extremos.forEach((e) => {
      expect(e.score).toBeGreaterThanOrEqual(0);
      expect(e.score).toBeLessThanOrEqual(100);
    });
  });

  it('cada nível traz uma ação imperativa e única', () => {
    const niveis = [
      energyState(input({ reading: reading({ hrvMs: 95, heartRate: 48 }), sleep: { ...sleep, score: 98 }, hour: 9 })),
      energyState(input({ hour: 14 })),
      energyState(input({ reading: reading({ hrvMs: 22, heartRate: 92 }), sleep: { ...sleep, score: 30 }, hour: 3 })),
    ];

    expect(niveis.map((n) => n.level)).toEqual(['high', 'mid', 'low']);
    niveis.forEach((n) => {
      expect(n.action.label.length).toBeGreaterThan(0);
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.description.length).toBeGreaterThan(0);
    });
  });
});
