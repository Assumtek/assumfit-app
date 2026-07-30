import { isComplete, matchOption, nextQuestion, progressOf, QUESTIONS, reviewFields } from '../interview';

describe('roteiro da anamnese', () => {
  it('começa pela ABERTURA livre, como no MUVX', () => {
    // A pessoa FALA antes de escolher chip — muda o tom da entrevista inteira.
    expect(nextQuestion({})?.id).toBe('opening');
    expect(nextQuestion({})?.options).toBeUndefined();
  });

  it('depois da abertura vem o corpo, não a clínica — ordem do MUVX', () => {
    expect(nextQuestion({ opening: 'quero ter mais energia' })?.id).toBe('weightKg');
  });

  it('gestação só é perguntada para sexo feminino, semeado do cadastro', () => {
    const ids = (sexo: string) =>
      QUESTIONS.filter((q) => !q.when || q.when({ _sexo: sexo, chestPain: 'Sim', boneJoint: 'Sim', otherReason: 'Sim', praticaEsporte: 'Sim', conditions: 'Diabetes' })).map((q) => q.id);
    expect(ids('f')).toContain('pregnant');
    expect(ids('m')).not.toContain('pregnant');
  });

  it('texto digitado casa com opção sem exigir caixa nem acento', () => {
    const parq = QUESTIONS.find((q) => q.id === 'heartCondition')!;
    expect(matchOption(parq, 'não')).toBe('Não');
    expect(matchOption(parq, 'NAO')).toBe('Não');
    expect(matchOption(parq, 'sim ')).toBe('Sim');
    expect(matchOption(parq, 'talvez')).toBeNull();
  });

  /*
   O caso que justifica o grafo: a pergunta de dor em repouso só existe para
   quem relatou dor no esforço. Perguntá-la a todos é ruído; deixar o modelo
   decidir é aceitar que ela seja pulada.
  */
  it('só pergunta da dor em repouso a quem relatou dor no esforço', () => {
    const aplicaveis = (a: Record<string, string>) =>
      QUESTIONS.filter((q) => !q.when || q.when(a)).map((q) => q.id);
    expect(aplicaveis({ chestPain: 'Não' })).not.toContain('chestPainRest');
    expect(aplicaveis({ chestPain: 'Sim' })).toContain('chestPainRest');
  });

  it('desdobra o problema articular só quando houve', () => {
    const aplicaveis = (a: Record<string, string>) =>
      QUESTIONS.filter((q) => !q.when || q.when(a)).map((q) => q.id);
    expect(aplicaveis({ boneJoint: 'Não' })).not.toContain('boneJointWhere');
    expect(aplicaveis({ boneJoint: 'Sim' })).toContain('boneJointWhere');
  });

  it('o denominador do progresso encolhe quando um ramo é descartado', () => {
    const comRamo = { opening: 'x', heartCondition: 'Não', chestPain: 'Sim' };
    const semRamo = { opening: 'x', heartCondition: 'Não', chestPain: 'Não' };
    // Mesmo número de respostas, mas quem abriu o ramo tem mais a responder.
    expect(progressOf(semRamo)).toBeGreaterThan(progressOf(comRamo));
  });

  it('não se completa faltando pergunta obrigatória', () => {
    expect(isComplete({ heartCondition: 'Não' })).toBe(false);
  });

  it('se completa quando todas as aplicáveis obrigatórias foram ditas', () => {
    const respostas: Record<string, string> = {};
    let q = nextQuestion(respostas);
    let guarda = 0;
    while (q && guarda++ < 60) {
      respostas[q.id] = q.type === 'NUMBER' ? '70' : (q.options?.[q.options.length - 1] ?? 'texto');
      q = nextQuestion(respostas);
    }
    expect(isComplete(respostas)).toBe(true);
  });

  it('a revisão devolve as respostas na ordem do roteiro', () => {
    const campos = reviewFields({ opening: 'x', weightKg: '70', heartCondition: 'Não' });
    expect(campos.map((c) => c.questionId)).toEqual(['opening', 'weightKg', 'heartCondition']);
  });

  it('todo id é único — id repetido sobrescreveria resposta em silêncio', () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('as perguntas de rotina foram absorvidas no roteiro', () => {
    const ids = QUESTIONS.map((q) => q.id);
    for (const rotina of ['shift', 'posture', 'daysPerWeek', 'trainPlace', 'goal']) {
      expect(ids).toContain(rotina);
    }
  });
});
