import { WorkoutExecutionStatus } from '@prisma/client';

import { weekFeedback } from '../week-feedback';
import { prisma } from '../../../lib/prisma';

/**
 * O consolidado da semana que o agente de ajuste recebe.
 *
 * O banco é substituído porque o que importa aqui é a JANELA (a semana começa
 * na segunda, como o plano) e o TEXTO, que é o que o modelo lê. Uma linha mal
 * escrita aqui vira uma proposta de treino baseada no que não aconteceu.
 */
jest.mock('../../../lib/prisma', () => ({
  prisma: { workoutExecution: { findMany: jest.fn() } },
}));

const findMany = prisma.workoutExecution.findMany as unknown as jest.Mock;

// Quarta-feira, 26/08/2026.
const QUARTA = new Date(2026, 7, 26, 15, 0, 0);

function execucao(dia: number, extras: Record<string, unknown> = {}) {
  return {
    startedAt: new Date(2026, 7, dia, 7, 30, 0),
    status: WorkoutExecutionStatus.FINISHED,
    completionPct: 100,
    perceivedEffort: null,
    rating: null,
    comment: null,
    workout: { name: 'Peito e Tríceps' },
    ...extras,
  };
}

beforeEach(() => findMany.mockReset());

describe('weekFeedback', () => {
  it('sem sessão na semana, diz isso em vez de ficar em branco', async () => {
    findMany.mockResolvedValue([]);
    expect(await weekFeedback('u1', QUARTA)).toBe(
      'Nenhuma sessão registrada nesta semana até agora.',
    );
  });

  it('pergunta pela semana que começa na segunda', async () => {
    findMany.mockResolvedValue([]);
    await weekFeedback('u1', QUARTA);
    const filtro = findMany.mock.calls[0][0].where;
    expect(filtro.startedAt.gte).toEqual(new Date(2026, 7, 24, 0, 0, 0, 0));
  });

  it('escreve uma linha por sessão, com o dia da semana e o que houve', async () => {
    findMany.mockResolvedValue([
      execucao(24, { perceivedEffort: 6, rating: 5 }),
      execucao(25, {
        status: WorkoutExecutionStatus.CANCELLED,
        completionPct: 40,
        perceivedEffort: 9,
        workout: { name: 'Pernas' },
      }),
    ]);
    const texto = await weekFeedback('u1', QUARTA);
    expect(texto).toContain('Sessões desta semana (2)');
    expect(texto).toContain('segunda: Peito e Tríceps, 100% concluído, esforço 6 de 10, nota 5 de 5');
    expect(texto).toContain('terça: Pernas, interrompido, 40% concluído, esforço 9 de 10');
  });

  it('o comentário da pessoa vai literal, e não resumido por nós', async () => {
    findMany.mockResolvedValue([
      execucao(24, { comment: 'ombro doeu na terceira série do supino' }),
    ]);
    const texto = await weekFeedback('u1', QUARTA);
    expect(texto).toContain('comentário: "ombro doeu na terceira série do supino"');
  });

  it('comentário enorme é cortado, para não estourar a janela do modelo', async () => {
    findMany.mockResolvedValue([execucao(24, { comment: 'a'.repeat(500) })]);
    const texto = await weekFeedback('u1', QUARTA);
    expect(texto).toContain('a'.repeat(160));
    expect(texto).not.toContain('a'.repeat(161));
  });

  it('campo não preenchido não vira zero na frase', async () => {
    findMany.mockResolvedValue([
      execucao(24, { completionPct: null, perceivedEffort: null, rating: null }),
    ]);
    const texto = await weekFeedback('u1', QUARTA);
    expect(texto).toContain('segunda: Peito e Tríceps');
    expect(texto).not.toContain('esforço');
    expect(texto).not.toContain('0%');
  });
});
