import { horarioTipico, horariosDeRefeicao, lugaresFrequentes, menosMinutos } from '../habitos';

const as = (h: number, m = 0, dia = 1) => new Date(2026, 7, dia, h, m).getTime();

describe('horário típico', () => {
  it('é a mediana, arredondada ao quarto de hora', () => {
    expect(horarioTipico([as(12, 20, 1), as(12, 35, 2), as(12, 25, 3), as(13, 50, 4), as(12, 22, 5)])).toBe('12:30');
  });

  it('não infere com menos de três ocorrências', () => {
    expect(horarioTipico([as(12), as(12, 10)])).toBeNull();
  });

  it('um jantar tardio não arrasta o horário', () => {
    expect(horarioTipico([as(19, 30), as(19, 40), as(19, 25), as(19, 35), as(23, 30)])).toBe('19:30');
  });
});

describe('refeições', () => {
  it('um horário por faixa que se repete', () => {
    const cafe = [as(7, 50, 1), as(8, 5, 2), as(7, 55, 3)];
    const almoco = [as(12, 30, 1), as(12, 40, 2), as(12, 20, 3)];
    const lancheUnico = [as(16, 0, 1)];
    expect(horariosDeRefeicao([...cafe, ...almoco, ...lancheUnico])).toEqual(['08:00', '12:30']);
  });
});

describe('menos minutos', () => {
  it('gira o dia', () => {
    expect(menosMinutos('00:10', 30)).toBe('23:40');
    expect(menosMinutos('22:30', 30)).toBe('22:00');
  });
});

describe('lugares frequentes', () => {
  const academia = { lat: -23.5505, lon: -46.6333 };
  const perto = (m: number) => ({ lat: academia.lat + m / 111_195, lon: academia.lon });

  it('agrupa num raio e exige repetição', () => {
    const pontos = [academia, perto(40), perto(80), { lat: -23.6, lon: -46.7 }, { lat: -23.6, lon: -46.7 }];
    const lugares = lugaresFrequentes(pontos);
    expect(lugares).toHaveLength(1);
    expect(lugares[0].vezes).toBe(3);
    expect(Math.abs(lugares[0].lat - academia.lat)).toBeLessThan(0.001);
  });

  it('dois lugares separados viram dois grupos, o mais frequente primeiro', () => {
    const casa = { lat: -23.6, lon: -46.7 };
    const pontos = [casa, casa, casa, casa, academia, perto(30), perto(60)];
    const lugares = lugaresFrequentes(pontos);
    expect(lugares.map((l) => l.vezes)).toEqual([4, 3]);
  });
});
