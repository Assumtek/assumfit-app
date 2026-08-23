import axios from 'axios';
import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';
import { hrvBaseline } from '../services/biometric.service';
import { energyNow } from '../services/scoring.service';
import { localDayOfWeek } from '../services/workout/execution';
import { env } from '../lib/env';

export const insightsRoutes = Router();
insightsRoutes.use(requireAuth);

/**
 * A regra de negócio de score e idade biológica mora num lugar só — o modelo em
 * Python. Estas rotas leem o banco, chamam o modelo e devolvem; quem monta o
 * payload e persiste é `scoring.service`, compartilhado com o job horário.
 * Duplicar a fórmula aqui garantiria divergência entre os dois.
 */

/**
 * O que a tela inicial mostra: score, curva do dia e o texto do insight.
 *
 * `hour` vem do APARELHO. A hora do dia é entrada do modelo — o vale da tarde
 * só existe em relação ao relógio de quem está lendo —, e o servidor roda em
 * UTC. Sem o parâmetro, todo assinante brasileiro receberia um insight três
 * horas adiantado.
 */
insightsRoutes.get(
  '/energy',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { hour, force } = z
      .object({
        hour: z.coerce.number().int().min(0).max(23).optional(),
        // O botão Atualizar da home: relê o dia no banco e rediz a frase,
        // ignorando o cache da hora.
        force: z.coerce.boolean().default(false),
      })
      .parse(req.query);

    try {
      const result = await energyNow(req.userId, { hour, force });
      if (!result) return res.status(404).json({ error: 'Sem leitura ainda' });
      return res.json(result);
    } catch {
      const baseline = await hrvBaseline(req.userId).catch(() => null);
      // 503 e não um score improvisado: a tela sabe cair para o cálculo local
      // dela, e um número inventado aqui competiria com o de lá sem que ninguém
      // conseguisse dizer qual está certo.
      return res.status(503).json({ error: 'Serviço de modelo indisponível', calibrating: baseline === null });
    }
  }),
);

/**
 * O texto da notificação matinal — redigido pelo modelo, não por molde.
 *
 * O app manda a PREVISÃO (ele já consulta o Open-Meteo para o cartão de
 * ambiente) e o servidor acrescenta o que só ele sabe: se amanhã é dia de
 * treino no plano e qual é a sessão. O aparelho agenda a notificação local
 * com o texto que voltar — a entrega é do celular, a redação é da IA.
 *
 * Falhou o modelo? O serviço de IA já devolve o molde com `source:
 * "template"`. Se a rede inteira falhar, esta rota devolve 503 e o app mantém
 * o texto que já tinha agendado, que é melhor que apagar a notificação.
 */
insightsRoutes.get(
  '/morning',
  asyncRoute<AuthedRequest>(async (req, res) => {
    // Previsão opcional: sem localização o bom dia continua existindo, só
    // sem o tempo. `recent` são os últimos textos entregues, para não repetir.
    const { temperature, humidity, city, recent } = z
      .object({
        temperature: z.coerce.number().min(-30).max(60).optional(),
        humidity: z.coerce.number().min(0).max(100).optional(),
        city: z.string().max(80).optional(),
        recent: z.string().max(2000).optional(),
      })
      .parse(req.query);

    // O dia da notificação é AMANHÃ, no fuso de quem vai acordar.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { tzOffsetMin: true },
    });
    const amanha = new Date(Date.now() + 86_400_000);
    const diaDaSemana = localDayOfWeek(user.tzOffsetMin, amanha);

    const plano = await prisma.trainingPlan.findFirst({
      where: { userId: req.userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        days: {
          where: { dayOfWeek: diaDaSemana },
          select: { dayType: true, workout: { select: { name: true } } },
        },
      },
    });
    const diaDoPlano = plano?.days[0];
    const treina = diaDoPlano?.dayType === 'WORKOUT' && Boolean(diaDoPlano.workout);

    try {
      const { data } = await axios.post(
        `${env.AI_SERVICE_URL}/insights/morning`,
        {
          temperature_c: temperature == null ? null : Math.round(temperature),
          humidity_pct: humidity == null ? null : Math.round(humidity),
          recent: recent ? recent.split('\u001f').filter(Boolean).slice(0, 7) : [],
          trains_tomorrow: treina,
          workout_name: diaDoPlano?.workout?.name ?? null,
          streak_days: await sequenciaDeMovimento(req.userId, user.tzOffsetMin),
          city: city ?? null,
        },
        { timeout: 15_000 },
      );
      return res.json(data);
    } catch {
      return res.status(503).json({ error: 'Serviço de modelo indisponível' });
    }
  }),
);

insightsRoutes.get(
  '/bioage',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400000);
    res.json(
      await prisma.bioAgeScore.findMany({
        where: { userId: req.userId, calculatedAt: { gte: since } },
        orderBy: { calculatedAt: 'asc' },
      }),
    );
  }),
);

/**
 * Dias consecutivos com movimento, terminando hoje ou ontem.
 *
 * O dia de HOJE ainda em branco não zera a sequência — ele é uma chance, não
 * uma falta, e é a mesma regra que a agenda de movimento do app aplica. As
 * duas fontes contam: treino do plano CONCLUÍDO e sessão de esporte.
 *
 * Trinta dias de janela: é o suficiente para uma saudação, e a sequência que
 * o app mostra tem a própria janela — se um dia divergirem em número, quem
 * manda é a tela, que a pessoa consegue conferir.
 */
async function sequenciaDeMovimento(userId: string, tzOffsetMin: number): Promise<number> {
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const [execucoes, sessoes] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { userId, status: 'FINISHED', startedAt: { gte: desde } },
      select: { startedAt: true },
    }),
    prisma.sportSession.findMany({
      where: { userId, startedAt: { gte: desde } },
      select: { startedAt: true },
    }),
  ]);

  // A chave é a data LOCAL de quem treinou: uma corrida às 23h no Brasil é do
  // dia 14, não do 15 que o UTC diria.
  const chave = (d: Date) => new Date(d.getTime() + tzOffsetMin * 60_000).toISOString().slice(0, 10);
  const dias = new Set([...execucoes, ...sessoes].map((r) => chave(r.startedAt)));

  const cursor = new Date(Date.now() + tzOffsetMin * 60_000);
  if (!dias.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let sequencia = 0;
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    sequencia += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return sequencia;
}
