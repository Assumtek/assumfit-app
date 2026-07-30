import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { fetchMorningForecast, getAmbient } from '../services/weather.service';

export const weatherRoutes = Router();
weatherRoutes.use(requireAuth);

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

/**
 * Clima ambiente da região do usuário.
 *
 * A coordenada NÃO é persistida em lugar nenhum — entra, vira chave de cache
 * arredondada e é descartada. Localização é dado pessoal, e guardar histórico
 * de posição de quem usa um app de saúde cria um passivo que o produto não
 * precisa para nada.
 */
weatherRoutes.get(
  '/',
  asyncRoute(async (req, res) => {
    const { lat, lon } = querySchema.parse(req.query);
    try {
      res.json(await getAmbient(lat, lon));
    } catch {
      // Clima é enriquecimento, não requisito: falhar aqui não pode derrubar a
      // home. O app trata 503 escondendo a linha de contexto.
      res.status(503).json({ error: 'Clima indisponível' });
    }
  }),
);

/** Previsão de amanhã às 7h — insumo do "bom dia" agendado no aparelho. */
weatherRoutes.get(
  '/morning',
  asyncRoute(async (req, res) => {
    const { lat, lon } = querySchema.parse(req.query);
    try {
      res.json(await fetchMorningForecast(lat, lon));
    } catch {
      res.status(503).json({ error: 'Previsão indisponível' });
    }
  }),
);
