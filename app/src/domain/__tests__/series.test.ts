import {
  comAmostraDeHrv,
  medidoEm,
  ultimoInstante,
  faixaInicial,
  noPeriodo,
  quandoFoi,
  rotulosDoPeriodo,
  type Ponto,
  batimentoAoVivo,
  batimentoMedidoEm, mesclarSeries } from '../series';

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
  it('abre na faixa mais estreita que tem medição', () => {
    expect(faixaInicial([em(0.2), em(0.6)], AGORA)).toBe('1H');
    expect(faixaInicial([em(3), em(5)], AGORA)).toBe('6H');
    expect(faixaInicial([em(30), em(40)], AGORA)).toBe('7D');
  });

  it('UMA medição já escolhe a faixa — ela vira ponto no gráfico', () => {
    // Exigir duas escondia a única medição que existia, justamente de quem
    // acabou de medir pela primeira vez e quer ver onde caiu.
    expect(faixaInicial([em(2)], AGORA)).toBe('6H');
    expect(faixaInicial([em(0.5)], AGORA)).toBe('1H');
  });

  it('sem medição nenhuma, cai num padrão estável', () => {
    expect(faixaInicial([], AGORA)).toBe('24H');
    expect(faixaInicial([em(200)], AGORA)).toBe('24H');
  });
});

describe('ultimoInstante', () => {
  it('série vazia não confunde com amostra de 1970', () => {
    expect(ultimoInstante([])).toBe(0);
  });

  it('acha a mais nova mesmo fora de ordem', () => {
    expect(ultimoInstante([em(5), em(0), em(9)])).toBe(AGORA);
  });
});

describe('série no TETO: medição nova precisa ser detectável', () => {
  /*
   O defeito visto no primeiro teste em aparelho: a detecção de "mediu ou veio
   vazio" contava ITENS. Desde que a série passou a ser preenchida da memória da
   pulseira, ela chega no teto — e aí cada medição bem-sucedida empurra a mais
   antiga para fora, o tamanho fica igual, e o app acusava "concluiu sem
   devolver valor" sobre uma medição que deu certo.
  */
  const LIMITE = 90;
  const cheia: Ponto[] = Array.from({ length: LIMITE }, (_, i) => ({
    at: AGORA - (LIMITE - i) * 60_000,
    value: 50,
  }));

  it('o tamanho NÃO muda — é por isso que contar itens mentia', () => {
    const depois = comAmostraDeHrv(cheia, { hrvMs: 61, hrvAt: AGORA, recordedAt: AGORA }, LIMITE);
    expect(depois).toHaveLength(cheia.length);
  });

  it('o carimbo muda, e é ele que prova que a medição chegou', () => {
    const antes = ultimoInstante(cheia);
    const depois = comAmostraDeHrv(cheia, { hrvMs: 61, hrvAt: AGORA, recordedAt: AGORA }, LIMITE);
    expect(ultimoInstante(depois)).toBeGreaterThan(antes);
  });

  it('medição que NÃO chegou deixa o carimbo parado', () => {
    const antes = ultimoInstante(cheia);
    const depois = comAmostraDeHrv(cheia, { hrvMs: null, recordedAt: AGORA }, LIMITE);
    expect(ultimoInstante(depois)).toBe(antes);
  });
});

describe('medidoEm', () => {
  // 17/08/2026 às 12:00 no fuso local — o mesmo AGORA do resto do arquivo.
  const local = (dia: number, hora: number, min = 0) =>
    new Date(2026, 7, dia, hora, min).getTime();
  const agora = local(17, 12);

  it('hoje vira a hora, sem data', () => {
    expect(medidoEm(local(17, 9, 5), agora)).toBe('hoje às 09:05');
  });

  it('ontem é dito por extenso', () => {
    expect(medidoEm(local(16, 22, 10), agora)).toBe('ontem às 22:10');
  });

  it('mais velho ganha data curta, sem o ano do ano corrente', () => {
    expect(medidoEm(local(14, 9, 15), agora)).toBe('14/08 às 09:15');
  });

  it('ano diferente aparece, porque aí ele informa', () => {
    expect(medidoEm(new Date(2025, 11, 31, 23, 40).getTime(), agora)).toBe(
      '31/12/2025 às 23:40',
    );
  });

  it('meia-noite não vira "ontem" por arredondamento', () => {
    // 00:10 de hoje é HOJE, ainda que faltem menos de 24 h para agora.
    expect(medidoEm(local(17, 0, 10), agora)).toBe('hoje às 00:10');
    // e 23:50 de ontem é ONTEM, ainda que faltem menos de 24 h.
    expect(medidoEm(local(16, 23, 50), agora)).toBe('ontem às 23:50');
  });
});


/**
 * O batimento ao vivo — o defeito que fez a corrida do Leonardo marcar 53 bpm.
 *
 * O serviço acumula as grandezas campo a campo e reemite a leitura INTEIRA a
 * cada evento. Passos mudam a cada passada; cada um desses eventos recarimbava
 * o último batimento com a hora de agora. A trava de frescor lia esse carimbo e
 * aprovava — a frequência de repouso aparecia rotulada como ao vivo.
 */
describe('batimentoAoVivo', () => {
  const AGORA = 1_700_000_000_000;

  it('o cenário do relato: leitura recém-chegada, batimento de meia hora atrás', () => {
    const leitura = {
      heartRate: 53,
      heartRateAt: AGORA - 30 * 60_000,
      // Um evento de passos acabou de reemitir a leitura inteira.
      recordedAt: AGORA - 500,
    };
    expect(batimentoAoVivo(leitura, AGORA)).toBe(false);
  });

  it('batimento recente é ao vivo', () => {
    expect(batimentoAoVivo({ heartRate: 148, heartRateAt: AGORA - 3_000, recordedAt: AGORA }, AGORA)).toBe(true);
  });

  it('passado o teto, deixa de ser ao vivo', () => {
    expect(batimentoAoVivo({ heartRate: 148, heartRateAt: AGORA - 25_000, recordedAt: AGORA }, AGORA)).toBe(false);
  });

  it('sem `heartRateAt`, cai em `recordedAt` — mock e GATT não separam os dois', () => {
    expect(batimentoAoVivo({ heartRate: 60, recordedAt: AGORA - 2_000 }, AGORA)).toBe(true);
    expect(batimentoAoVivo({ heartRate: 60, recordedAt: AGORA - 60_000 }, AGORA)).toBe(false);
  });

  it('zero não é batimento', () => {
    // O acumulador nasce com `heartRate: 0`. Zero é ausência, não bradicardia.
    expect(batimentoAoVivo({ heartRate: 0, heartRateAt: AGORA, recordedAt: AGORA }, AGORA)).toBe(false);
    expect(batimentoAoVivo(null, AGORA)).toBe(false);
  });
});

describe('batimentoMedidoEm', () => {
  it('devolve o instante da MEDIDA, não o da chegada', () => {
    expect(batimentoMedidoEm({ heartRateAt: 111, recordedAt: 999 })).toBe(111);
    expect(batimentoMedidoEm({ recordedAt: 999 })).toBe(999);
    expect(batimentoMedidoEm(null)).toBeNull();
  });
});

describe('mesclarSeries', () => {
  const p = (at: number, value: number) => ({ at, value });

  it('mantém o que chegou ao vivo depois do último ponto da memória', () => {
    const memoria = [p(1000, 70), p(2000, 72)];
    const vivo = [p(1500, 71), p(2500, 150), p(3000, 160)];
    expect(mesclarSeries(memoria, vivo)).toEqual([p(1000, 70), p(2000, 72), p(2500, 150), p(3000, 160)]);
  });

  it('sem memória, vale o vivo', () => {
    expect(mesclarSeries([], [p(1, 60)])).toEqual([p(1, 60)]);
  });

  it('respeita o teto', () => {
    const memoria = Array.from({ length: 100 }, (_, i) => p(i, 60));
    expect(mesclarSeries(memoria, [p(200, 90)], 90)).toHaveLength(90);
  });
});
