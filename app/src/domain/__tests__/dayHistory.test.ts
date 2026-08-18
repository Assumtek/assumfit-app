import { diaDe, diasComDado, pontosDoDia, rotuloDoDia, ultimosDias } from '../dayHistory';

/** Uma hora local, no formato ISO que o servidor devolve. */
const hora = (dia: number, h: number) => ({ hour: new Date(2026, 7, dia, h, 0).toISOString() });

describe('ultimosDias', () => {
  it('vai do mais antigo até hoje, incluindo hoje', () => {
    const dias = ultimosDias(3, new Date(2026, 7, 18, 15, 0));
    expect(dias).toEqual(['2026-08-16', '2026-08-17', '2026-08-18']);
  });

  it('atravessa a virada do mês', () => {
    const dias = ultimosDias(3, new Date(2026, 8, 1, 9, 0));
    expect(dias).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });
});

describe('pontosDoDia', () => {
  const serie = [
    { ...hora(17, 23), hrv_ms: 40 },
    { ...hora(18, 3), hrv_ms: 44 },
    { ...hora(18, 9), hrv_ms: null },
    { ...hora(18, 14), hrv_ms: 51 },
    { ...hora(19, 1), hrv_ms: 60 },
  ];

  it('recorta o dia LOCAL inteiro, não uma janela de 24 h', () => {
    const p = pontosDoDia(serie, '2026-08-18', (x) => x.hrv_ms);
    expect(p.map((x) => x.value)).toEqual([44, 51]);
  });

  it('hora sem medição não vira zero no gráfico', () => {
    // Desenhar `null` como 0 produziria uma queda que nunca aconteceu.
    const p = pontosDoDia(serie, '2026-08-18', (x) => x.hrv_ms);
    expect(p.some((x) => x.value === 0)).toBe(false);
  });

  it('dia sem nada devolve vazio, sem estourar', () => {
    expect(pontosDoDia(serie, '2026-08-01', (x) => x.hrv_ms)).toEqual([]);
    expect(pontosDoDia([], '2026-08-18', (x: any) => x.hrv_ms)).toEqual([]);
  });

  it('sai em ordem cronológica', () => {
    const bagunçada = [
      { ...hora(18, 20), hrv_ms: 9 },
      { ...hora(18, 2), hrv_ms: 1 },
    ];
    expect(pontosDoDia(bagunçada, '2026-08-18', (x) => x.hrv_ms).map((p) => p.value)).toEqual([
      1, 9,
    ]);
  });
});

describe('diasComDado', () => {
  it('lista só os dias que têm medição da grandeza', () => {
    const serie = [
      { ...hora(16, 10), spo2_pct: 97 },
      { ...hora(17, 10), spo2_pct: null },
      { ...hora(18, 10), spo2_pct: 95 },
    ];
    const dias = diasComDado(serie, (x) => x.spo2_pct);
    expect([...dias].sort()).toEqual(['2026-08-16', '2026-08-18']);
  });
});

describe('rotuloDoDia', () => {
  it('hoje é dito por extenso; os outros levam dia da semana e número', () => {
    expect(rotuloDoDia('2026-08-18', '2026-08-18')).toBe('hoje');
    // 16/08/2026 é um domingo.
    expect(rotuloDoDia('2026-08-16', '2026-08-18')).toBe('dom 16');
  });
});

describe('diaDe', () => {
  it('usa o calendário local — não o UTC', () => {
    // 22h no Brasil (UTC−3) já é o dia seguinte em UTC.
    const noite = new Date(2026, 7, 18, 22, 30).toISOString();
    expect(diaDe(noite)).toBe('2026-08-18');
  });
});
