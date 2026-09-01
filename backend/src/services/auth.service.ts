import argon2 from 'argon2';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { env } from '../lib/env';
import { conflict, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { apagarImagens, listarImagensDaConta, presignImageRead } from './media.service';
import { revokeUser } from '../lib/redis';

export type TokenPair = { accessToken: string; refreshToken: string };

type Registration = {
  email: string;
  password: string;
  name: string;
  birthDate: string;
  sex: 'f' | 'm';
  /** Versão do termo de consentimento aceito no onboarding. */
  consentVersion: string;
};

/**
 * O refresh token vai para o banco como hash. Se o banco vazar, os tokens não
 * são reutilizáveis — mesma razão de nunca guardar senha em claro.
 */
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function issueTokens(userId: string): TokenPair {
  const accessToken = jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  return { accessToken, refreshToken };
}

/**
 * Dias de validade do refresh.
 *
 * `parseInt('30d')` devolvia 30 por acidente — o `d` é descartado. Funcionava e
 * ia continuar funcionando até alguém escrever `720h` querendo 30 dias e receber
 * 720. Sufixo explícito, e o padrão é o valor seguro.
 */
function refreshDays(): number {
  const raw = env.JWT_REFRESH_EXPIRES_IN.trim();
  const match = /^(\d+)([dhm])$/.exec(raw);
  if (!match) return 30;
  const value = Number(match[1]);
  if (match[2] === 'd') return value;
  if (match[2] === 'h') return value / 24;
  return value / (24 * 60);
}

async function persistRefresh(userId: string, refreshToken: string) {
  const days = refreshDays();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
  });
}

export async function register(input: Registration): Promise<TokenPair> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('E-mail já cadastrado', 'email_taken');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await argon2.hash(input.password),
      name: input.name,
      birthDate: new Date(input.birthDate),
      sex: input.sex,
      // Dado biométrico é sensível (LGPD Art. 11): sem consentimento
      // específico registrado, não existe base legal para tratar. Por isso o
      // consentimento nasce junto com o usuário, na mesma transação.
      consents: {
        create: [
          { purpose: 'biometric_processing', version: input.consentVersion },
          { purpose: 'international_transfer', version: input.consentVersion },
        ],
      },
    },
  });

  const tokens = issueTokens(user.id);
  await persistRefresh(user.id, tokens.refreshToken);
  return tokens;
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Verifica o hash mesmo sem usuário, para o tempo de resposta não revelar
  // quais e-mails existem.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const ok = await argon2.verify(hash, password).catch(() => false);
  if (!user || !ok || user.deletedAt) throw unauthorized('Credenciais inválidas');

  const tokens = issueTokens(user.id);
  await persistRefresh(user.id, tokens.refreshToken);
  return tokens;
}

/**
 * Rotaciona: o refresh usado é revogado e um novo par é emitido.
 *
 * **Reapresentar um token já revogado derruba TODAS as sessões da pessoa.** Sem
 * isso, a rotação dava uma falsa sensação de segurança: quem roubasse um refresh
 * e o usasse antes do dono ficava com um par novo e válido, enquanto o dono só
 * via um "sessão expirada" inexplicável e entrava de novo — sem nunca descobrir
 * que havia alguém junto. Um token revogado voltando é a única evidência que
 * temos de cópia, e a resposta certa é encerrar tudo e obrigar a reautenticar.
 */
export async function refresh(refreshToken: string): Promise<TokenPair> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!stored) throw unauthorized('Sessão expirada');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Sessão encerrada por segurança. Entre novamente.');
  }

  if (stored.expiresAt < new Date()) throw unauthorized('Sessão expirada');

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const tokens = issueTokens(stored.userId);
  await persistRefresh(stored.userId, tokens.refreshToken);
  return tokens;
}

/**
 * Remove tokens vencidos ou revogados há tempo suficiente.
 *
 * A tabela só crescia: cada login e cada rotação inseriam uma linha, e nada
 * apagava. Guardar os revogados por uma janela curta é de propósito — é ela que
 * permite detectar a reapresentação acima. Depois disso, a linha só ocupa
 * espaço e amplia o que vaza num incidente.
 */
export async function pruneRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return count;
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken
    .update({ where: { tokenHash: hashToken(refreshToken) }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Perfil completo para a tela de conta.
 *
 * A seleção é lista de PERMISSÃO, campo a campo. Omitir `passwordHash` com um
 * `omit` funcionaria hoje e falharia no dia em que alguém acrescentasse uma
 * coluna sensível ao modelo — o padrão precisa ser "não sai" e não "sai, exceto".
 */
export async function profile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      birthDate: true,
      sex: true,
      createdAt: true,
      avatarKey: true,
      consents: {
        where: { revokedAt: null },
        select: { purpose: true, version: true, grantedAt: true },
      },
      subscriptions: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { status: true, startedAt: true, currentPeriodEnd: true, priceCents: true },
      },
      devices: {
        orderBy: { lastSeenAt: 'desc' },
        take: 1,
        select: {
          serialNumber: true,
          model: true,
          status: true,
          batteryPct: true,
          lastSeenAt: true,
          shippedAt: true,
        },
      },
    },
  });

  if (!user) throw unauthorized('Conta não encontrada');

  const { subscriptions, devices, avatarKey, ...rest } = user;
  /*
   O perfil devolve a URL ASSINADA, não a chave: a tela quer desenhar o rosto,
   e uma chave crua no payload é um identificador a mais circulando por nada.
   Uma hora de validade; a tela de perfil não fica aberta mais que isso.
  */
  const avatarUrl = avatarKey
    ? await presignImageRead(userId, avatarKey).catch(() => null)
    : null;
  return {
    ...rest,
    avatarUrl,
    subscription: subscriptions[0] ?? null,
    device: devices[0] ?? null,
  };
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; birthDate?: string; sex?: 'f' | 'm'; avatarKey?: string | null },
) {
  /*
   Trocar a foto de perfil APAGA a anterior. Sem isso, cada troca deixaria um
   rosto a mais no bucket, sem nada que o referencie: guardar imagem que
   ninguém mais pode ver não é zelo, é passivo.
  */
  if (patch.avatarKey !== undefined) {
    const atual = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    if (atual?.avatarKey && atual.avatarKey !== patch.avatarKey) {
      await apagarImagens([atual.avatarKey]).catch(() => undefined);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.avatarKey !== undefined && { avatarKey: patch.avatarKey }),
      ...(patch.name !== undefined && { name: patch.name }),
      // `@db.Date` guarda só o dia, mas o Prisma exige um `Date` — a hora vai
      // zerada em UTC para o dia não escorregar para o anterior num fuso a oeste.
      ...(patch.birthDate !== undefined && { birthDate: new Date(`${patch.birthDate}T00:00:00Z`) }),
      ...(patch.sex !== undefined && { sex: patch.sex }),
    },
  });
  return profile(userId);
}

/**
 * Exportação completa dos dados da pessoa (LGPD Art. 18, incisos II e V).
 *
 * A lei dá dois direitos que o produto não atendia: acesso ao dado e
 * portabilidade. "Excluir conta" cobria só o direito de eliminação — quem
 * quisesse levar o próprio histórico para outro lugar, ou simplesmente ver o
 * que guardamos, não tinha caminho nenhum.
 *
 * Formato JSON e não CSV porque o dado é aninhado: leitura, score, hábito e
 * consentimento têm formas diferentes, e achatar tudo numa planilha perderia a
 * estrutura justamente na parte que interessa a quem for importar.
 *
 * A biometria vai LIMITADA a uma janela. Vinte e quatro meses de amostra a cada
 * cinco minutos são milhões de linhas — montar isso em memória derrubaria o
 * processo, e é por isso que a rota pagina por período em vez de prometer "tudo
 * de uma vez".
 */
export async function exportData(userId: string, since: Date, until: Date) {
  const [user, readings, energyScores, bioAgeScores, habits] = await Promise.all([
    profile(userId),
    prisma.biometricReading.findMany({
      where: { userId, recordedAt: { gte: since, lte: until } },
      orderBy: { recordedAt: 'asc' },
      select: {
        recordedAt: true,
        hrvMs: true,
        heartRate: true,
        spo2Pct: true,
        temperature: true,
        steps: true,
        bpSystolic: true,
        bpDiastolic: true,
        stressScore: true,
        respRate: true,
        source: true,
      },
    }),
    prisma.energyScore.findMany({
      where: { userId, hourStart: { gte: since, lte: until } },
      orderBy: { hourStart: 'asc' },
      select: { hourStart: true, score: true, calibrating: true },
    }),
    prisma.bioAgeScore.findMany({
      where: { userId, calculatedAt: { gte: since, lte: until } },
      orderBy: { calculatedAt: 'asc' },
      select: { calculatedAt: true, realAge: true, bioAge: true, delta: true },
    }),
    prisma.dailyHabit.findMany({
      where: { userId, date: { gte: since, lte: until } },
      orderBy: { date: 'asc' },
      select: { date: true, waterMl: true, sleepScore: true, mood: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    period: { from: since.toISOString(), to: until.toISOString() },
    profile: user,
    // Contagens no topo para quem abre o arquivo saber o que tem nas mãos antes
    // de rolar por dezenas de milhares de linhas.
    counts: {
      biometricReadings: readings.length,
      energyScores: energyScores.length,
      bioAgeScores: bioAgeScores.length,
      dailyHabits: habits.length,
    },
    biometricReadings: readings,
    energyScores,
    bioAgeScores,
    dailyHabits: habits,
  };
}

/**
 * Revogar consentimento e excluir conta apagam o dado de verdade. `deletedAt`
 * como flag não satisfaz o direito de eliminação da LGPD — o registro precisa
 * sair das tabelas.
 */
export async function deleteAccount(userId: string): Promise<void> {
  /*
   As IMAGENS saem primeiro, e por LISTAGEM do bucket, não pelas linhas do
   banco.

   O cascade apaga refeições, fotos de evolução e mensagens do chat, e com elas
   os ponteiros: depois disso não haveria mais como saber quais objetos eram
   desta pessoa, e eles ficariam no S3 para sempre. Listar pelo prefixo da
   conta pega inclusive o que foi subido e nunca associado a registro nenhum,
   quando a subida deu certo e a requisição seguinte falhou.

   Falha aqui NÃO impede a exclusão: o direito de eliminação (LGPD Art. 18) não
   pode ficar refém do S3 estar de pé. O que sobra é objeto órfão sob um
   prefixo de conta que não existe mais, e o log diz qual.
  */
  try {
    await apagarImagens(await listarImagensDaConta(userId));
  } catch (err) {
    console.error('[conta] imagens não apagadas, prefixo órfão:', userId, err);
  }

  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM biometric_readings WHERE user_id = ${userId}::uuid`,
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // O access token já emitido é autocontido e sobrevive à exclusão da conta por
  // até 15 minutos. Sem esta marca, um pedido de eliminação da LGPD deixava uma
  // janela em que a API ainda respondia com o token de uma conta inexistente.
  await revokeUser(userId);
}
