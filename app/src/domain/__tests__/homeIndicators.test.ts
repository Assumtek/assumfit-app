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
