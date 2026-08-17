import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { startScoringJob, stopScoringJob } from './jobs/scoring.job';
import { env } from './lib/env';
import { logError } from './lib/log';
import { closeRedis, initRedis, redisReady } from './lib/redis';
import { prisma } from './lib/prisma';
import { errorHandler } from './middleware/error';
import { createLimiters, TRUST_PROXY_HOPS } from './middleware/rateLimit';
import { authRoutes } from './routes/auth.routes';
import { biometricRoutes } from './routes/biometric.routes';
import { habitsRoutes } from './routes/habits.routes';
import { nutritionRoutes } from './routes/nutrition.routes';
import { transcribeRoutes } from './routes/transcribe.routes';
import { sportRoutes } from './routes/sport.routes';
import { cycleRoutes } from './routes/cycle.routes';
import { insightsRoutes } from './routes/insights.routes';
import { lifestyleRoutes } from './routes/lifestyle.routes';
import { weatherRoutes } from './routes/weather.routes';
import { workoutRoutes } from './routes/workout.routes';

const app = express();

/**
 * Atrás de um balanceador, `req.ip` é o IP dele — todo mundo vira o mesmo
 * cliente e o limite de taxa passa a ser global em vez de por pessoa. Com o
 * número de saltos declarado, o Express lê o `X-Forwarded-For` até a posição
 * certa; confiar no cabeçalho inteiro permitiria forjar o IP e burlar o limite.
 */
app.set('trust proxy', TRUST_PROXY_HOPS);

/**
 * `id` de leitura biométrica e de sessão são `BigInt` no Prisma, e
 * `JSON.stringify` não sabe serializá-los — `GET /biometric/latest` respondia
 * 500 por causa disso. Vira string, não número: acima de 2^53 um ponto
 * flutuante perde precisão em silêncio, que é o pior desfecho possível para um
 * identificador.
 */
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value,
);

/**
 * Origem liberada por lista, não por curinga.
 *
 * O app nativo não manda `Origin`, então nada disto o afeta — quem depende é o
 * retorno do OAuth de calendário e um eventual painel web. `cors()` sem
 * argumento respondia `Access-Control-Allow-Origin: *` para qualquer site, o
 * que faz de qualquer página aberta pela pessoa um cliente da nossa API.
 */
function corsOptions(): cors.CorsOptions {
  const allowed = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      // Sem `Origin`: app nativo, curl, health check. Não é requisição de
      // navegador, então a política de mesma origem não se aplica.
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origem não permitida'));
    },
    credentials: true,
  };
}

app.use(helmet());
app.use(cors(corsOptions()));
// A foto do prato é a única exceção ao teto global: o app redimensiona antes
// de subir, mas o teto real precisa caber uma câmera desconhecida — parser
// próprio, ANTES do global (o segundo vê o corpo já lido e não mexe).
app.use('/nutrition/meal', express.json({ limit: '8mb' }));
// Lote de biometria é o maior corpo que a API recebe; 2 MB cobre ~1000
// leituras com folga e ainda barra corpo abusivo.
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', rateLimit: redisReady() ? 'redis' : 'memory' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

/**
 * Os limitadores são montados aqui, e não na fase de import, porque a store
 * deles depende de uma conexão de Redis que ainda não existe naquele momento.
 * `bootstrap` chama isto depois de `initRedis` resolver.
 */
function mountLimiters() {
  const limiters = createLimiters();
  // O limite específico vem antes do geral: invertido, o geral consumiria a
  // cota e o de autenticação nunca chegaria a contar.
  app.use('/auth/login', limiters.auth);
  app.use('/auth/register', limiters.auth);
  app.use('/auth/refresh', limiters.auth);
  app.use('/biometric/ingest', limiters.ingest);
  app.use(limiters.api);
}

function mountRoutes() {
  app.use('/auth', authRoutes);
app.use('/biometric', biometricRoutes);
app.use('/habits', habitsRoutes);
app.use('/nutrition', nutritionRoutes);
app.use('/transcribe', transcribeRoutes);
app.use('/sport', sportRoutes);
app.use('/cycle', cycleRoutes);
app.use('/insights', insightsRoutes);
  app.use('/lifestyle', lifestyleRoutes);
  app.use('/weather', weatherRoutes);
  app.use('/workout', workoutRoutes);
  app.use(errorHandler);
}

/**
 * Ordem da subida, e por que ela importa:
 *
 * 1. Redis conecta — os limitadores precisam da store dele para não contarem
 *    por processo.
 * 2. Limitadores e rotas são montados, nessa ordem.
 * 3. Só então a porta abre. Aceitar tráfego antes do passo 1 serviria alguns
 *    segundos de requisições sem limite a cada deploy, que é justamente a
 *    janela que um ataque de força bruta procura.
 */
let server: import('node:http').Server;

async function bootstrap() {
  initRedis();
  // Curto de propósito: o Redis não pode atrasar a subida. Se não conectar a
  // tempo, os limitadores caem para memória e o log acusa — melhor que travar
  // o deploy inteiro esperando uma dependência de apoio.
  await new Promise((resolve) => setTimeout(resolve, 500));

  mountLimiters();
  mountRoutes();

  server = app.listen(env.PORT, () => {
    console.log(
      `AssumFit API em http://localhost:${env.PORT} (${env.NODE_ENV}, limite=${redisReady() ? 'redis' : 'memória'})`,
    );
    // Sem esta chamada as tabelas de score ficam vazias e as correlações do
    // modelo nunca alcançam a amostra mínima.
    startScoringJob();
  });
}

void bootstrap();

/**
 * Encerramento gracioso.
 *
 * `server.close` para de aceitar conexão nova mas ESPERA as em voo, e é isso que
 * evita cortar um ingest de mil leituras no meio de um deploy. O timeout existe
 * porque uma conexão pendurada seguraria o processo indefinidamente até o
 * orquestrador mandar SIGKILL — pior que sair por conta própria.
 */
const SHUTDOWN_TIMEOUT_MS = 15_000;
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} recebido, encerrando`);

  stopScoringJob();
  await closeRedis();
  const forced = setTimeout(() => {
    console.error('[server] encerramento forçado por timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forced.unref();

  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Sem estes dois, uma rejeição não tratada derruba o processo sem deixar rastro.
process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason));
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
  void shutdown('uncaughtException');
});
