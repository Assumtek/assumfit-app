import { aguaAtrasada, camposParaGravar } from '../habits.service';

const t = (iso: string) => new Date(iso);
const gravado = (waterMl: number, waterAt: string | null) => ({
  waterMl,
  waterAt: waterAt ? t(waterAt) : null,
});

describe('escrita de água fora de ordem', () => {
  it('escrita mais nova passa', () => {
    const campos = camposParaGravar(
      gravado(400, '2026-08-24T22:03:59.100Z'),
      { waterMl: 600 },
      t('2026-08-24T22:03:59.400Z'));
    expect(campos.waterMl).toBe(600);
    expect(campos.waterAt).toEqual(t('2026-08-24T22:03:59.400Z'));
  });

  it('escrita atrasada é descartada, mesmo trazendo total menor', () => {
    // O caso de produção: cinco PUT no mesmo segundo, e o de 200 chegou por
    // último. Sem esta guarda, o dia inteiro virava 200.
    const campos = camposParaGravar(
      gravado(1000, '2026-08-24T22:03:59.400Z'),
      { waterMl: 200 },
      t('2026-08-24T22:03:59.100Z'));
    expect(campos.waterMl).toBeUndefined();
    expect(campos.waterAt).toBeUndefined();
  });

  it('a água atrasada sai, mas o resto da escrita fica', () => {
    const campos = camposParaGravar(
      gravado(1000, '2026-08-24T22:03:59.400Z'),
      { waterMl: 200, sleepScore: 82 },
      t('2026-08-24T22:03:59.100Z'));
    expect(campos.waterMl).toBeUndefined();
    expect(campos.sleepScore).toBe(82);
  });

  it('sem carimbo dos dois lados, a escrita vale', () => {
    // App antigo continua funcionando. Recusar por precaução perderia água de
    // verdade para evitar um problema hipotético.
    expect(aguaAtrasada(gravado(1000, null), t('2026-08-24T22:00:00Z'))).toBe(false);
    expect(aguaAtrasada(gravado(1000, '2026-08-24T22:00:00Z'), null)).toBe(false);
    expect(camposParaGravar(gravado(1000, null), { waterMl: 200 }, null).waterMl).toBe(200);
  });

  it('dia que ainda não existe aceita a primeira escrita', () => {
    const campos = camposParaGravar(null, { waterMl: 200 }, t('2026-08-24T22:00:00Z'));
    expect(campos.waterMl).toBe(200);
    expect(campos.waterAt).toEqual(t('2026-08-24T22:00:00Z'));
  });

  it('redução intencional passa: ela sempre chega com carimbo mais novo', () => {
    // Remover um gole e ajustar o total DEVEM diminuir a água. A guarda é
    // contra ordem de chegada, não contra decisão de gente.
    const campos = camposParaGravar(
      gravado(1000, '2026-08-24T22:00:00Z'),
      { waterMl: 800 },
      t('2026-08-24T22:05:00Z'));
    expect(campos.waterMl).toBe(800);
  });

  it('escrita só de sono não carimba a água', () => {
    // Senão uma noite gravada de madrugada marcaria a água como recém-escrita
    // e barraria o primeiro copo do dia seguinte.
    const campos = camposParaGravar(gravado(1000, '2026-08-24T22:00:00Z'), { sleepScore: 90 }, t('2026-08-25T06:00:00Z'));
    expect(campos.waterAt).toBeUndefined();
    expect(campos.sleepScore).toBe(90);
  });
});
