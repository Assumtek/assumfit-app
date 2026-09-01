import { ConsentPurpose, GenerationStatus, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { applyAdjustment, chatWithAgent, historicoDoChat } from '../services/workout/chat';
import {
  answerConversation,
  editAnswer,
  finalizeConversation,
  getConversation,
  startConversation,
} from '../services/workout/conversation';
import { buildDashboard } from '../services/workout/dashboard';
import { deriveFlags, parseAnamnesis } from '../services/workout/context-builder';
import { prisma } from '../lib/prisma';
import { similarExercises, trocarNoPlano, ultimasCargasPorExercicio } from '../services/workout/catalog';
import { comentarioDaSessao } from '../services/workout/session-feedback';
import { FORMATO_DA_FOTO } from '../services/workout/chat';
import {
  activePlan,
  cancelExecution,
  currentExecution,
  finishExecution,
  lastLoads,
  localDayOfWeek,
  recordSet,
  startExecution,
  workoutDetail,
} from '../services/workout/execution';
import { messageFor, requestGeneration } from '../services/workout/orchestrator';

/**
 * `from`/`to` (AAAA-MM-DD) opcionais, além de `days`: o pedido de "escolher um
 * intervalo de datas no calendário" (ago/2026). `to` é inclusivo até o fim do
 * dia. Intervalo invertido ou maior que um ano é recusado — não silenciado.
 */
const janelaSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
function janelaDeDatas(query: unknown): { from: Date; to: Date } | undefined {
  const { from, to } = janelaSchema.parse(query);
  if (!from && !to) return undefined;
  const inicio = new Date(`${from ?? to}T00:00:00`);
  const fim = new Date(`${to ?? from}T23:59:59.999`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) {
    throw Object.assign(new Error('Intervalo de datas inválido'), { status: 400 });
  }
  if (fim.getTime() - inicio.getTime() > 366 * 86_400_000) {
    throw Object.assign(new Error('Intervalo maior que um ano'), { status: 400 });
  }
  return { from: inicio, to: fim };
}

export const workoutRoutes = Router();
workoutRoutes.use(requireAuth);

// ==========================================================================
// ANAMNESE
// ==========================================================================

/**
 * As respostas do PAR-Q e das condições declaradas.
 *
 * `.passthrough()` de propósito: o grafo de perguntas mora no app
 * (`domain/anamnesis.ts`) e vai ganhar campos antes deste arquivo. O que
 * importa validar aqui são os campos que DERIVAM flag clínica — o resto é
 * guardado como veio.
 */
const anamnesisSchema = z
  .object({
    conditions: z.array(z.string()).max(20).optional(),
    conditionsDetail: z.string().max(2000).optional(),
    medications: z.string().max(2000).optional(),
    injuries: z.string().max(2000).optional(),
    parq: z
      .object({
        heartCondition: z.boolean().optional(),
        chestPain: z.boolean().optional(),
        dizziness: z.boolean().optional(),
        bloodPressureMedication: z.boolean().optional(),
        boneJointProblem: z.boolean().optional(),
      })
      .optional(),
    pregnant: z.boolean().optional(),
    weightKg: z.number().min(25).max(400).optional(),
    heightCm: z.number().min(100).max(250).optional(),
    experience: z.enum(['iniciante', 'intermediario', 'avancado']).optional(),
    minutesPerSession: z.number().int().min(10).max(240).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    equipment: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
  })
  .passthrough();

/**
 * Anamnese é dado de saúde: existe sob o consentimento `workout_generation` e
 * não é gravada sem ele. Não é formalidade — a diferença entre saber o HRV de
 * alguém e saber que a pessoa é cardiopata é exatamente o que o consentimento
 * separado protege.
 */
async function assertConsent(userId: string): Promise<void> {
  const consent = await prisma.consent.findFirst({
    where: { userId, purpose: ConsentPurpose.workout_generation, revokedAt: null },
  });
  if (!consent) {
    throw forbidden('É necessário consentir com o uso dos dados de saúde para treino.');
  }
}

/**
 * Concede ou revoga o consentimento de uso dos dados de saúde para treino.
 *
 * Mesmo desenho do ciclo menstrual: separado, revogável, e com
 * efeito REAL ao revogar — o "não" apaga a anamnese e os planos gerados a
 * partir dela. Guardar a resposta depois da revogação transformaria o
 * consentimento em formalidade, e é justamente este o dado que alguém pode
 * querer que suma.
 *
 * O histórico de sessões não é apagado: ele é registro de atividade física
 * feita pela pessoa, não a declaração clínica que ela retirou.
 */
workoutRoutes.put(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { granted, version } = z
      .object({ granted: z.boolean(), version: z.string().min(1).max(32) })
      .parse(req.body);

    if (!granted) {
      await prisma.$transaction([
        prisma.consent.updateMany({
          where: {
            userId: req.userId,
            purpose: ConsentPurpose.workout_generation,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        }),
        prisma.healthAnamnesis.deleteMany({ where: { userId: req.userId } }),
        prisma.trainingPlan.deleteMany({ where: { userId: req.userId } }),
      ]);
      return res.json({ granted: false });
    }

    const existing = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: ConsentPurpose.workout_generation, revokedAt: null },
    });
    if (!existing) {
      await prisma.consent.create({
        data: { userId: req.userId, purpose: ConsentPurpose.workout_generation, version },
      });
    }
    return res.json({ granted: true });
  }));

/** A tela precisa saber antes de começar a perguntar sobre saúde. */
workoutRoutes.get(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const consent = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: ConsentPurpose.workout_generation, revokedAt: null },
      select: { grantedAt: true },
    });
    res.json({ granted: Boolean(consent) });
  }));

workoutRoutes.put(
  '/anamnesis',
  asyncRoute<AuthedRequest>(async (req, res) => {
    await assertConsent(req.userId);
    // O cast é por causa do `.passthrough()`: o tipo do Zod fica aberto, e a
    // coluna Json do Prisma exige um objeto fechado. A validação já aconteceu.
    const answers = anamnesisSchema.parse(req.body) as Prisma.InputJsonObject;
    /*
     As bandeiras são derivadas ANTES da transação.

     `deriveFlags` precisa de sexo e idade — condição declarada só vira risco
     contra a pessoa que a declarou. Consulta de leitura dentro de transação de
     escrita segura conexão do pool sem motivo.
    */
    const [user, lifestyle] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: req.userId },
        select: { sex: true, birthDate: true },
      }),
      prisma.lifestyleProfile.findUnique({ where: { userId: req.userId } }),
    ]);
    const flags = deriveFlags(parseAnamnesis(answers), {
      sex: user.sex,
      birthDate: user.birthDate,
      activities: lifestyle?.activities ?? [],
      trainDays: lifestyle?.trainDays ?? [],
      trainPlace: lifestyle?.trainPlace ?? null,
      goal: lifestyle?.goal ?? null,
      exercises: lifestyle?.exercises ?? null,
    });

    /*
     Grava o ESTADO ATUAL e uma VERSÃO, na mesma transação.

     São papéis diferentes: o agente precisa do que vale agora, e a pessoa
     precisa poder ver o que declarou antes — sem isso não há como entender por
     que o plano do mês passado era daquele jeito. Numa transação porque salvar
     um sem o outro produz um histórico que mente.

     As bandeiras vão junto congeladas. A regra que as deriva muda com o tempo,
     e recalcular hoje daria outro resultado, apagando a razão da prescrição
     daquela época.
    */
    const [saved] = await prisma.$transaction([
      prisma.healthAnamnesis.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, answers },
        update: { answers },
      }),
      prisma.healthAnamnesisVersion.create({
        data: {
          userId: req.userId,
          answers,
          flags,
        },
      }),
    ]);
    res.json({ updatedAt: saved.updatedAt });
  }));

workoutRoutes.get(
  '/anamnesis',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const found = await prisma.healthAnamnesis.findUnique({ where: { userId: req.userId } });
    res.json(found ? { answers: found.answers, updatedAt: found.updatedAt } : null);
  }));

/**
 * As versões anteriores das respostas.
 *
 * Só metadado na lista — data, contagem de bandeiras e um resumo —, não o JSON
 * inteiro. O histórico é para conferir o que mudou; quem quiser o detalhe abre
 * uma versão, e aí o dado sensível trafega por pedido explícito, não por
 * varredura.
 */
workoutRoutes.get(
  '/anamnesis/history',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const rows = await prisma.healthAnamnesisVersion.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, createdAt: true, flags: true },
    });
    res.json(rows);
  }));

workoutRoutes.get(
  '/anamnesis/history/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    // `userId` no WHERE: sem ele, trocar o uuid da URL lê a anamnese de outra
    // pessoa — e aqui o conteúdo é condição clínica declarada.
    const found = await prisma.healthAnamnesisVersion.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!found) throw notFound('Versão não encontrada');
    res.json({ id: found.id, answers: found.answers, flags: found.flags, createdAt: found.createdAt });
  }));

// ==========================================================================
// GERAÇÃO
// ==========================================================================

workoutRoutes.post(
  '/plan/generate',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { feedback } = z
      .object({ feedback: z.string().max(500).optional() })
      .parse(req.body ?? {});
    const requestId = await requestGeneration(req.userId, feedback);
    res.status(202).json({ requestId });
  }));


workoutRoutes.get(
  '/exercise/:exerciseId/similar',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const sugeridos = await similarExercises(req.params.exerciseId);
    /*
     A carga vai JUNTO com cada substituto, e é a desta pessoa neste exercício.
     Sem ela o app pré-preenchia o peso do exercício ANTERIOR, que é peso de
     outro movimento (Leonardo, 25/08/2026).
    */
    const cargas = await ultimasCargasPorExercicio(req.userId, sugeridos.map((e) => e.id));
    res.json(sugeridos.map((e) => ({ ...e, last_load: cargas[e.id] ?? null })));
  }));

/**
 * Fixa a troca no PLANO, não só na sessão de hoje.
 *
 * A troca durante o treino é local por princípio: máquina ocupada não deve
 * reescrever as próximas semanas. O que faltava era a pessoa poder dizer que
 * aquela troca é para valer (Bruno, 24/08/2026). Quem decide é ela, e a decisão
 * é explícita: o app pergunta antes.
 *
 * As travas estão no serviço, que só aceita substituto vindo da lista de
 * similares e só altera exercício de plano do próprio usuário.
 */
workoutRoutes.patch(
  '/plan/exercise/:workoutExerciseId',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { exerciseId } = z.object({ exerciseId: z.string().uuid() }).parse(req.body);
    const r = await trocarNoPlano({
      userId: req.userId,
      workoutExerciseId: req.params.workoutExerciseId,
      exerciseId,
    });
    if (r === 'nao-encontrado') return res.status(404).json({ error: 'Exercício não encontrado no seu plano' });
    if (r === 'substituto-invalido') {
      return res.status(422).json({ error: 'Esse exercício não é um substituto oferecido para este' });
    }
    res.json({ ok: true });
  }));

// ==========================================================================
// EXECUÇÃO
// ==========================================================================

workoutRoutes.get(
  '/execution/current',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const execution = await currentExecution(req.userId);
    res.json(
      execution
        ? {
            id: execution.id,
            workoutId: execution.workoutId,
            workoutName: execution.workout.name,
            estimatedDuration: execution.workout.estimatedDuration,
            startedAt: execution.startedAt,
          }
        : null);
  }));

workoutRoutes.post(
  '/execution',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { workoutId, planDayId } = z
      .object({ workoutId: z.string().uuid(), planDayId: z.string().uuid().optional() })
      .parse(req.body);
    const execution = await startExecution(req.userId, workoutId, planDayId);
    res.status(201).json({
      id: execution.id,
      workoutId: execution.workoutId,
      workoutName: execution.workout.name,
      startedAt: execution.startedAt,
    });
  }));

workoutRoutes.patch(
  '/execution/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const progress = z
      .object({
        workoutExerciseId: z.string().uuid(),
        setOrder: z.number().int().min(1).max(50),
        load: z.number().min(0).max(1000).nullable().optional(),
        repetitions: z.number().int().min(0).max(500).nullable().optional(),
        completed: z.boolean(),
      })
      .parse(req.body);
    await recordSet(req.userId, req.params.id, progress);
    res.status(204).end();
  }));

workoutRoutes.post(
  '/execution/:id/finish',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const params = z
      .object({
        perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        comment: z.string().max(1000).nullable().optional(),
      })
      .parse(req.body ?? {});
    const execution = await finishExecution(req.userId, req.params.id, params);
    res.json({
      id: execution.id,
      workoutName: execution.workout.name,
      durationSec: execution.durationSec,
      completionPct: execution.completionPct,
      finishedAt: execution.finishedAt,
    });
  }));

/**
 * O comentário do treino recém-concluído, redigido pelo modelo.
 *
 * Separado do `finish` de propósito: concluir precisa responder rápido e não
 * pode depender de IA. Ver `session-feedback.ts`.
 *
 * 204 quando não há comentário (modelo fora, sem crédito, sessão sem duração):
 * a tela não mostra o bloco, e isso é melhor que uma frase genérica fingindo
 * que alguém leu os números da sessão.
 */
workoutRoutes.get(
  '/execution/:id/feedback',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const texto = await comentarioDaSessao(req.userId, req.params.id);
    if (!texto) return res.status(204).end();
    res.json(texto);
  }));

workoutRoutes.delete(
  '/execution/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    await cancelExecution(req.userId, req.params.id);
    res.status(204).end();
  }));

workoutRoutes.get(
  '/execution/history',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const janela = janelaDeDatas(req.query);
    const since = janela?.from ?? new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.workoutExecution.findMany({
      where: { userId: req.userId, startedAt: janela ? { gte: since, lte: janela.to } : { gte: since } },
      orderBy: { startedAt: 'desc' },
      include: { workout: { select: { name: true, muscleGroups: true } } },
    });
    res.json(
      rows.map((row) => ({
        id: row.id,
        workoutName: row.workout.name,
        muscleGroups: row.workout.muscleGroups,
        status: row.status,
        startedAt: row.startedAt,
        durationSec: row.durationSec,
        completionPct: row.completionPct,
        rating: row.rating,
      })));
  }));

/**
 * Conversa com o agente sobre o plano ativo — o "Personal".
 *
 * Sem estado no servidor: o histórico vem do aparelho a cada turno. É de
 * propósito — guardar a conversa criaria uma segunda base de texto livre sobre
 * saúde, com retenção e consentimento próprios, para resolver algo que o
 * aparelho já resolve.
 */
/**
 * Confirma uma proposta do chat e a aplica no plano.
 *
 * Separado do `/chat` de propósito: propor é uma coisa, mudar a prescrição de
 * alguém é outra, e a segunda precisa de um toque explícito. O corpo carrega só
 * o id — o diff nunca sai do servidor.
 */
workoutRoutes.post(
  '/chat/apply',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { adjustmentId } = z
      .object({ adjustmentId: z.string().uuid() })
      .parse(req.body ?? {});

    const result = await applyAdjustment(req.userId, adjustmentId);
    res.json(result);
  }));

/**
 * A conversa com o personal, para a tela abrir de onde parou.
 *
 * Existe porque a conversa passou a viver na conta: sem esta rota, o app
 * continuaria começando do zero a cada abertura, que é justamente o que se
 * queria corrigir.
 */
workoutRoutes.get(
  '/chat',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const turnos = await historicoDoChat(req.userId);
    res.json({ turnos });
  }));

workoutRoutes.post(
  '/chat',
  asyncRoute<AuthedRequest>(async (req, res) => {
    /*
     O histórico NÃO vem mais do corpo da requisição.

     A conversa é do servidor desde 24/08/2026: ela segue a conta em vez de
     morrer com a tela, e o contexto que chega ao modelo deixa de ser o que o
     aparelho disser que é. Campo antigo enviado por um app desatualizado é
     simplesmente ignorado, sem quebrar a requisição.
    */
    const { message, imageBase64, mediaType, imageRef } = z
      .object({
        message: z.string().min(1).max(1000),
        /*
         A foto do aparelho (Leonardo, 31/08/2026). O teto de 8 MB em base64
         são ~6 MB de imagem, e o app já reduz para 1280 px antes de mandar:
         o limite existe para o caso de uma versão futura esquecer disso, não
         para o uso normal.
        */
        imageBase64: z.string().min(1).max(8_000_000).optional(),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
        /*
         O NOME do arquivo no aparelho, gerado por ele. Validado para ser um
         nome de arquivo e nada mais: ele volta ao app, que o usa para montar
         um caminho local, e um "../" aqui viraria leitura fora da pasta.
        */
        imageRef: z.string().regex(FORMATO_DA_FOTO).optional(),
      })
      .parse(req.body ?? {});

    const result = await chatWithAgent(
      req.userId,
      message,
      imageBase64
        ? { base64: imageBase64, mediaType: mediaType ?? 'image/jpeg', ref: imageRef }
        : undefined,
    );
    res.json({
      reply: result.reply,
      blocked: result.blocked,
      blockReason: result.blockReason,
      // As operações continuam NÃO indo para o app: o diff mora no servidor, e
      // o app devolve só o id ao confirmar. Aceitar operações do cliente seria
      // deixar qualquer requisição escrever no plano por fora das travas
      // clínicas — que são a razão de este módulo existir.
      operationCount: result.operations.length,
      adjustmentId: result.adjustmentId,
    });
  }));

// ==========================================================================
// ANAMNESE CONVERSACIONAL
// ==========================================================================

/**
 * Começa (ou retoma) a entrevista.
 *
 * Retomar em vez de criar outra evita duas entrevistas simultâneas — e com elas
 * duas respostas conflitantes para a mesma pergunta, sem forma de saber qual vale.
 */
workoutRoutes.post(
  '/anamnesis/conversation',
  asyncRoute<AuthedRequest>(async (req, res) => {
    await assertConsent(req.userId);
    res.json(await startConversation(req.userId));
  }));

workoutRoutes.get(
  '/anamnesis/conversation/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    res.json(await getConversation(req.userId, req.params.id));
  }));

workoutRoutes.post(
  '/anamnesis/conversation/:id/answer',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { value } = z.object({ value: z.string().max(1000) }).parse(req.body ?? {});
    res.json(await answerConversation(req.userId, req.params.id, value));
  }));

workoutRoutes.patch(
  '/anamnesis/conversation/:id/answer',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { questionId, value } = z
      .object({ questionId: z.string().min(1), value: z.string().max(1000) })
      .parse(req.body ?? {});
    res.json(await editAnswer(req.userId, req.params.id, questionId, value));
  }));

/**
 * Fecha a entrevista e grava anamnese + versão.
 *
 * Reaproveita o mesmo caminho de gravação do formulário antigo — inclusive as
 * bandeiras clínicas congeladas — para não existirem dois lugares que escrevem
 * anamnese com regras diferentes.
 */
workoutRoutes.post(
  '/anamnesis/conversation/:id/finalize',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { answers } = await finalizeConversation(req.userId, req.params.id);
    res.json({ answers });
  }));

/**
 * Relatório de progresso — o que o `StudentProgressReport` do MUVX mostra.
 *
 * Uma requisição por período, e a agregação no SERVIDOR. Mandar as execuções
 * cruas para o app somar significaria trafegar todas as séries de 90 dias por
 * um gráfico de barras — e recalcular no aparelho a cada troca de período.
 */
workoutRoutes.get(
  '/dashboard',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z
      .object({ days: z.coerce.number().int().refine((d) => [1, 7, 30, 90].includes(d)).default(30) })
      .parse(req.query);
    res.json(await buildDashboard(req.userId, days as 1 | 7 | 30 | 90, janelaDeDatas(req.query)));
  }));

/**
 * O detalhe de UMA execução, série a série.
 *
 * Vem depois de `/execution/history` de propósito: o Express casa na ordem de
 * declaração, e `/execution/:id` declarado antes engoliria `/execution/history`
 * — que passaria a receber "history" como id e devolver 404 sem explicação.
 *
 * Devolve o PRESCRITO junto do executado. Sem os dois lado a lado não dá para
 * ler o que aconteceu: três séries registradas só significa alguma coisa contra
 * as quatro que estavam no plano.
 */
workoutRoutes.get(
  '/execution/:id/detail',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const execution = await prisma.workoutExecution.findFirst({
      // `userId` no WHERE, não só o id: sem isso qualquer pessoa autenticada lê
      // a execução de qualquer outra trocando o uuid da URL.
      where: { id: req.params.id, userId: req.userId },
      include: {
        workout: {
          select: {
            name: true,
            muscleGroups: true,
            phases: {
              orderBy: { order: 'asc' },
              select: {
                type: true,
                exercises: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    subtype: true,
                    // O nome vem do CATÁLOGO: `WorkoutExercise` é a prescrição
                    // e guarda só a referência. É a mesma regra que impede
                    // exercício prescrito fora do catálogo.
                    exercise: { select: { name: true } },
                    sets: { orderBy: { order: 'asc' }, select: { repetitions: true, load: true } },
                  },
                },
              },
            },
          },
        },
        exercises: { orderBy: { setOrder: 'asc' } },
      },
    });

    if (!execution) throw notFound('Execução não encontrada');

    const feitasPorExercicio = new Map<string, typeof execution.exercises>();
    for (const feita of execution.exercises) {
      const lista = feitasPorExercicio.get(feita.workoutExerciseId) ?? [];
      lista.push(feita);
      feitasPorExercicio.set(feita.workoutExerciseId, lista);
    }

    res.json({
      id: execution.id,
      workoutName: execution.workout.name,
      muscleGroups: execution.workout.muscleGroups,
      status: execution.status,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      durationSec: execution.durationSec,
      completionPct: execution.completionPct,
      perceivedEffort: execution.perceivedEffort,
      rating: execution.rating,
      comment: execution.comment,
      phases: execution.workout.phases.map((phase) => ({
        type: phase.type,
        exercises: phase.exercises.map((exercise) => {
          const feitas = feitasPorExercicio.get(exercise.id) ?? [];
          return {
            id: exercise.id,
            name: exercise.exercise.name,
            subtype: exercise.subtype,
            prescribedSets: exercise.sets.length,
            sets: feitas.map((s) => ({
              order: s.setOrder,
              load: s.load,
              repetitions: s.repetitions,
              completed: s.completed,
            })),
          };
        }),
      })),
    });
  }));

/*
 A rota genérica `/:workoutId` é declarada por ÚLTIMO, e isso é regra, não
 estilo. O Express casa na ordem de declaração, e ela engole qualquer caminho
 de um segmento — foi assim que `/dashboard` virou `workoutDetail('dashboard')`
 e morreu num erro de UUID enquanto a tela de progresso mostrava vazio. Toda
 rota nova entra ACIMA desta linha.
*/
/**
 * Status da geração, consultado pela tela de progresso.
 *
 * Devolve a MENSAGEM pronta junto do código, e não só o código: montar a frase
 * na tela espalharia o vocabulário clínico por dois repositórios, e eles
 * divergiriam.
 */
workoutRoutes.get(
  '/plan/generate/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const request = await prisma.planGenerationRequest.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!request) throw notFound('Solicitação não encontrada');

    const done = request.status === GenerationStatus.DONE;
    const failed =
      request.status === GenerationStatus.BLOCKED ||
      request.status === GenerationStatus.FAILED ||
      request.status === GenerationStatus.REFERRAL;

    res.json({
      id: request.id,
      status: request.status,
      trainingPlanId: request.trainingPlanId,
      finished: done || failed,
      message: failed ? messageFor(request.blockReason, request.flags ?? []) : null,
      // O motivo, não o texto: a tela decide se oferece "tentar de novo"
      // (qualidade, timeout) ou não (encaminhamento).
      reason: request.blockReason,
    });
  }));

// ==========================================================================
// PLANO E TREINOS
// ==========================================================================

workoutRoutes.get(
  '/plan/active',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const [plan, user] = await Promise.all([
      activePlan(req.userId),
      prisma.user.findUniqueOrThrow({
        where: { id: req.userId },
        select: { tzOffsetMin: true },
      }),
    ]);
    if (!plan) return res.json(null);

    const today = localDayOfWeek(user.tzOffsetMin);
    res.json({
      id: plan.id,
      name: plan.name,
      goal: plan.goal,
      level: plan.level,
      rationale: plan.rationale,
      startDate: plan.startDate,
      endDate: plan.endDate,
      today,
      days: plan.days.map((day) => ({
        id: day.id,
        dayOfWeek: day.dayOfWeek,
        dayType: day.dayType,
        workout: day.workout
          ? {
              id: day.workout.id,
              name: day.workout.name,
              modality: day.workout.modality,
              muscleGroups: day.workout.muscleGroups,
              estimatedDuration: day.workout.estimatedDuration,
              exerciseCount: day.workout.exercises.length,
            }
          : null,
      })),
    });
  }));

workoutRoutes.get(
  '/:workoutId',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const workout = await workoutDetail(req.userId, req.params.workoutId);
    const loads = await lastLoads(req.userId, workout.id);

    res.json({
      id: workout.id,
      name: workout.name,
      modality: workout.modality,
      muscleGroups: workout.muscleGroups,
      estimatedDuration: workout.estimatedDuration,
      phases: workout.phases.map((phase) => ({
        type: phase.type,
        order: phase.order,
        exercises: phase.exercises.map((item) => ({
          id: item.id,
          exerciseId: item.exerciseId,
          name: item.exercise.name,
          description: item.exercise.description,
          muscleGroup: item.exercise.muscleGroup,
          equipment: item.exercise.equipment,
          videoUrl: item.exercise.videoUrl ?? null,
          thumbnailUrl: item.exercise.thumbnailUrl ?? null,
          subtype: item.subtype,
          notes: item.notes,
          duration: item.duration,
          intensity: item.intensity,
          holdTime: item.holdTime,
          // Carga da última vez que a pessoa fez este exercício — é o que a tela
          // pré-preenche.
          lastLoad: loads[item.id] ?? null,
          sets: item.sets.map((set) => ({
            order: set.order,
            repetitions: set.repetitions,
            restTime: set.restTime,
            load: set.load,
          })),
        })),
      })),
    });
  }));

/** Guarda: `/:workoutId` é genérico e engoliria qualquer caminho não previsto. */
workoutRoutes.use((req) => {
  throw badRequest(`Rota de treino desconhecida: ${req.path}`);
});
