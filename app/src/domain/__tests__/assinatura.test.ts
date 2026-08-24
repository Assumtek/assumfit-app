import {
  EIXOS,
  assinaturaDoDia,
  fraseDaAssinatura,
  eixosMedidos,
  maiorDesvio,
  pontaDoEixo,
  segmentos,
  vertice,
} from '../assinatura';
import type { DailySummary } from '../../services/api.service';

const dia = (day: string, campos: Partial<DailySummary> = {}): DailySummary => ({
  day,
  readings: 100,
  heart_rate: 60,
  heart_rate_min: 50,
  heart_rate_max: 120,
  hrv_ms: 50,
  spo2_pct: 97,
  spo2_min: 95,
  stress_score: 40,
  bp_systolic: null,
  bp_diastolic: null,
  steps: 8000,
  energy_score: 70,
  sleep_score: 80,
  sleep_minutes: 420,
  ...campos,
});

const META = 10_000;
const centro = { x: 100, y: 100 };

describe('assinatura do dia', () => {
  it('traz os cinco eixos, sempre na mesma ordem', () => {
    const eixos = assinaturaDoDia({ hoje: dia('2026-08-24'), dias: [], metaDePassos: META, dataDeHoje: '2026-08-24' });
    expect(eixos.map((e) => e.chave)).toEqual(['sono', 'energia', 'recuperacao', 'atividade', 'calma']);
  });

  it('calma é o avesso do estresse', () => {
    const [, , , , calma] = assinaturaDoDia({
      hoje: dia('2026-08-24', { stress_score: 25 }),
      dias: [],
      metaDePassos: META,
      dataDeHoje: '2026-08-24',
    });
    expect(calma.fracao).toBeCloseTo(0.75);
  });

  it('sensor calado vale null, nunca zero', () => {
    // O defeito que este teste existe para impedir: um dia sem sono medido
    // desenhava um vértice colado no centro, indistinguível de uma noite ruim.
    const eixos = assinaturaDoDia({
      hoje: dia('2026-08-24', { sleep_score: null, hrv_ms: null }),
      dias: [],
      metaDePassos: META,
      dataDeHoje: '2026-08-24',
    });
    expect(eixos.find((e) => e.chave === 'sono')!.fracao).toBeNull();
    expect(eixos.find((e) => e.chave === 'recuperacao')!.fracao).toBeNull();
    expect(eixos.find((e) => e.chave === 'energia')!.fracao).toBeCloseTo(0.7);
  });

  it('a média não inclui o dia de hoje', () => {
    const eixos = assinaturaDoDia({
      hoje: dia('2026-08-24', { sleep_score: 20 }),
      dias: [
        dia('2026-08-21', { sleep_score: 90 }),
        dia('2026-08-22', { sleep_score: 90 }),
        dia('2026-08-23', { sleep_score: 90 }),
        dia('2026-08-24', { sleep_score: 20 }),
      ],
      metaDePassos: META,
      dataDeHoje: '2026-08-24',
    });
    const sono = eixos.find((e) => e.chave === 'sono')!;
    expect(sono.fracao).toBeCloseTo(0.2);
    expect(sono.media).toBeCloseTo(0.9);
  });

  it('menos de três dias medidos não formam um "de sempre"', () => {
    const eixos = assinaturaDoDia({
      hoje: dia('2026-08-24'),
      dias: [dia('2026-08-22'), dia('2026-08-23')],
      metaDePassos: META,
      dataDeHoje: '2026-08-24',
    });
    expect(eixos.every((e) => e.media === null)).toBe(true);
  });

  it('dia sem medida do eixo não entra na média dele, mas não derruba os outros', () => {
    const dias = [
      dia('2026-08-20', { sleep_score: null }),
      dia('2026-08-21', { sleep_score: 60 }),
      dia('2026-08-22', { sleep_score: 60 }),
      dia('2026-08-23', { sleep_score: 60 }),
    ];
    const eixos = assinaturaDoDia({ hoje: dia('2026-08-24'), dias, metaDePassos: META, dataDeHoje: '2026-08-24' });
    expect(eixos.find((e) => e.chave === 'sono')!.media).toBeCloseTo(0.6);
    expect(eixos.find((e) => e.chave === 'energia')!.media).toBeCloseTo(0.7);
  });
});

describe('geometria', () => {
  it('o primeiro eixo aponta para cima', () => {
    const p = pontaDoEixo(0, centro, 50);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });

  it('os cinco eixos ficam a 72 graus um do outro', () => {
    const angulos = EIXOS.map((_, i) => {
      const p = pontaDoEixo(i, centro, 50);
      return (Math.round((Math.atan2(p.y - centro.y, p.x - centro.x) * 180) / Math.PI) + 360) % 360;
    });
    expect(angulos).toEqual([270, 342, 54, 126, 198]);
  });

  it('eixo zerado não colapsa no centro', () => {
    const p = vertice(0, 0, centro, 50);
    expect(Math.hypot(p.x - centro.x, p.y - centro.y)).toBeGreaterThan(0);
  });
});

describe('segmentos', () => {
  it('cinco eixos medidos fecham cinco lados', () => {
    const s = segmentos([0.5, 0.5, 0.5, 0.5, 0.5], centro, 50);
    expect(s).toHaveLength(5);
    expect(s.every((x) => !x.ponte)).toBe(true);
  });

  it('o lado que atravessa um eixo calado vira ponte', () => {
    const s = segmentos([0.5, null, 0.5, 0.5, 0.5], centro, 50);
    expect(s).toHaveLength(4);
    expect(s.filter((x) => x.ponte)).toHaveLength(1);
  });

  it('um eixo sozinho não desenha figura nenhuma', () => {
    expect(segmentos([0.5, null, null, null, null], centro, 50)).toEqual([]);
  });
});

describe('a frase da assinatura', () => {
  const comMedia = (fracao: number | null, media: number | null) => ({
    chave: 'sono' as const,
    rotulo: 'Sono',
    rota: 'Sleep',
    fracao,
    media,
  });

  it('aponta o eixo que mais destoa do padrão da pessoa', () => {
    const eixos = [
      comMedia(0.4, 0.8),
      { ...comMedia(0.75, 0.7), chave: 'energia' as const, rotulo: 'Energia' },
    ];
    const desvio = maiorDesvio(eixos)!;
    expect(desvio.eixo.chave).toBe('sono');
    expect(desvio.delta).toBeCloseTo(-0.4);
  });

  it('dia dentro do padrão não anuncia novidade', () => {
    expect(maiorDesvio([comMedia(0.72, 0.7)])).toBeNull();
  });

  it('sem média não há desvio a apontar', () => {
    expect(maiorDesvio([comMedia(0.2, null)])).toBeNull();
  });

  it('conta quantos eixos foram medidos', () => {
    expect(eixosMedidos([comMedia(0.5, null), comMedia(null, null)])).toBe(1);
  });
});

describe('a frase que acompanha a figura', () => {
  const eixos = (campos: Partial<DailySummary>, dias: DailySummary[] = []) =>
    assinaturaDoDia({
      hoje: dia('2026-08-24', campos),
      dias,
      metaDePassos: META,
      dataDeHoje: '2026-08-24',
    });

  it('sem medidas suficientes, diz o que falta em vez de mostrar erro', () => {
    const poucos = eixos({ sleep_score: null, hrv_ms: null, steps: null, stress_score: null });
    expect(fraseDaAssinatura(poucos, 0)).toMatch(/faltam medidas/i);
  });

  it('sem dias acumulados, diz que ainda está juntando', () => {
    expect(fraseDaAssinatura(eixos({}), 1)).toMatch(/juntando dias/i);
  });

  it('com padrão formado, aponta o eixo que destoa e o lado', () => {
    const semana = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'].map((d) =>
      dia(d, { sleep_score: 90 }));
    const hoje = eixos({ sleep_score: 30 }, semana);
    expect(fraseDaAssinatura(hoje, 4)).toBe('Hoje sono está abaixo do seu padrão dos últimos dias.');
  });

  it('dia comum não inventa novidade', () => {
    const semana = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'].map((d) => dia(d));
    expect(fraseDaAssinatura(eixos({}, semana), 4)).toMatch(/dentro do seu padrão/i);
  });
});
