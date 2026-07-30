import { WorkoutExecutionStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';

/**
 * O relatório de progresso do aluno.
 *
 * Portado da estrutura do `StudentProgressReport` do MUVX: resumo em quatro
 * números, volume por grupo muscular, detalhe por exercício e a evolução do
 * volume ao longo do período.
 *
 * ## Volume load é o número que faltava
 *
 * `carga × repetições`, somado. É a única métrica aqui que responde "estou
 * progredindo?" — contagem de treinos responde "estou aparecendo", que é outra
 * pergunta. Duas sessões de peito com o mesmo número de séries podem ter volumes
 * muito diferentes, e é a diferença entre elas que move adaptação.
 *
 * ## Só o que foi CONCLUÍDO entra
 *
 * Série registrada mas não concluída fica fora de todos os totais. Ela existe no
 * banco porque a pessoa digitou a carga antes de desistir do movimento — contar
 * isso infla o volume com trabalho que não aconteceu.
 */

export type DashboardPeriod = 1 | 7 | 30 | 90;

export type WorkoutDashboard = {
  summary: {
    totalWorkouts: number;
    totalSeries: number;
    totalReps: number;
    /** Segundos. */
    totalDuration: number;
    /** kg × reps, somado. */
    volumeLoad: number;
  };
  /** Volume por grupo muscular, do maior para o menor. */
  muscleDistribution: { muscleGroup: string; volume: number; series: number }[];
  /** Um item por exercício executado no período. */
  exercisesDetail: {
    name: string;
    muscleGroup: string;
    series: number;
    reps: number;
    volume: number;
    /** Maior carga registrada no período — o recorde pessoal da janela. */
    maxLoad: number | null;
  }[];
  /** Volume por dia, do mais antigo ao mais recente. Alimenta o gráfico. */
  volumeEvolution: { day: string; volume: number; series: number }[];
};

export async function buildDashboard(
  userId: string,
  days: DashboardPeriod,
): Promise<WorkoutDashboard> {
  const since = new Date(Date.now() - days * 86_400_000);

  const execucoes = await prisma.workoutExecution.findMany({
    where: {
      userId,
      startedAt: { gte: since },
      // Sessões em andamento ficam fora: o volume delas ainda está mudando, e
      // incluí-las faria o número do dia oscilar enquanto a pessoa treina.
      status: { in: [WorkoutExecutionStatus.FINISHED, WorkoutExecutionStatus.AUTO_CLOSED] },
    },
    select: {
      startedAt: true,
      durationSec: true,
      exercises: {
        where: { completed: true },
        select: {
          load: true,
          repetitions: true,
          workoutExercise: {
            select: { exercise: { select: { name: true, muscleGroup: true } } },
          },
        },
      },
    },
  });

  let totalSeries = 0;
  let totalReps = 0;
  let totalDuration = 0;
  let volumeLoad = 0;

  const porMusculo = new Map<string, { volume: number; series: number }>();
  const porExercicio = new Map<
    string,
    { muscleGroup: string; series: number; reps: number; volume: number; maxLoad: number | null }
  >();
  const porDia = new Map<string, { volume: number; series: number }>();

  for (const execucao of execucoes) {
    totalDuration += execucao.durationSec ?? 0;
    const dia = diaLocal(execucao.startedAt);

    for (const serie of execucao.exercises) {
      const reps = serie.repetitions ?? 0;
      const carga = serie.load ?? 0;
      /*
       Peso corporal conta como SÉRIE mas não soma volume.

       Flexão e prancha entram com carga nula. Tratar nulo como zero é correto
       para o volume — não houve peso externo — e seria errado para a contagem:
       a série aconteceu.
      */
      const volume = carga * reps;

      totalSeries += 1;
      totalReps += reps;
      volumeLoad += volume;

      const musculo = serie.workoutExercise.exercise.muscleGroup;
      const m = porMusculo.get(musculo) ?? { volume: 0, series: 0 };
      porMusculo.set(musculo, { volume: m.volume + volume, series: m.series + 1 });

      const nome = serie.workoutExercise.exercise.name;
      const e = porExercicio.get(nome) ?? {
        muscleGroup: musculo,
        series: 0,
        reps: 0,
        volume: 0,
        maxLoad: null,
      };
      porExercicio.set(nome, {
        muscleGroup: musculo,
        series: e.series + 1,
        reps: e.reps + reps,
        volume: e.volume + volume,
        maxLoad: carga > 0 ? Math.max(e.maxLoad ?? 0, carga) : e.maxLoad,
      });

      const d = porDia.get(dia) ?? { volume: 0, series: 0 };
      porDia.set(dia, { volume: d.volume + volume, series: d.series + 1 });
    }
  }

  return {
    summary: {
      totalWorkouts: execucoes.length,
      totalSeries,
      totalReps,
      totalDuration,
      volumeLoad: Math.round(volumeLoad),
    },
    muscleDistribution: [...porMusculo.entries()]
      .map(([muscleGroup, v]) => ({ muscleGroup, volume: Math.round(v.volume), series: v.series }))
      .sort((a, b) => b.volume - a.volume),
    // Ordenado por volume, e não alfabético: quem abre a tela quer ver primeiro
    // onde o trabalho foi feito.
    exercisesDetail: [...porExercicio.entries()]
      .map(([name, v]) => ({ name, ...v, volume: Math.round(v.volume) }))
      .sort((a, b) => b.volume - a.volume),
    volumeEvolution: [...porDia.entries()]
      .map(([day, v]) => ({ day, volume: Math.round(v.volume), series: v.series }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/**
 * `YYYY-MM-DD` no fuso do SERVIDOR.
 *
 * Limitação conhecida e registrada: o agrupamento por dia usa o fuso do
 * servidor, não o de quem treinou. Para uma barra por dia num gráfico de 30
 * dias o erro é de um dia nas sessões da madrugada, e corrigir exige o
 * `tzOffset` do aparelho viajar em toda leitura — que é o mesmo cuidado que o
 * ingest de biometria já toma, e que vale trazer para cá quando a tela passar a
 * mostrar hora.
 */
function diaLocal(at: Date): string {
  const mes = String(at.getMonth() + 1).padStart(2, '0');
  const dia = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${mes}-${dia}`;
}
