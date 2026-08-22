import { horaCurta, normalizarHorario } from '../horario';

describe('normalizarHorario', () => {
  it.each([
    ['07:50', '07:50'],
    ['7:5', '07:05'],
    ['7:50', '07:50'],
    ['19h30', '19:30'],
    ['19H', '19:00'],
    ['0750', '07:50'],
    ['750', '07:50'],
    ['1930', '19:30'],
    ['8', '08:00'],
    [' 12 : 30 ', '12:30'],
    ['23:59', '23:59'],
    ['00:00', '00:00'],
  ])('entende "%s" como %s', (entrada, esperado) => {
    expect(normalizarHorario(entrada)).toBe(esperado);
  });

  it.each(['24:00', '10:75', '99', 'abc', '', '   ', '12:3x', '1:2:3', '12345'])(
    'recusa "%s", lembrete na hora errada é pior que nenhum',
    (entrada) => {
      expect(normalizarHorario(entrada)).toBeNull();
    });
});

describe('horaCurta', () => {
  it.each([
    ['10:00', '10h'],
    ['07:00', '7h'],
    ['19:30', '19h30'],
    ['07:55', '7h55'],
  ])('%s → %s', (entrada, esperado) => {
    expect(horaCurta(entrada)).toBe(esperado);
  });
});
