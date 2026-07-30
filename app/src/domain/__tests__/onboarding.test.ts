import { nextQuestion, progressOf, summarize, type Lifestyle } from '../onboarding';

/** Percorre o fluxo respondendo com o valor que a função de resposta escolher. */
function walk(answer: (q: ReturnType<typeof nextQuestion>) => unknown, start: Lifestyle = {}) {
  const answers: Lifestyle = { ...start };
  const asked: string[] = [];

  for (let guard = 0; guard < 30; guard++) {
    const question = nextQuestion(answers);
    if (!question) return { answers, asked };
    asked.push(question.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (answers as any)[question.id] = answer(question);
  }
  throw new Error('fluxo não terminou — provável laço no grafo');
}

describe('ramificação', () => {
  it('não pergunta sobre treino a quem não treina', () => {
    const { asked } = walk((q) => {
      if (q?.id === 'exercises') return 'none';
      if (q?.id === 'occupation') return 'motorista';
      if (q?.id === 'workPosture') return 'sitting';
      if (q?.id === 'workSchedule') return 'business';
      return q?.options?.[0]?.value ?? 'x';
    });

    expect(asked).toContain('blocker');
    expect(asked).not.toContain('trainDays');
    expect(asked).not.toContain('activities');
    expect(asked).not.toContain('trainPlace');
  });

  it('pergunta dias, horário e local a quem treina', () => {
    const { asked } = walk((q) => {
      if (q?.id === 'exercises') return 'regular';
      if (q?.id === 'occupation') return 'analista';
      if (q?.id === 'activities') return ['corrida'];
      if (q?.id === 'trainDays') return [1, 3, 5];
      return q?.options?.[0]?.value ?? 'x';
    });

    expect(asked).toEqual(
      expect.arrayContaining(['activities', 'trainDays', 'trainPeriod', 'trainPlace']),
    );
    expect(asked).not.toContain('blocker');
  });

  it('só pergunta horas de postura a quem fica parado numa posição', () => {
    for (const posture of ['sitting', 'standing'] as const) {
      const { asked } = walk((q) => (q?.id === 'workPosture' ? posture : (q?.options?.[0]?.value ?? 'x')));
      expect(asked).toContain('postureHours');
    }

    for (const posture of ['moving', 'alternating'] as const) {
      const { asked } = walk((q) => (q?.id === 'workPosture' ? posture : (q?.options?.[0]?.value ?? 'x')));
      expect(asked).not.toContain('postureHours');
    }
  });

  it('pergunta hora de dormir só a quem tem horário irregular', () => {
    for (const schedule of ['night', 'shifts', 'flexible'] as const) {
      const { asked } = walk((q) => (q?.id === 'workSchedule' ? schedule : (q?.options?.[0]?.value ?? 'x')));
      expect(asked).toContain('bedtime');
    }

    const { asked } = walk((q) => (q?.id === 'workSchedule' ? 'business' : (q?.options?.[0]?.value ?? 'x')));
    expect(asked).not.toContain('bedtime');
  });

  it('sempre termina, por qualquer caminho', () => {
    // Se alguém acrescentar uma pergunta e esquecer de checar `undefined`, o
    // fluxo entra em laço e a pessoa fica presa na mesma tela para sempre.
    const combos: Lifestyle[] = [
      { exercises: 'none' },
      { exercises: 'regular' },
      { workSchedule: 'night' },
      { workPosture: 'moving', workSchedule: 'business', exercises: 'sometimes' },
    ];
    for (const start of combos) {
      expect(() => walk((q) => q?.options?.[0]?.value ?? 'x', start)).not.toThrow();
    }
  });

  it('nunca repete uma pergunta', () => {
    const { asked } = walk((q) => q?.options?.[0]?.value ?? 'x');
    expect(new Set(asked).size).toBe(asked.length);
  });
});

describe('personalização do enunciado', () => {
  it('cita a ocupação na pergunta de postura', () => {
    const q = nextQuestion({ occupation: 'Enfermeira' });
    expect(q?.id).toBe('workPosture');
    expect(q?.title).toContain('enfermeira');
  });

  it('muda o enunciado de horas conforme a postura', () => {
    const sentado = nextQuestion({ occupation: 'dev', workPosture: 'sitting' });
    const emPe = nextQuestion({ occupation: 'garçom', workPosture: 'standing' });
    expect(sentado?.title).toContain('sentado');
    expect(emPe?.title).toContain('em pé');
    expect(sentado?.title).not.toBe(emPe?.title);
  });

  it('concorda o verbo com a modalidade', () => {
    const base = { occupation: 'dev', workPosture: 'moving', workSchedule: 'business', exercises: 'regular' } as const;
    expect(nextQuestion({ ...base, activities: ['corrida'] })?.title).toContain('corre');
    expect(nextQuestion({ ...base, activities: ['natação'] })?.title).toContain('nada');
    expect(nextQuestion({ ...base, activities: ['musculação'] })?.title).toContain('treina');
  });

  it('encurta ocupação longa em vez de estourar o enunciado', () => {
    const q = nextQuestion({ occupation: 'coordenadora de operações logísticas internacionais' });
    expect(q?.title.length).toBeLessThan(90);
    expect(q?.title).toContain('…');
  });

  it('não quebra sem ocupação', () => {
    const q = nextQuestion({ occupation: '   ' });
    expect(q?.title).toContain('profissional');
  });
});

describe('progresso', () => {
  it('estima menos perguntas para quem não treina', () => {
    const semTreino = progressOf({ occupation: 'x', workPosture: 'moving', workSchedule: 'business', exercises: 'none' });
    const comTreino = progressOf({
      occupation: 'x',
      workPosture: 'moving',
      workSchedule: 'business',
      exercises: 'regular',
    });
    expect(semTreino.estimatedTotal).toBeLessThan(comTreino.estimatedTotal);
  });

  it('nunca mostra progresso acima do total', () => {
    const answers: Lifestyle = {
      occupation: 'x',
      workPosture: 'sitting',
      postureHours: 8,
      workSchedule: 'night',
      bedtime: 9,
      exercises: 'regular',
      activities: ['corrida'],
      trainDays: [1],
      trainPeriod: 'manhã',
      trainPlace: 'academia',
      goal: 'energia',
    };
    const { answered, estimatedTotal } = progressOf(answers);
    expect(answered).toBeLessThanOrEqual(estimatedTotal);
  });
});

describe('resumo', () => {
  it('devolve o que entendeu, em frases', () => {
    const linhas = summarize({
      occupation: 'Desenvolvedora',
      workPosture: 'sitting',
      postureHours: 8,
      workSchedule: 'business',
      exercises: 'regular',
      activities: ['musculação'],
      trainDays: [1, 3, 5],
      trainPeriod: 'noite',
    });

    expect(linhas.join(' ')).toContain('desenvolvedora');
    expect(linhas.join(' ')).toContain('sentado');
    expect(linhas.join(' ')).toContain('seg, qua, sex');
  });

  it('destaca o turno noturno, que é o que mais muda o cálculo', () => {
    const linhas = summarize({ occupation: 'enfermeiro', workSchedule: 'night' });
    expect(linhas.join(' ')).toContain('noturno');
  });

  it('não inventa frase sobre o que não foi respondido', () => {
    expect(summarize({})).toEqual([]);
    expect(summarize({ occupation: 'dev' }).join(' ')).not.toContain('Treina');
  });
});
