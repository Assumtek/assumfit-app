import axios from 'axios';

import { fetchMorningForecast, tomorrowMorningKey } from '../weather.service';

/**
 * O fuso da previsão.
 *
 * O contêiner roda em UTC e o Open-Meteo devolve horários LOCAIS do ponto
 * consultado. Quem abre o app à noite no Brasil já está no dia seguinte em UTC,
 * e o alvo calculado assim apontava para um dia que a resposta nem contém — a
 * previsão falhava, e com ela o reagendamento do "bom dia".
 */

jest.mock('axios');
const get = axios.get as unknown as jest.Mock;

/** Deslocamento de Brasília em segundos, como o provedor o devolve. */
const UTC_MENOS_3 = -3 * 3600;

/** 21h30 de 17/08 em Brasília — já 18/08 em UTC. */
const NOITE_DE_17 = Date.parse('2026-08-18T00:30:00Z');

/** As 48 horas locais que `forecast_days: 2` devolve, a partir de 00:00. */
function serieHoraria(primeiroDia: string): string[] {
  const inicio = Date.parse(`${primeiroDia}T00:00:00Z`);
  return Array.from({ length: 48 }, (_, i) =>
    new Date(inicio + i * 3_600_000).toISOString().slice(0, 16));
}

describe('alvo da manhã de amanhã', () => {
  it('às 21h no Brasil aponta para o dia seguinte LOCAL, não para o seguinte em UTC', () => {
    expect(tomorrowMorningKey(UTC_MENOS_3, [], NOITE_DE_17)).toBe('2026-08-18T07:00');
  });

  it('durante o dia chega ao mesmo alvo', () => {
    expect(tomorrowMorningKey(UTC_MENOS_3, [], Date.parse('2026-08-17T15:00:00Z'))).toBe(
      '2026-08-18T07:00');
  });

  it('a leste de Greenwich o local já virou e o alvo acompanha', () => {
    // Nova Zelândia (UTC+12): 01h de 18/08 lá, ainda 17/08 em UTC.
    expect(tomorrowMorningKey(12 * 3600, [], Date.parse('2026-08-17T13:00:00Z'))).toBe(
      '2026-08-19T07:00');
  });

  it('vira o ano', () => {
    expect(tomorrowMorningKey(UTC_MENOS_3, [], Date.parse('2026-12-31T23:00:00Z'))).toBe(
      '2027-01-01T07:00');
  });

  it('sem o deslocamento, ancora no primeiro carimbo da série', () => {
    expect(tomorrowMorningKey(undefined, serieHoraria('2026-12-31'), NOITE_DE_17)).toBe(
      '2027-01-01T07:00');
  });
});

describe('previsão da manhã de amanhã', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    get.mockReset();
  });

  it('às 21h no Brasil ainda encontra a manhã de amanhã na série', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOITE_DE_17);
    const horas = serieHoraria('2026-08-17');
    get.mockResolvedValue({
      data: {
        utc_offset_seconds: UTC_MENOS_3,
        hourly: {
          time: horas,
          temperature_2m: horas.map((_, i) => i),
          relative_humidity_2m: horas.map(() => 70),
        },
      },
    });

    // Índice 31: 24 horas do dia de hoje mais as 7 do dia seguinte.
    await expect(fetchMorningForecast(-23.5, -46.6)).resolves.toEqual({
      temperatureC: 31,
      humidityPct: 70,
      hour: '2026-08-18T07:00',
    });
  });
});
