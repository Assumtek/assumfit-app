import { logError } from '../lib/log';
import { prisma } from '../lib/prisma';
import { pruneRefreshTokens } from '../services/auth.service';
import { bioAgeNow, energyNow, localHour } from '../services/scoring.service';

/**
 * Grava o histórico de scores.
 *
 * Sem este job, `energy_scores` e `bio_age_scores` ficam vazias — o cálculo só
 * acontecia quando alguém abria o app, e o resultado nem era gravado. A
 * consequência era maior que uma tabela vazia: as correlações do modelo
 * precisam de 14 dias pareados de score contra hábito, então elas eram
 * INALCANÇÁVEIS por construção, não por falta de usuários.
 *
 * Duas decisões:
 *
 * **Intervalo em vez de cron.** Uma dependência a menos para uma regra que é
 * "de hora em hora". O alinhamento com a hora cheia vem do primeiro disparo,
 * que espera até o próximo minuto zero.
 *
 * **Idempotência no banco, não na memória.** `energy_scores` tem única em
 * `(usuário, hora)` e o serviço faz upsert, então dois processos rodando o job
 * — dois contêineres, um redeploy no meio — convergem para a mesma linha em vez
 * de duplicar. Não é o mesmo que ter travas distribuídas, mas cobre o modo de
 * falha real desta fase.
 */

const HOUR_MS = 3_600_000;

/** Hora local em que a idade biológica é calculada. Uma vez por dia basta. */
const BIO_AGE_HOUR = 4;

/**
 * Só processa quem mandou leitura recentemente.
 *
 * Varrer a base inteira faria o job crescer com o número de CONTAS, não com o
 * de assinantes ativos — e gravaria score de gente que devolveu o aparelho, a
 * partir de uma leitura de meses atrás.
 */
async function activeUsers(): Promise<{ userId: string; tzOffsetMin: number }[]> {
  const rows = await prisma.$queryRaw<{ user_id: string; tz_offset_min: number }[]>`
    SELECT DISTINCT b.user_id, u.tz_offset_min
    FROM biometric_readings b
    JOIN users u ON u.id = b.user_id
    WHERE b.recorded_at > now() - INTERVAL '36 hours'
  `;
  return rows.map((r) => ({ userId: r.user_id, tzOffsetMin: r.tz_offset_min }));
}

export async function runScoringPass(now = new Date()): Promise<{ energy: number; bioAge: number }> {
  const users = await activeUsers();

  let energy = 0;
  let bioAge = 0;
  let ranBioAge = false;

  // Em série, de propósito: o serviço Python é um processo só, e disparar
  // centenas de chamadas simultâneas transformaria um job de fundo na causa da
  // lentidão da tela inicial de quem está usando o app naquele momento.
  for (const { userId, tzOffsetMin } of users) {
    // A hora é de CADA pessoa. Uma hora só para a passagem inteira faria quem
    // está em Lisboa receber a curva de Brasília — e é exatamente o que a
    // constante de fuso fazia antes.
    const hour = localHour(tzOffsetMin, now);
    const doBioAge = hour === BIO_AGE_HOUR;
    if (doBioAge) ranBioAge = true;

    try {
      if (await energyNow(userId, { hour })) energy++;
      if (doBioAge && (await bioAgeNow(userId))) bioAge++;
    } catch (err) {
      // Uma conta com dado estranho não pode interromper as outras. O erro
      // passa pelo sanitizador porque um erro de axios carrega o corpo da
      // requisição — que aqui É a leitura biométrica da pessoa identificada.
      logError(`scoring:${userId}`, err);
    }
  }

  // A poda acompanha a passagem que calculou idade biológica de alguém — uma
  // vez por dia é suficiente, e não vale uma varredura por hora.
  if (ranBioAge) {
    const removed = await pruneRefreshTokens().catch((err: unknown) => {
      logError('scoring:prune', err);
      return 0;
    });
    if (removed) console.log(`[scoring] ${removed} refresh tokens expirados removidos`);
  }

  return { energy, bioAge };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startScoringJob(): void {
  if (timer) return;

  const tick = () => {
    // Trava de sobreposição. A passagem é serial e cresce com o número de
    // assinantes: passando de uma hora, o disparo seguinte entraria em cima do
    // anterior, dobrando a carga sobre o serviço de modelo justamente quando ele
    // já está lento — e cada nova sobreposição pioraria a anterior.
    if (running) {
      console.warn('[scoring] passagem anterior ainda rodando, pulando este disparo');
      return;
    }
    running = true;

    void runScoringPass()
      .then(({ energy, bioAge }) => {
        if (energy || bioAge) console.log(`[scoring] ${energy} energia, ${bioAge} idade biológica`);
      })
      .catch((err: unknown) => logError('scoring', err))
      .finally(() => {
        running = false;
      });
  };

  // Alinha na hora cheia: o primeiro disparo espera o que falta, os seguintes
  // vão de hora em hora. Sem isso, reiniciar o servidor às 14h58 deslocaria
  // todas as amostras seguintes para 58 minutos depois da hora.
  const now = new Date();
  const msToNextHour = HOUR_MS - (now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds());

  setTimeout(() => {
    tick();
    timer = setInterval(tick, HOUR_MS);
    // Um timer de fundo não deve segurar o processo vivo no encerramento.
    timer.unref?.();
  }, msToNextHour).unref?.();
}

export function stopScoringJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
