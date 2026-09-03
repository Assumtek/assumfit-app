import axios from 'axios';
import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { apagarImagens, chaveEhDoUsuario } from '../services/media.service';

/**
 * Contagem de calorias por foto — o desenho do MUVX no nosso serviço de IA.
 *
 * A FOTO não é armazenada em lugar nenhum: sobe, é analisada e morre no
 * caminho — analisa e descarta. O que persiste é o
 * resultado: alimentos, porções e a faixa de calorias, que é o que a tela de
 * histórico precisa.
 */
export const nutritionRoutes = Router();
nutritionRoutes.use(requireAuth);

const client = axios.create({ baseURL: env.AI_SERVICE_URL, timeout: 60_000 });

const analyzeSchema = z.object({
  /** Sem prefixo data URI. O limite global de corpo (2 MB) segura o excesso. */
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  description: z.string().max(500).optional(),
  /**
   * A CHAVE da foto no S3, já subida pelo aparelho (01/09/2026).
   *
   * A imagem continua vindo em base64 para a análise, que acontece uma vez e
   * não precisa de ida ao bucket. A chave é o que faz a foto sobreviver na
   * tela, em qualquer aparelho.
   */
  imageKey: z.string().max(300).optional(),
});

nutritionRoutes.post(
  '/meal',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = analyzeSchema.parse(req.body);
    const chavePropria =
      body.imageKey && chaveEhDoUsuario(body.imageKey, req.userId) ? body.imageKey : null;

    /*
     A FOTO ÓRFÃ.

     A imagem sobe ao S3 antes da análise, então uma análise que falha deixa no
     bucket uma foto que registro nenhum referencia: ninguém a vê, nada a
     apaga, e ela só sairia junto com a conta. É desperdício e, pior, é guardar
     a foto de uma refeição que a pessoa não chegou a registrar.

     Aconteceu de verdade em 02/09/2026: um testador fotografou um prato, a
     foto subiu, e a análise voltou 502 porque o serviço de modelo estava sem
     crédito. Sobrou a imagem no bucket, sozinha.

     Vale para os DOIS desfechos de fracasso, o erro e a foto sem comida, que
     também não gera registro.
    */
    let data;
    try {
      ({ data } = await client.post('/nutrition/analyze', {
        image_b64: body.imageBase64,
        media_type: body.mediaType,
        description: body.description,
        request_id: req.userId,
      }));
    } catch (err) {
      if (chavePropria) await apagarImagens([chavePropria]).catch(() => undefined);
      throw err;
    }

    // Foto sem comida é resposta válida: devolve sem persistir — não existe
    // refeição de paisagem, e registrá-la sujaria o total do dia.
    if (!data.is_food) {
      // Sem registro, sem foto: ela não tem mais a que pertencer.
      if (chavePropria) await apagarImagens([chavePropria]).catch(() => undefined);
      res.json({ record: null, analysis: data });
      return;
    }

    const record = await prisma.mealRecord.create({
      data: {
        userId: req.userId,
        foods: data.foods,
        kcalMin: data.kcal_total_min,
        kcalMax: data.kcal_total_max,
        confidence: data.confidence,
        notes: data.notes || null,
        // Chave de outra conta não é erro: a refeição é registrada sem foto.
        imageKey: chavePropria,
      },
    });
    res.status(201).json({ record, analysis: data });
  }),
);

nutritionRoutes.get(
  '/meals',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    res.json(
      await prisma.mealRecord.findMany({
        where: { userId: req.userId, at: { gte: since } },
        orderBy: { at: 'desc' },
      }),
    );
  }),
);

/** Autocompletar da TACO — a pessoa busca "frang" e escolhe a entrada oficial. */
nutritionRoutes.get(
  '/foods',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { q } = z.object({ q: z.string().max(80).default('') }).parse(req.query);
    const { data } = await client.get('/nutrition/foods', { params: { q } });
    res.json(data);
  }),
);

const foodSchema = z.object({
  name: z.string().min(1).max(120),
  portion: z.string().max(120).optional().default(''),
  grams: z.number().positive().max(5000).nullable().optional().default(null),
  kcal_min: z.number().int().min(0).max(20000).optional().default(0),
  kcal_max: z.number().int().min(0).max(20000).optional().default(0),
  protein_g: z.number().min(0).nullable().optional().default(null),
  carbs_g: z.number().min(0).nullable().optional().default(null),
  fat_g: z.number().min(0).nullable().optional().default(null),
  uncertain: z.boolean().optional().default(false),
});

/**
 * Edição da refeição — a calibração que nenhum modelo dispensa: renomear,
 * ajustar gramas, remover e acrescentar alimento. O recálculo é da TACO, no
 * serviço de IA, sem chamada de modelo — nome e gramas novos passam de novo
 * pela tabela, e item sem casamento fica com o que o cliente mandou.
 */
nutritionRoutes.patch(
  '/meal/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = z.object({ foods: z.array(foodSchema).min(1).max(30) }).parse(req.body);

    const existente = await prisma.mealRecord.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existente) {
      res.status(404).json({ error: 'Refeição não encontrada' });
      return;
    }

    const { data } = await client.post('/nutrition/recompute', { foods: body.foods });
    const record = await prisma.mealRecord.update({
      where: { id: existente.id },
      data: {
        foods: data.foods,
        kcalMin: data.kcal_total_min,
        kcalMax: data.kcal_total_max,
      },
    });
    res.json({ record });
  }),
);

/**
 * Reanálise da MESMA refeição: a foto mora no aparelho, então ela sobe de
 * novo — junto da observação da pessoa ("tem farofa, e é frango"), que o
 * modelo trata com precedência. O registro é atualizado no lugar, preservando
 * id (a foto local é chaveada por ele) e horário.
 */
nutritionRoutes.post(
  '/meal/:id/reanalyze',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = analyzeSchema.parse(req.body);

    const existente = await prisma.mealRecord.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existente) {
      res.status(404).json({ error: 'Refeição não encontrada' });
      return;
    }

    const { data } = await client.post('/nutrition/analyze', {
      image_b64: body.imageBase64,
      media_type: body.mediaType,
      description: body.description,
      request_id: req.userId,
    });

    // Reanálise que não vê comida não apaga o registro: devolve sem tocar
    // nele, e a tela explica — o erro pode ser da foto, não do prato.
    //
    // A FOTO também fica: ela pertence ao registro que continua existindo, ao
    // contrário do primeiro envio, onde uma análise sem comida não deixa nada
    // a que a imagem possa pertencer.
    if (!data.is_food) {
      res.json({ record: null, analysis: data });
      return;
    }

    const record = await prisma.mealRecord.update({
      where: { id: existente.id },
      data: {
        foods: data.foods,
        kcalMin: data.kcal_total_min,
        kcalMax: data.kcal_total_max,
        confidence: data.confidence,
        notes: data.notes || null,
      },
    });
    res.json({ record, analysis: data });
  }),
);

// Registro errado sai na hora — análise de foto erra, e o total do dia não
// pode ficar refém do erro.
nutritionRoutes.delete(
  '/meal/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    /*
     A FOTO sai junto. Apagar a linha e deixar o objeto no bucket seria guardar
     a imagem de uma refeição que a pessoa mandou apagar, o que é exatamente o
     que a LGPD Art. 18 não permite.
    */
    const alvo = await prisma.mealRecord.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { imageKey: true },
    });
    await prisma.mealRecord.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (alvo?.imageKey) await apagarImagens([alvo.imageKey]);
    res.status(204).end();
  }),
);
