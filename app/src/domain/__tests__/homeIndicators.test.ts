import { indicadoresDaHome } from '../homeIndicators';
import { nightFrom } from '../sleep';

const base = {
  hora: 20,
  agua: { ml: 400, metaMl: 2500 },
  passos: { hoje: 2000, meta: 10000 },
  refeicoes: { quantidade: 0, kcalMin: 0, kcalMax: 0, metaKcal: 2100 },
  sono: nightFrom('2026-08-21', [{ phase: 'deep', minutes: 420 }]),
  stress: 21,
};

describe('indicadoresDaHome', () => {
  it('o exemplo da fundadora: água e passos para baixo, refeição não registrada, sono ótimo, stress baixo', () => {
    const [agua, atividade, alimentacao, sono, stress] = indicadoresDaHome(base);
    expect(agua).toMatchObject({ direcao: 'down', frase: 'Bebeu pouca água hoje' });
    expect(atividade).toMatchObject({ direcao: 'down', frase: 'Pouco movimento, 20% da meta de passos' });
    expect(alimentacao).toMatchObject({ direcao: 'down', frase: 'Nenhuma refeição registrada' });
    expect(sono.direcao).toBe('up');
    // O rótulo é o da régua de ratings.ts ("Calmo"), a mesma da tela de Estresse.
    expect(stress).toMatchObject({ direcao: 'up', frase: 'Calmo' });
  });
  it('de manhã cedo, pouca água e poucos passos ainda não são para baixo', () => {
    const [agua, atividade] = indicadoresDaHome({ ...base, hora: 8, agua: { ml: 200, metaMl: 2500 }, passos: { hoje: 800, meta: 10000 } });
    expect(agua.direcao).toBe('up');
    expect(atividade.direcao).toBe('up');
  });
  it('metas batidas sobem; refeição dentro da meta sobe', () => {
    const r = indicadoresDaHome({ ...base, agua: { ml: 2500, metaMl: 2500 }, passos: { hoje: 10400, meta: 10000 }, refeicoes: { quantidade: 3, kcalMin: 1500, kcalMax: 1900, metaKcal: 2100 } });
    expect(r[0].frase).toBe('Meta de água batida');
    expect(r[1].frase).toBe('Meta de passos batida');
    expect(r[2]).toMatchObject({ direcao: 'up', frase: '3 refeições, 1500–1900 kcal' });
  });
  it('sem dado, para baixo e dizendo que falta a medição, nunca inventando', () => {
    const r = indicadoresDaHome({ ...base, passos: { hoje: null, meta: 10000 }, sono: null, stress: null });
    expect(r[1].frase).toBe('Sem leitura de passos');
    expect(r[3]).toMatchObject({ direcao: 'down', frase: 'Sem noite registrada' });
    expect(r[4]).toMatchObject({ direcao: 'down', frase: 'Sem medição' });
  });
  it('stress moderado desce: só calmo sobe', () => {
    expect(indicadoresDaHome({ ...base, stress: 44 })[4]).toMatchObject({ direcao: 'down', frase: 'Moderado' });
  });
});

describe('atividade não é só passo', () => {
  const base = {
    hora: 20,
    agua: { ml: 2000, metaMl: 2500 },
    passos: { hoje: 4000, meta: 10_000 },
    refeicoes: { quantidade: 2, kcalMin: 800, kcalMax: 1200, metaKcal: 2000 },
    sono: null,
    stress: 40,
  };
  const atividade = (extra: Record<string, unknown> = {}) =>
    indicadoresDaHome({ ...base, ...extra } as never).find((i) => i.key === 'atividade')!;

  it('uma hora de treino não é "pouco movimento"', () => {
    // O relato: musculação quase não produz passo, e a home dizia "pouco
    // movimento, 40% da meta de passos" depois de um treino inteiro.
    const i = atividade({ minutosDeTreino: 62 });
    expect(i.direcao).toBe('up');
    expect(i.frase).toContain('62 min de treino hoje');
  });

  it('a frase mantém os passos quando eles existem', () => {
    expect(atividade({ minutosDeTreino: 62 }).frase).toContain('40% da meta de passos');
  });

  it('check-in aberto por engano não vira treino', () => {
    const i = atividade({ minutosDeTreino: 5 });
    expect(i.direcao).toBe('down');
    expect(i.frase).toContain('meta de passos');
  });

  it('sem treino, a régua de passos continua mandando', () => {
    expect(atividade().frase).toContain('meta de passos');
  });
});
