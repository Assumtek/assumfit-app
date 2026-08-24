/**
 * A conversa com o personal vive na conta, não na tela.
 *
 * O que se testa aqui é a ORDEM e a origem: o modelo precisa receber o
 * histórico do mais antigo para o mais novo, e ele tem que vir do banco, não
 * do aparelho. Antes, fechar o app apagava a conversa e o contexto que chegava
 * ao modelo era o que o cliente dissesse que era.
 */
jest.mock('../../../lib/prisma', () => ({
  prisma: { planChatMessage: { findMany: jest.fn() } },
}));

import { historicoDoChat } from '../chat';
import { prisma } from '../../../lib/prisma';

const findMany = prisma.planChatMessage.findMany as unknown as jest.Mock;

beforeEach(() => findMany.mockReset());

describe('historicoDoChat', () => {
  it('devolve do mais antigo para o mais novo, que é como o modelo lê', async () => {
    // O banco entrega em ordem decrescente (as últimas N mensagens).
    findMany.mockResolvedValue([
      { role: 'assistant', content: 'terceira' },
      { role: 'user', content: 'segunda' },
      { role: 'assistant', content: 'primeira' },
    ]);
    const turnos = await historicoDoChat('u1');
    expect(turnos.map((t) => t.content)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('pede as ÚLTIMAS mensagens, não as primeiras', async () => {
    findMany.mockResolvedValue([]);
    await historicoDoChat('u1', 30);
    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.take).toBe(30);
    expect(args.where).toEqual({ userId: 'u1' });
  });

  it('papel desconhecido vira "user" em vez de quebrar o contrato do modelo', async () => {
    findMany.mockResolvedValue([{ role: 'system', content: 'algo' }]);
    const turnos = await historicoDoChat('u1');
    expect(turnos[0].role).toBe('user');
  });

  it('conversa nova volta vazia, sem erro', async () => {
    findMany.mockResolvedValue([]);
    expect(await historicoDoChat('u1')).toEqual([]);
  });
});
