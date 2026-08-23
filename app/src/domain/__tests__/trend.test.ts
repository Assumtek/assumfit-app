import { JANELA_RECENTE, linhaDeTendencia, tendencia, type PontoDiario } from '../trend';

const HOJE = '2026-08-23';
const DIA = 86_400_000;

/** Série com um valor por dia, do dia `de` (idade em dias) ao dia `ate`. */
function serie(deIdade: number, ateIdade: number, valor: (i: number) => number): PontoDiario[] {
  const base = Date.parse(`${HOJE}T00:00:00Z`);
  const pontos: PontoDiario[] = [];
  for (let i = deIdade; i <= ateIdade; i++) {
    pontos.push({ dia: new Date(base - i * DIA).toISOString().slice(0, 10), valor: valor(i) });
  }
  return pontos;
}

describe('tendencia', () => {
  it('sem série suficiente, o estado é acumulando e diz quantos dias faltam', () => {
    const t = tendencia(serie(0, 9, () => 8000), { melhor: 'maior', hoje: HOJE });
    expect(t.estado).toBe('acumulando');
    expect(t.delta).toBeNull();
    expect(t.diasRecentes).toBe(10);
    expect(t.faltam).toBeGreaterThan(0);
  });

  it('série longa e estável não vira tendência', () => {
    const t = tendencia(serie(0, 111, () => 8000), { melhor: 'maior', hoje: HOJE });
    expect(t.estado).toBe('estavel');
    expect(t.recente).toBe(8000);
    expect(t.bom).toBeNull();
  });

  it('subida clara aparece com o delta na unidade da métrica', () => {
    // 9.000 passos nos últimos 28 dias, 6.000 nos 84 anteriores.
    const t = tendencia(serie(0, 111, (i) => (i < JANELA_RECENTE ? 9000 : 6000)), {
      melhor: 'maior',
      hoje: HOJE,
    });
    expect(t.estado).toBe('sobe');
    expect(t.delta).toBe(3000);
    expect(t.fracao).toBeCloseTo(0.5);
    expect(t.bom).toBe(true);
  });

  it('para métrica em que menos é melhor, subir é ruim', () => {
    const t = tendencia(serie(0, 111, (i) => (i < JANELA_RECENTE ? 70 : 50)), {
      melhor: 'menor',
      hoje: HOJE,
    });
    expect(t.estado).toBe('sobe');
    expect(t.bom).toBe(false);
  });

  it('variação pequena em valor não vira tendência, mesmo passando dos 5%', () => {
    // 62 contra 59 batimentos: 5% de diferença, mas três batimentos não são notícia.
    const t = tendencia(serie(0, 111, (i) => (i < JANELA_RECENTE ? 62 : 59)), {
      melhor: 'menor',
      limiarAbsoluto: 4,
      hoje: HOJE,
    });
    expect(t.estado).toBe('estavel');
  });

  it('dia sem medição não conta como zero', () => {
    // A janela recente tem 14 dias medidos (o mínimo) com 10.000 passos; os
    // outros 14 dias simplesmente não existem. A média é 10.000, não 5.000.
    const recentes = serie(0, 13, () => 10000);
    const anteriores = serie(JANELA_RECENTE, 111, () => 10000);
    const t = tendencia([...recentes, ...anteriores], { melhor: 'maior', hoje: HOJE });
    expect(t.diasRecentes).toBe(14);
    expect(t.recente).toBe(10000);
    expect(t.estado).toBe('estavel');
  });

  it('dia repetido não pesa duas vezes, e ordem não importa', () => {
    const pontos = [
      { dia: '2026-08-23', valor: 100 },
      { dia: '2026-08-23', valor: 200 },
      ...serie(1, 111, () => 200),
    ];
    const t = tendencia(pontos, { melhor: 'maior', hoje: HOJE });
    expect(t.diasRecentes).toBe(28);
    expect(t.recente).toBe(200);
  });

  it('dia no futuro é descartado', () => {
    const t = tendencia([{ dia: '2026-09-01', valor: 99999 }, ...serie(0, 111, () => 5000)], {
      melhor: 'maior',
      hoje: HOJE,
    });
    expect(t.diasRecentes).toBe(28);
    expect(t.recente).toBe(5000);
  });

  it('valor inválido é ignorado em vez de contaminar a média', () => {
    const t = tendencia(
      [{ dia: '2026-08-22', valor: Number.NaN }, ...serie(0, 111, () => 5000)],
      { melhor: 'maior', hoje: HOJE },
    );
    expect(t.recente).toBe(5000);
  });
});

describe('linhaDeTendencia', () => {
  it('descreve a subida na unidade da métrica, sem a tela formatar nada', () => {
    const l = linhaDeTendencia('passos', serie(0, 111, (i) => (i < JANELA_RECENTE ? 9000 : 6000)), HOJE);
    expect(l.rotulo).toBe('Passos');
    expect(l.valor).toBe('9.000 passos');
    expect(l.frase).toBe('3.000 passos a mais por dia que nos três meses anteriores.');
    expect(l.bom).toBe(true);
  });

  it('sono sai em horas e minutos', () => {
    const l = linhaDeTendencia('sono', serie(0, 111, (i) => (i < JANELA_RECENTE ? 400 : 340)), HOJE);
    expect(l.valor).toBe('6 h 40 min');
    expect(l.frase).toBe('1 h 00 min a mais por dia que nos três meses anteriores.');
  });

  it('estresse que sobe é tendência ruim', () => {
    const l = linhaDeTendencia('stress', serie(0, 111, (i) => (i < JANELA_RECENTE ? 60 : 40)), HOJE);
    expect(l.estado).toBe('sobe');
    expect(l.bom).toBe(false);
  });

  it('sem medição nenhuma, a frase não fala em dias que faltam', () => {
    const l = linhaDeTendencia('hrv', [], HOJE);
    expect(l.valor).toBe('–');
    expect(l.frase).toBe('Ainda não há medições para comparar.');
  });

  it('com série curta, diz quantos dias com medição faltam', () => {
    const l = linhaDeTendencia('agua', serie(0, 20, () => 2000), HOJE);
    expect(l.estado).toBe('acumulando');
    expect(l.frase).toMatch(/faltam \d+ dias com medição/);
  });
});
