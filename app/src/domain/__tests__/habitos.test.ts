import { horarioTipico, horariosDeRefeicao, lugaresFrequentes, menosMinutos } from '../habitos';

const as = (h: number, m = 0, dia = 1) => new Date(2026, 7, dia, h, m).getTime();

describe('horário típico', () => {
  it('é o meio do grupo que se repete, arredondado ao quarto de hora', () => {
    expect(horarioTipico([as(12, 20, 1), as(12, 35, 2), as(12, 25, 3), as(13, 50, 4), as(12, 22, 5)])).toBe('12:30');
  });

  it('não infere com menos de três ocorrências', () => {
    expect(horarioTipico([as(12), as(12, 10)])).toBeNull();
  });

  it('um jantar tardio não arrasta o horário', () => {
    expect(horarioTipico([as(19, 30), as(19, 40), as(19, 25), as(19, 35), as(23, 30)])).toBe('19:30');
  });

  it('três ocorrências espalhadas não são um hábito', () => {
    // O relato do Bruno, com os instantes que o banco de produção mostrou:
    // esporte às 09:44, treino às 15:35, treino às 20:30. A mediana da lista
    // dava 15:35, e o app afirmava "você costuma treinar por volta das 15h30"
    // a quem nunca repetiu horário nenhum. Agora não afirma nada.
    expect(horarioTipico([as(9, 44, 1), as(15, 35, 2), as(20, 30, 3)])).toBeNull();
  });

  it('não basta o grupo existir, ele precisa ser a maioria das vezes', () => {
    const tres = [as(7, 0, 1), as(7, 10, 2), as(7, 5, 3)];
    const outras = [as(12, 0, 4), as(16, 0, 5), as(20, 0, 6), as(22, 0, 7)];
    expect(horarioTipico(tres)).toBe('07:00');
    expect(horarioTipico([...tres, ...outras])).toBeNull();
  });

  it('atravessa a meia-noite: 23h50 e 00h10 são o mesmo horário', () => {
    expect(horarioTipico([as(23, 50, 1), as(0, 10, 2), as(0, 0, 3)])).toBe('00:00');
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
