/**
 * Seed com cinco perfis fisiológicos distintos e 30 dias de leitura.
 *
 * Existe para provar a tese do produto sem hardware: com estes dados dá para
 * verificar se o cronótipo detectado bate com o perfil que gerou a série, se o
 * baseline de HRV converge, e se a idade biológica separa quem está bem de quem
 * não está. Um gerador uniforme não serviria — produziria dados que nenhum
 * corpo produz, e o modelo passaria em teste que não significa nada.
 *
 * Uso: `npm run seed`
 */
import { PrismaClient, type Sex } from '@prisma/client';
import argon2 from 'argon2';

/**
 * O seed NUNCA roda em produção.
 *
 * Ele cria contas com senha conhecida e escrita neste repositório. Um
 * `npm run seed` disparado por engano contra o banco de produção — um terminal
 * na aba errada basta — abriria cinco contas de credencial pública sobre dado
 * real de assinante.
 */
if (process.env.NODE_ENV === "production") {
  throw new Error("prisma/seed.ts não pode rodar em produção: cria contas com senha conhecida.");
}

const prisma = new PrismaClient();

type Profile = {
  email: string;
  name: string;
  sex: Sex;
  birthYear: number;
  /** HRV médio de repouso, em ms. */
  hrvBase: number;
  restingHr: number;
  spo2: number;
  /** Hora de dormir em horas decimais — é o que define o cronótipo. */
  sleepOnset: number;
  sleepHours: number;
  deepPct: number;
  stepsPerDay: number;
};

const PROFILES: Profile[] = [
  {
    email: 'matutino@teste.local',
    name: 'Perfil matutino',
    sex: 'm',
    birthYear: 1988,
    hrvBase: 62,
    restingHr: 56,
    spo2: 97.5,
    sleepOnset: 21.5,
    sleepHours: 7.5,
    deepPct: 0.24,
    stepsPerDay: 9500,
  },
  {
    email: 'vespertino@teste.local',
    name: 'Perfil vespertino',
    sex: 'f',
    birthYear: 1995,
    hrvBase: 58,
    restingHr: 64,
    spo2: 97,
    // Ponto médio às 6h — inequivocamente vespertino. A versão anterior
    // (1h30–8h30) dava midsleep exatamente 5,0, em cima do limiar, e era
    // classificada como intermediária: perfil de teste ambíguo não valida nada.
    sleepOnset: 2.0,
    sleepHours: 8,
    deepPct: 0.19,
    stepsPerDay: 7000,
  },
  {
    email: 'sono-ruim@teste.local',
    name: 'Perfil com sono fragmentado',
    sex: 'f',
    birthYear: 1985,
    hrvBase: 34,
    restingHr: 74,
    spo2: 95.5,
    sleepOnset: 0.5,
    sleepHours: 5.2,
    deepPct: 0.09,
    stepsPerDay: 4200,
  },
  {
    email: 'atleta@teste.local',
    name: 'Perfil atleta',
    sex: 'm',
    birthYear: 1997,
    hrvBase: 96,
    restingHr: 44,
    spo2: 98.5,
    sleepOnset: 22.5,
    sleepHours: 8.5,
    deepPct: 0.28,
    stepsPerDay: 14000,
  },
  {
    email: 'sedentario@teste.local',
    name: 'Perfil sedentário',
    sex: 'm',
    birthYear: 1972,
    hrvBase: 26,
    restingHr: 79,
    spo2: 95,
    sleepOnset: 23.5,
    sleepHours: 6.3,
    deepPct: 0.11,
    stepsPerDay: 2800,
  },
];

const DAYS = 30;
/** Leitura a cada 5 minutos, como o wearable entrega. */
const INTERVAL_MIN = 5;

/** Ruído gaussiano leve — o sensor não devolve valor constante. */
function jitter(scale: number): number {
  const u = Math.random() || 1e-9;
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * scale;
}

/**
 * HRV segue o ciclo circadiano: mais alto durante o sono, cai ao acordar,
 * mínimo no meio da tarde. Sem essa modulação, o detector de cronótipo não
 * teria sinal nenhum para achar.
 */
function hrvAtHour(profile: Profile, hour: number): number {
  const asleep = isAsleep(profile, hour);
  const circadian = asleep ? 1.25 : 0.85 + 0.2 * Math.cos(((hour - 6) / 24) * 2 * Math.PI);
  return Math.max(8, profile.hrvBase * circadian + jitter(3));
}

function isAsleep(profile: Profile, hour: number): boolean {
  const start = profile.sleepOnset;
  const end = (start + profile.sleepHours) % 24;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function hrAtHour(profile: Profile, hour: number): number {
  const asleep = isAsleep(profile, hour);
  const active = !asleep && hour >= 7 && hour <= 21;
  const base = asleep ? profile.restingHr - 6 : active ? profile.restingHr + 12 : profile.restingHr;
  return Math.max(35, Math.round(base + jitter(4)));
}

function tempAtHour(hour: number): number {
  // Vale de madrugada, pico entre 12h e 14h.
  return 36.4 + 0.5 * Math.sin(((hour - 4) / 24) * 2 * Math.PI) + jitter(0.08);
}

async function seedProfile(profile: Profile) {
  const user = await prisma.user.upsert({
    where: { email: profile.email },
    update: {},
    create: {
      email: profile.email,
      passwordHash: await argon2.hash('senha-de-teste-forte'),
      name: profile.name,
      birthDate: new Date(`${profile.birthYear}-06-15`),
      sex: profile.sex,
      consents: {
        create: [
          { purpose: 'biometric_processing', version: '2026-07-v1' },
          { purpose: 'international_transfer', version: '2026-07-v1' },
        ],
      },
      subscriptions: { create: { status: 'active', hardwareCostCents: 12000, priceCents: 4900 } },
      devices: {
        create: { serialNumber: `SEED-${profile.email.split('@')[0].toUpperCase()}`, status: 'in_use', batteryPct: 87 },
      },
    },
  });

  const readings: {
    userId: string;
    recordedAt: Date;
    hrvMs: number;
    heartRate: number;
    spo2Pct: number;
    temperature: number;
    steps: number;
    stressScore: number;
    respRate: number;
    source: string;
  }[] = [];

  const now = new Date();
  for (let day = DAYS - 1; day >= 0; day--) {
    let stepsToday = 0;
    for (let minute = 0; minute < 24 * 60; minute += INTERVAL_MIN) {
      const at = new Date(now.getTime() - day * 86400000);
      at.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      if (at > now) continue;

      const hour = at.getHours();
      const asleep = isAsleep(profile, hour);
      if (!asleep && hour >= 7) {
        stepsToday += Math.round((profile.stepsPerDay / (14 * (60 / INTERVAL_MIN))) * (0.5 + Math.random()));
      }

      const hrv = hrvAtHour(profile, hour);
      readings.push({
        userId: user.id,
        recordedAt: at,
        hrvMs: Number(hrv.toFixed(1)),
        heartRate: hrAtHour(profile, hour),
        spo2Pct: Number(Math.min(100, profile.spo2 + jitter(0.5)).toFixed(1)),
        temperature: Number(tempAtHour(hour).toFixed(2)),
        steps: stepsToday,
        // Stress é o inverso do HRV relativo à base da própria pessoa.
        stressScore: Number(Math.max(5, Math.min(95, 100 - (hrv / profile.hrvBase) * 55)).toFixed(1)),
        respRate: Number((asleep ? 12 + jitter(1) : 15 + jitter(2)).toFixed(1)),
        source: 'mock',
      });
    }
  }

  // createMany em blocos: 8.640 linhas por perfil num INSERT só estoura o
  // limite de parâmetros do Postgres.
  const CHUNK = 2000;
  for (let i = 0; i < readings.length; i += CHUNK) {
    await prisma.biometricReading.createMany({ data: readings.slice(i, i + CHUNK), skipDuplicates: true });
  }

  console.log(`${profile.name}: ${readings.length} leituras`);
}

async function main() {
  console.log(`Semeando ${PROFILES.length} perfis com ${DAYS} dias cada…`);
  for (const profile of PROFILES) {
    await seedProfile(profile);
  }
  const total = await prisma.biometricReading.count();
  console.log(`Total no banco: ${total} leituras`);
  console.log('Senha de todos os perfis: senha-de-teste-forte');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
