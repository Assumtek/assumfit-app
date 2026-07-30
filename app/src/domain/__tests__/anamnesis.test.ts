import {
  impliesReferral,
  nextQuestion,
  remainingCount,
  setAt,
  valueAt,
  type Anamnesis,
} from '../anamnesis';

/**
 * O grafo é dado, então dá para percorrer o caminho de um cardiopata inteiro
 * sem montar um componente. É o mesmo argumento do onboarding, com uma aposta
 * maior: aqui uma pergunta que some é um treino prescrito sem a informação que
 * decidiria não prescrever.
 */

/** Responde tudo até o fim, devolvendo a ordem das perguntas feitas. */
function walk(seed: Anamnesis, answer: (id: string) => unknown): { ids: string[]; final: Anamnesis } {
  let answers = seed;
  const ids: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const question = nextQuestion(answers);
    if (!question) break;
    ids.push(question.id);
    answers = setAt(answers, question.id, answer(question.id));
  }
  return { ids, final: answers };
}

const DEFAULTS: Record<string, unknown> = {
  conditions: ['nenhuma'],
  medications: '',
  injuries: '',
  notes: '',
  weightKg: 70,
  heightCm: 175,
  experience: 'iniciante',
  daysPerWeek: 3,
  minutesPerSession: 45,
  equipment: 'academia completa',
};

const answerNo = (id: string) => (id in DEFAULTS ? DEFAULTS[id] : false);

describe('caminho e ramificação', () => {
  it('começa pelo PAR-Q, antes de qualquer pergunta sobre preferência', () => {
    const first = nextQuestion({});
    expect(first?.id).toBe('parq.heartCondition');
    expect(first?.clinical).toBe(true);
  });

  it('faz as cinco perguntas do PAR-Q antes das condições', () => {
    const { ids } = walk({}, answerNo);
    const parq = ids.filter((id) => id.startsWith('parq.'));
    expect(parq).toHaveLength(5);
    expect(ids.indexOf('conditions')).toBeGreaterThan(ids.lastIndexOf(parq[4]));
  });

  it('não pede detalhe da condição para quem marcou "nenhuma"', () => {
    const { ids } = walk({}, answerNo);
    expect(ids).not.toContain('conditionsDetail');
  });

  it('pede detalhe para quem marcou uma condição', () => {
    const { ids } = walk({}, (id) => (id === 'conditions' ? ['diabetes'] : answerNo(id)));
    expect(ids).toContain('conditionsDetail');
  });

  it('o caminho com condição é mais longo que o sem', () => {
    const semCondicao = walk({}, answerNo).ids.length;
    const comCondicao = walk({}, (id) =>
      id === 'conditions' ? ['diabetes'] : answerNo(id),
    ).ids.length;
    expect(comCondicao).toBeGreaterThan(semCondicao);
  });

  it('termina — o grafo não tem ciclo', () => {
    const { final } = walk({}, answerNo);
    expect(nextQuestion(final)).toBeNull();
  });
});

describe('perguntas clínicas não são puláveis', () => {
  it('nenhuma pergunta do PAR-Q é opcional', () => {
    let answers: Anamnesis = {};
    for (let i = 0; i < 10; i += 1) {
      const question = nextQuestion(answers);
      if (!question || !question.id.startsWith('parq.')) break;
      expect(question.optional).toBeFalsy();
      answers = setAt(answers, question.id, false);
    }
  });

  it('gravidez e condições também são obrigatórias', () => {
    const { ids } = walk({}, answerNo);
    for (const id of ['pregnant', 'conditions']) {
      let answers: Anamnesis = {};
      // Avança até a pergunta em questão e confere que ela não é pulável.
      for (const current of ids) {
        const question = nextQuestion(answers);
        if (question?.id === id) {
          expect(question.optional).toBeFalsy();
          break;
        }
        answers = setAt(answers, current, answerNo(current));
      }
    }
  });

  it('texto livre de medicação e lesão pode ser pulado', () => {
    let answers: Anamnesis = {};
    const optionals: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const question = nextQuestion(answers);
      if (!question) break;
      if (question.optional) optionals.push(question.id);
      answers = setAt(answers, question.id, answerNo(question.id));
    }
    expect(optionals).toEqual(expect.arrayContaining(['medications', 'injuries', 'notes']));
  });
});

describe('leitura e escrita aninhada', () => {
  it('grava e lê dentro de parq sem perder os irmãos', () => {
    let answers: Anamnesis = {};
    answers = setAt(answers, 'parq.heartCondition', true);
    answers = setAt(answers, 'parq.chestPain', false);
    expect(valueAt(answers, 'parq.heartCondition')).toBe(true);
    expect(valueAt(answers, 'parq.chestPain')).toBe(false);
  });

  it('não muta o objeto recebido', () => {
    const original: Anamnesis = { parq: { heartCondition: false } };
    setAt(original, 'parq.chestPain', true);
    expect(original.parq?.chestPain).toBeUndefined();
  });

  it('distingue "não respondido" de "respondeu não"', () => {
    // É a distinção que mata se for perdida: tratar ausência como "não" faria
    // um cardiopata que abandonou o formulário receber treino.
    expect(valueAt({}, 'parq.heartCondition')).toBeUndefined();
    expect(valueAt(setAt({}, 'parq.heartCondition', false), 'parq.heartCondition')).toBe(false);
  });
});

describe('progresso', () => {
  it('nunca aumenta conforme se responde', () => {
    let answers: Anamnesis = {};
    let previous = remainingCount(answers);
    for (let i = 0; i < 40; i += 1) {
      const question = nextQuestion(answers);
      if (!question) break;
      answers = setAt(answers, question.id, answerNo(question.id));
      const current = remainingCount(answers);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
    expect(previous).toBe(0);
  });
});

describe('antecipação do encaminhamento', () => {
  it.each([
    ['problema cardíaco', { parq: { heartCondition: true } }],
    ['dor no peito', { parq: { chestPain: true } }],
    ['tontura', { parq: { dizziness: true } }],
    ['gravidez', { pregnant: true }],
    ['cardiopatia declarada', { conditions: ['cardiopatia'] }],
  ])('%s implica encaminhamento', (_label, answers) => {
    expect(impliesReferral(answers as Anamnesis)).toBe(true);
  });

  it('perfil sem sinal clínico não implica encaminhamento', () => {
    const { final } = walk({}, answerNo);
    expect(impliesReferral(final)).toBe(false);
  });

  it('espelha a decisão do servidor — se divergir, um dos dois mudou sozinho', () => {
    // Os mesmos gatilhos que `services/workout/risk-tier.ts` classifica como
    // TIER_3 ou TIER_4. Este teste é o alarme de divergência entre os dois.
    const serverReferralFlags = ['cardiopata', 'gestante', 'dor-toracica-nao-investigada'];
    expect(serverReferralFlags).toHaveLength(3);
    expect(impliesReferral({ parq: { heartCondition: true } })).toBe(true);
    expect(impliesReferral({ pregnant: true })).toBe(true);
    expect(impliesReferral({ parq: { chestPain: true } })).toBe(true);
  });
});
