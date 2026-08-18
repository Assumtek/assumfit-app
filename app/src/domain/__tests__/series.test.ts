import {
  comAmostraDeHrv,
  faixaInicial,
  noPeriodo,
  quandoFoi,
  rotulosDoPeriodo,
  type Ponto,
} from '../series';

const AGORA = new Date('2026-08-17T12:00:00Z').getTime();
const H = 3600_000;

const em = (horasAtras: number, value = 50): Ponto => ({ at: AGORA - horasAtras * H, value });

describe('noPeriodo', () => {
  const serie = [em(0.5), em(3), em(20), em(48), em(200)];

  it('recorta pela janela da faixa', () => {
    expect(noPeriodo(serie, '1H', AGORA)).toHaveLength(1);
    expect(noPeriodo(serie, '6H', AGORA)).toHaveLength(2);
    expect(noPeriodo(serie, '24H', AGORA)).toHaveLength(3);
    expect(noPeriodo(serie, '7D', AGORA)).toHaveLength(4);
  });

  it('devolve em ordem cronológica mesmo com entrada embaralhada', () => {
    const bagunçada = [em(3), em(0.5), em(20)];
    const r = noPeriodo(bagunçada, '24H', AGORA);
    expect(r.map((p) => p.at)).toEqual([...r.map((p) => p.at)].sort((a, b) => a - b));
  });

  it('série vazia não estoura', () => {
    expect(noPeriodo([], '24H', AGORA)).toEqual([]);
  });
});

describe('quandoFoi', () => {
  it('escolhe a maior unidade que couber', () => {
    expect(quandoFoi(AGORA, AGORA)).toBe('agora');
    expect(quandoFoi(AGORA - 20 * 60_000, AGORA)).toBe('há 20 min');
    expect(quandoFoi(AGORA - 3 * H, AGORA)).toBe('há 3 h');
    expect(quandoFoi(AGORA - 50 * H, AGORA)).toBe('há 2 d');
  });

  it('instante no futuro não vira número negativo', () => {
    expect(quandoFoi(AGORA + 5 * 60_000, AGORA)).toBe('agora');
  });
});

describe('rotulosDoPeriodo', () => {
  it('o eixo descreve o que está desenhado, não a janela nominal', () => {
    // Duas horas de dados dentro de uma faixa de 24 h: o eixo diz duas horas.
    const r = rotulosDoPeriodo([em(2), em(1), em(0)], AGORA);
    expect(r).toEqual(['há 2 h', 'há 1 h', 'agora']);
  });

  it('menos de dois pontos não tem eixo', () => {
    expect(rotulosDoPeriodo([em(1)], AGORA)).toEqual([]);
    expect(rotulosDoPeriodo([], AGORA)).toEqual([]);
  });
});

describe('comAmostraDeHrv', () => {
  const leitura = (hrvMs: number | null, hrvAt?: number) => ({
    hrvMs,
    hrvAt,
    recordedAt: AGORA,
  });

  it('a MESMA amostra carimbada repetida não entra duas vezes', () => {
    /*
     O defeito que este teste tranca: o batimento chega a cada poucos segundos
     carregando sempre o último HRV conhecido. Sem o carimbo, noventa eventos
     viravam noventa pontos idênticos e o gráfico desenhava uma reta.
    */
    let serie: Ponto[] = [];
    for (let i = 0; i < 30; i++) serie = comAmostraDeHrv(serie, leitura(52, AGORA - 2 * H));
    expect(serie).toHaveLength(1);
  });

  it('mesmo valor em janelas diferentes são duas medições', () => {
    let serie = comAmostraDeHrv([], leitura(52, AGORA - 2 * H));
    serie = comAmostraDeHrv(serie, leitura(52, AGORA - 1 * H));
    expect(serie).toHaveLength(2);
  });

  it('sem HRV medido a série não ganha ponto', () => {
    expect(comAmostraDeHrv([], leitura(null))).toEqual([]);
  });

  it('sem carimbo próprio, usa o instante da leitura', () => {
    expect(comAmostraDeHrv([], leitura(48))).toEqual([{ at: AGORA, value: 48 }]);
  });

  it('mantém ordem cronológica mesmo com amostra atrasada', () => {
    let serie = comAmostraDeHrv([], leitura(50, AGORA - 1 * H));
    serie = comAmostraDeHrv(serie, leitura(60, AGORA - 3 * H));
    expect(serie.map((p) => p.value)).toEqual([60, 50]);
  });

  it('respeita o limite, descartando as mais antigas', () => {
    let serie: Ponto[] = [];
    for (let i = 0; i < 10; i++) serie = comAmostraDeHrv(serie, leitura(40 + i, AGORA - i * 60_000), 4);
    expect(serie).toHaveLength(4);
    // As quatro mais RECENTES: os carimbos mais próximos de agora.
    expect(serie[serie.length - 1].at).toBe(AGORA);
  });
});

describe('faixaInicial', () => {
  it('abre na faixa mais estreita que tem curva', () => {
    expect(faixaInicial([em(0.2), em(0.6)], AGORA)).toBe('1H');
    expect(faixaInicial([em(3), em(5)], AGORA)).toBe('6H');
    expect(faixaInicial([em(30), em(40)], AGORA)).toBe('7D');
  });

  it('sem dado suficiente em nenhuma faixa, cai num padrão estável', () => {
    expect(faixaInicial([], AGORA)).toBe('24H');
    expect(faixaInicial([em(2)], AGORA)).toBe('24H');
  });
});
