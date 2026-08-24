import { WorkoutExecutionStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';

/**
 * O que aconteceu NESTA semana, em texto, para o agente revisar com base nisso.
 *
 * Pedido do Leonardo (24/08/2026): "revisar com base no feedback consolidado da
 * semana". O agente já recebia biometria e adesão de 45 dias, o que responde
 * "como esta pessoa treina em geral"; não respondia "como foi ESTA semana", que
 * é a pergunta de quem quer ajustar o que vem pela frente.
 *
 * Sai como TEXTO, e não como números soltos: o agente é um modelo de
 * linguagem, e uma frase ("na quinta você parou na metade e marcou esforço 9")
 * carrega o que três campos separados não carregam.
 *
 * **Comentário da pessoa entra literal, sem interpretação nossa.** É a única
 * parte em que ela fala com as próprias palavras, e resumir isso aqui seria
 * decidir por ela o que importou.
 */
export async function weekFeedback(userId: string, agora = new Date()): Promise<string> {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  // Semana começa na segunda, como o plano.
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));

  const execucoes = await prisma.workoutExecution.findMany({
    where: {
      userId,
      startedAt: { gte: inicio },
      status: {
        in: [
          WorkoutExecutionStatus.FINISHED,
          WorkoutExecutionStatus.AUTO_CLOSED,
          WorkoutExecutionStatus.CANCELLED,
        ],
      },
    },
    select: {
      startedAt: true,
      status: true,
      completionPct: true,
      perceivedEffort: true,
      rating: true,
      comment: true,
      workout: { select: { name: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  if (execucoes.length === 0) {
    return 'Nenhuma sessão registrada nesta semana até agora.';
  }

  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const linhas = execucoes.map((e) => {
    const dia = DIAS[e.startedAt.getDay()];
    const partes = [`${dia}: ${e.workout?.name ?? 'treino'}`];
    if (e.status === WorkoutExecutionStatus.CANCELLED) partes.push('interrompido');
    else if (e.status === WorkoutExecutionStatus.AUTO_CLOSED) partes.push('fechado automaticamente');
    if (e.completionPct != null) partes.push(`${Math.round(e.completionPct)}% concluído`);
    if (e.perceivedEffort != null) partes.push(`esforço ${e.perceivedEffort} de 10`);
    if (e.rating != null) partes.push(`nota ${e.rating} de 5`);
    if (e.comment) partes.push(`comentário: "${e.comment.slice(0, 160)}"`);
    return partes.join(', ');
  });

  return `Sessões desta semana (${execucoes.length}):\n${linhas.join('\n')}`;
}
