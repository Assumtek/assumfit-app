import { diaDeAmanha, textoMatinalLocal } from '../morningGreeting';

describe('textoMatinalLocal', () => {
  it('cita o treino do dia, e dois dias seguidos não repetem a frase', () => {
    const a = textoMatinalLocal({ estado: 'treino', nome: 'Corpo Inteiro B' }, new Date(2026, 7, 22));
    const b = textoMatinalLocal({ estado: 'treino', nome: 'Corpo Inteiro B' }, new Date(2026, 7, 23));
    expect(a.body).toContain('Corpo Inteiro B');
    expect(a.title).toBe('Bom dia');
    expect(a.body).not.toBe(b.body);
  });
  it('sem treino, motiva sem empurrar treino; sem plano, convida a começar', () => {
    expect(textoMatinalLocal({ estado: 'descanso' }, new Date(2026, 7, 22)).body).not.toMatch(/treino marcado|vá treinar/i);
    expect(textoMatinalLocal({ estado: 'sem-plano' }, new Date(2026, 7, 22)).body.length).toBeGreaterThan(20);
  });
  it('nenhuma frase usa travessão nem exclamação', () => {
    for (let i = 0; i < 10; i++) {
      const d = new Date(2026, 7, 1 + i);
      for (const e of [{ estado: 'treino' as const, nome: 'X' }, { estado: 'descanso' as const }, { estado: 'sem-plano' as const }]) {
        const t = textoMatinalLocal(e, d).body;
        expect(t).not.toContain('—');
        expect(t).not.toContain('!');
      }
    }
  });
});

describe('diaDeAmanha', () => {
  const plan = {
    today: 'SATURDAY',
    days: [
      { dayOfWeek: 'SUNDAY', dayType: 'OFF' },
      { dayOfWeek: 'MONDAY', dayType: 'WORKOUT', workout: { name: 'Corpo Inteiro A' } },
    ],
  };
  it('sábado olha para domingo (descanso); domingo olha para segunda (treino)', () => {
    expect(diaDeAmanha(plan)).toEqual({ estado: 'descanso' });
    expect(diaDeAmanha({ ...plan, today: 'SUNDAY' })).toEqual({ estado: 'treino', nome: 'Corpo Inteiro A' });
    expect(diaDeAmanha(null)).toEqual({ estado: 'sem-plano' });
  });
});
