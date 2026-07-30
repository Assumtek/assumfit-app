import { achievementsFor, weekStart, weekStreak } from '../achievements';

const DIA = 86_400_000;

/** Quarta-feira, 29 de julho de 2026, meio-dia. */
const HOJE = new Date('2026-07-29T12:00:00').getTime();

const feito = (at: number) => ({ startedAt: new Date(at).toISOString(), status: 'FINISHED' });

describe('weekStart', () => {
  it('a semana começa na SEGUNDA, não no domingo', () => {
    const segunda = new Date('2026-07-27T00:00:00').getTime();
    expect(weekStart(HOJE)).toBe(segunda);
    // O domingo anterior pertence à semana ANTERIOR.
    expect(weekStart(new Date('2026-07-26T23:00:00').getTime())).toBe(segunda - 7 * DIA);
  });
});

describe('weekStreak', () => {
  it('sem treino nenhum não há sequência', () => {
    expect(weekStreak([], HOJE)).toBe(0);
  });

  it('conta semanas consecutivas', () => {
    const execucoes = [feito(HOJE), feito(HOJE - 7 * DIA), feito(HOJE - 14 * DIA)];
    expect(weekStreak(execucoes, HOJE)).toBe(3);
  });

  /*
   O caso que justifica contar em semanas: quem treina terça e quinta tem dois
   dias vazios no meio que são o plano, não falha. Em dias, a sequência
   quebraria toda quarta.
  */
  it('dia vazio no meio da semana não quebra nada', () => {
    const terca = new Date('2026-07-28T09:00:00').getTime();
    expect(weekStreak([feito(terca)], HOJE)).toBe(1);
  });

  it('a semana corrente vazia não mata a sequência anterior', () => {
    // Só treinou na semana passada; hoje é segunda-feira da semana nova.
    const segunda = new Date('2026-08-03T08:00:00').getTime();
    expect(weekStreak([feito(HOJE)], segunda)).toBe(1);
  });

  it('duas semanas sem treino zeram', () => {
    expect(weekStreak([feito(HOJE - 21 * DIA)], HOJE)).toBe(0);
  });

  it('ignora sessões interrompidas', () => {
    const interrompida = { startedAt: new Date(HOJE).toISOString(), status: 'CANCELLED' };
    expect(weekStreak([interrompida], HOJE)).toBe(0);
  });
});

describe('achievementsFor', () => {
  it('celebra o primeiro treino como novo', () => {
    const r = achievementsFor([feito(HOJE)], HOJE);
    const primeiro = r.find((a) => a.key === 'total-1');
    expect(primeiro?.title).toBe('Primeiro treino');
    expect(primeiro?.fresh).toBe(true);
  });

  it('marco antigo aparece sem ser novo', () => {
    // Cinco treinos, mas o quinto foi há semanas: o marco não é desta sessão.
    const execucoes = [
      ...Array.from({ length: 5 }, (_, i) => feito(HOJE - (30 + i) * DIA)),
      feito(HOJE),
    ];
    const marco = achievementsFor(execucoes, HOJE).find((a) => a.key.startsWith('total-'));
    expect(marco?.fresh).toBe(false);
  });

  it('não inventa sequência com uma semana só', () => {
    const r = achievementsFor([feito(HOJE)], HOJE);
    expect(r.some((a) => a.key.startsWith('streak-'))).toBe(false);
  });

  it('melhor semana só conta se for recorde e tiver volume', () => {
    // Duas nesta semana: é pouco para virar conquista, mesmo sendo o máximo.
    const duas = [feito(HOJE), feito(HOJE - DIA)];
    expect(achievementsFor(duas, HOJE).some((a) => a.key.startsWith('melhor-semana'))).toBe(false);

    const tres = [...duas, feito(HOJE - 2 * DIA)];
    expect(achievementsFor(tres, HOJE).some((a) => a.key.startsWith('melhor-semana'))).toBe(true);
  });

  it('semana igual à melhor anterior não vira recorde', () => {
    const anterior = Array.from({ length: 3 }, (_, i) => feito(HOJE - (7 + i) * DIA));
    const atual = Array.from({ length: 3 }, (_, i) => feito(HOJE - i * DIA));
    const r = achievementsFor([...anterior, ...atual], HOJE);
    expect(r.some((a) => a.key.startsWith('melhor-semana'))).toBe(false);
  });

  /*
   A regra que mais importa: nada aqui fala do corpo. Se um dia alguém
   acrescentar "perdeu 2 kg", este teste é o que deve barrar.
  */
  it('nenhuma conquista menciona peso, medida ou resultado corporal', () => {
    const muitos = Array.from({ length: 60 }, (_, i) => feito(HOJE - i * DIA));
    const texto = achievementsFor(muitos, HOJE)
      .flatMap((a) => [a.title, a.detail])
      .join(' ')
      .toLowerCase();
    for (const proibido of ['kg', 'peso', 'emagre', 'gordura', 'medida', 'cintura']) {
      expect(texto).not.toContain(proibido);
    }
  });
});
