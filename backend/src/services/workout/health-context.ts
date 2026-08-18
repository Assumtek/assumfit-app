import { WorkoutExecutionStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { hrvBaseline, latestReading } from '../biometric.service';

/**
 * O que o AssumFit sabe e um app de treino comum não sabe.
 *
 * Um app de prescrição vê o nível DECLARADO. Aqui existem HRV medido, sono,
 * passos e o histórico real de sessões concluídas — que é justamente o que
 * calibra a complexidade técnica dos exercícios. O nível declarado é otimista
 * quase sempre; o histórico não é.
 *
 * **Nada aqui vira log com o id do usuário junto.** É a mesma regra que vale
 * para o resto da biometria, e ela não afrouxa por o dado estar a caminho de um
 * modelo de linguagem.
 */

/** Janela observada para adesão. Cobre o ciclo anterior de plano com folga. */
const ADHERENCE_WINDOW_DAYS = 45;

export type HealthContext = {
  /** Vai dentro de `profile`, para o agente calibrar o nível real. */
  biometrics: Record<string, unknown>;
  /** Resumo em texto do histórico de treino. */
  historySummary: string;
};

export async function buildHealthContext(userId: string): Promise<HealthContext> {
  const since = new Date(Date.now() - ADHERENCE_WINDOW_DAYS * 86_400_000);

  const [conta, baseline, latest, executions, lastEnergy] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    hrvBaseline(userId),
    latestReading(userId),
    prisma.workoutExecution.findMany({
      where: {
        userId,
        startedAt: { gte: since },
        status: { in: [WorkoutExecutionStatus.FINISHED, WorkoutExecutionStatus.AUTO_CLOSED] },
      },
      select: { startedAt: true, completionPct: true, perceivedEffort: true },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.energyScore.findFirst({
      where: { userId },
      orderBy: { hourStart: 'desc' },
      select: { score: true, calibrating: true },
    }),
  ]);

  const biometrics: Record<string, unknown> = {};
  if (baseline !== null) biometrics.hrv_baseline_ms = Math.round(baseline);
  if (latest?.heartRate) biometrics.fc_repouso = latest.heartRate;
  if (latest?.steps) biometrics.passos_dia = latest.steps;
  // Score em calibração não é score: a linha de base pessoal ainda não
  // convergiu, e mandá-lo daria ao agente uma precisão que o número não tem.
  if (lastEnergy && !lastEnergy.calibrating) {
    biometrics.score_energia = Math.round(lastEnergy.score);
  }

  const diasDeConta = conta
    ? Math.floor((Date.now() - conta.createdAt.getTime()) / 86_400_000)
    : null;

  return { biometrics, historySummary: summarize(executions, diasDeConta) };
}

/**
 * O histórico em texto — sem transformar AUSÊNCIA em afirmação sobre a pessoa.
 *
 * A frase antiga era "Sem histórico de treino registrado no aplicativo nos
 * últimos 45 dias", e 45 é a janela da NOSSA consulta, não um fato de ninguém.
 * O avaliador leu aquilo como "45 dias sem treinar" e exigiu carga
 * conservadora; num caso real (ago/2026) isso reprovou o plano de alguém que
 * tinha criado a conta no dia anterior — não havia como existir registro.
 *
 * Quem sabe se a pessoa está destreinada é a ANAMNESE, onde ela declara a
 * própria experiência. O resumo do histórico não pode competir com isso: sem
 * registro, o texto diz que não sabe, e diz por quê.
 */
function summarize(
  executions: { startedAt: Date; completionPct: number | null; perceivedEffort: number | null }[],
  diasDeConta: number | null,
): string {
  if (executions.length === 0) {
    const conta =
      diasDeConta !== null && diasDeConta <= ADHERENCE_WINDOW_DAYS
        ? ` A conta foi criada há ${diasDeConta} ${diasDeConta === 1 ? 'dia' : 'dias'}, então não houve tempo de acumular histórico.`
        : '';
    return (
      'O aplicativo ainda não tem sessões registradas para esta pessoa.' +
      conta +
      ' Isso NÃO indica que ela esteja destreinada nem parada:' +
      ' use a experiência e a frequência declaradas na anamnese para calibrar carga e volume.'
    );
  }

  const completions = executions.map((e) => e.completionPct).filter((v): v is number => v !== null);
  const efforts = executions.map((e) => e.perceivedEffort).filter((v): v is number => v !== null);
  const avg = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const daysSinceLast = Math.floor((Date.now() - executions[0].startedAt.getTime()) / 86_400_000);
  const perWeek = (executions.length / (ADHERENCE_WINDOW_DAYS / 7)).toFixed(1);

  const parts = [
    `${executions.length} sessões concluídas nos últimos ${ADHERENCE_WINDOW_DAYS} dias (${perWeek} por semana).`,
    `Última sessão há ${daysSinceLast} ${daysSinceLast === 1 ? 'dia' : 'dias'}.`,
  ];
  if (completions.length > 0) parts.push(`Conclusão média das sessões: ${avg(completions)}%.`);
  if (efforts.length > 0) parts.push(`Percepção de esforço média: ${avg(efforts)} de 10.`);

  // Parado há mais de uma semana não é o mesmo que treinando pouco: retomar
  // pede carga menor, não progressão a partir de onde parou.
  if (daysSinceLast > 7) {
    parts.push('Retomando após pausa — prescrever com carga conservadora e progressão gradual.');
  }

  return parts.join(' ');
}
