import {
  pressureZones,
  rateActivity,
  rateBioAge,
  rateHeartRate,
  rateHrv,
  ratePressure,
  rateSleep,
  rateSpo2,
  rateStress,
  rateTemperature,
  stateColor,
  frescor,
  type Rating,
} from '../ratings';
import { darkPalette, lightPalette } from '../../theme/palette';

/**
 * `ratings.ts` é a única porta de saída de métrica do app: se ele erra, TODA
 * tela erra junto. Dois contratos são testados aqui.
 *
 * O primeiro é a regra de ouro: nenhuma avaliação pode devolver `detail` vazio,
 * porque é o número técnico que vai como sub-label — sem ele a tela ficaria só
 * com o adjetivo.
 *
 * O segundo é a regra do alerta: `state: 'alert'` existe para valor FORA da
 * faixa saudável, nunca para graduar o que está bem. "Bom" e "Excelente" têm
 * de sair com o mesmo estado, ou o app vira semáforo.
 */

const todas: Rating[] = [
  rateHrv(72),
  rateHeartRate(58),
  rateSpo2(98),
  rateSleep(82, 432),
  rateStress(28),
  rateTemperature(36.6),
  ratePressure(118, 76),
  rateActivity({ steps: 7842, goal: 10000 }),
  rateBioAge(5),
];

describe('contrato comum', () => {
  it('toda avaliação traz rótulo humano e dado técnico', () => {
    todas.forEach((r) => {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
      // O rótulo é linguagem humana: não pode ser só o número.
      expect(r.label).not.toMatch(/^\d+$/);
    });
  });

  it('fraction fica sempre entre 0 e 1, mesmo com entrada fora de escala', () => {
    const extremos = [rateHrv(-50), rateHrv(9999), rateSpo2(0), rateSpo2(200), rateStress(-10), rateStress(500)];
    extremos.forEach((r) => {
      expect(r.fraction).toBeGreaterThanOrEqual(0);
      expect(r.fraction).toBeLessThanOrEqual(1);
    });
  });
});

describe('alerta é reservado para fora da faixa saudável', () => {
  it('não sinaliza para distinguir Bom de Excelente', () => {
    expect(rateHrv(72).state).toBe('normal'); // Excelente
    expect(rateHrv(55).state).toBe('normal'); // Bom
    expect(rateSpo2(98).state).toBe('normal'); // Excelente
    expect(rateSpo2(96).state).toBe('normal'); // Bom
    expect(rateSleep(90, 480).state).toBe('normal');
    expect(rateSleep(75, 420).state).toBe('normal');
  });

  it('sinaliza SpO₂ abaixo de 95%', () => {
    expect(rateSpo2(96).state).toBe('normal');
    expect(rateSpo2(94).state).toBe('alert');
  });

  it('sinaliza bradicardia e taquicardia em repouso', () => {
    expect(rateHeartRate(58).state).toBe('normal');
    expect(rateHeartRate(38).state).toBe('alert');
    expect(rateHeartRate(105).state).toBe('alert');
  });

  it('sinaliza temperatura fora de 35,5–37,8 °C', () => {
    expect(rateTemperature(36.6).state).toBe('normal');
    expect(rateTemperature(38.4).state).toBe('alert');
    expect(rateTemperature(35.1).state).toBe('alert');
  });

  it('não sinaliza atividade — meta não batida não é achado clínico', () => {
    expect(rateActivity({ steps: 100, goal: 10000 }).state).toBe('normal');
  });

  it('usa a cor de acento no normal e a de alerta fora da faixa', () => {
    for (const palette of [darkPalette, lightPalette]) {
      expect(stateColor('normal', palette)).toBe(palette.accent);
      expect(stateColor('alert', palette)).toBe(palette.alert);
    }
  });

  it('muda a cor de alerta entre os temas, e só ela', () => {
    // O acento é o mesmo nos dois temas — é o que mantém a marca reconhecível.
    // O alerta NÃO pode ser: terracota claro sobre fundo claro não se lê.
    expect(lightPalette.accent).toBe(darkPalette.accent);
    expect(lightPalette.alert).not.toBe(darkPalette.alert);
  });
});

describe('pressão arterial', () => {
  it('classifica o par, não cada valor isolado', () => {
    expect(ratePressure(118, 76).zone.label).toBe('Ótima');
    expect(ratePressure(135, 85).zone.label).toBe('Elevada');
    expect(ratePressure(150, 95).zone.label).toBe('Alta');
    expect(ratePressure(85, 55).zone.label).toBe('Baixa');
  });

  it('marca como alerta apenas as zonas anormais', () => {
    expect(ratePressure(118, 76).state).toBe('normal');
    expect(ratePressure(135, 85).state).toBe('alert');
    expect(ratePressure(85, 55).state).toBe('alert');
  });

  it('sempre encontra uma zona, para qualquer entrada', () => {
    [
      [0, 0],
      [300, 200],
      [120, 40],
    ].forEach(([s, d]) => {
      expect(pressureZones.some((z) => z.matches(s, d))).toBe(true);
    });
  });
});

describe('rótulos por faixa', () => {
  it('HRV', () => {
    expect(rateHrv(75).label).toBe('Excelente');
    expect(rateHrv(60).label).toBe('Bom');
    expect(rateHrv(40).label).toBe('Pode melhorar');
  });

  it('stress', () => {
    expect(rateStress(20).label).toBe('Calmo');
    expect(rateStress(45).label).toBe('Moderado');
    expect(rateStress(80).label).toBe('Elevado');
  });

  it('sono formata a duração em horas e minutos', () => {
    expect(rateSleep(82, 432).detail).toBe('7h 12m');
    expect(rateSleep(82, 60).detail).toBe('1h 00m');
  });

  it('idade biológica descreve a diferença, não o número', () => {
    expect(rateBioAge(5).detail).toBe('−5 anos');
    expect(rateBioAge(-2).detail).toBe('+2 anos');
    expect(rateBioAge(0).detail).toBe('igual à real');
  });
});

describe('frescor', () => {
  const agora = new Date('2026-07-28T12:00:00Z').getTime();

  it('sem instante conhecido não inventa idade', () => {
    // A tela omite o trecho em vez de afirmar frescor que não sabe.
    expect(frescor(undefined, agora)).toBeNull();
  });

  it('medida recente é "agora"', () => {
    expect(frescor(agora - 60_000, agora)).toBe('agora');
  });

  it('amostra agendada de horas atrás NÃO se apresenta como corrente', () => {
    // O caso que motivou a função: o HRV desta pulseira vem de janela agendada,
    // e a tela dizia "atualiza a cada 2 s" para ele.
    expect(frescor(agora - 3 * 3_600_000, agora)).toBe('há 3 h');
  });

  it('passa para dias quando é o caso', () => {
    expect(frescor(agora - 26 * 3_600_000, agora)).toBe('ontem');
    expect(frescor(agora - 72 * 3_600_000, agora)).toBe('há 3 dias');
  });
});
