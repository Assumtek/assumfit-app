/**
 * Semeia o catálogo de exercícios a partir de `prisma/data/exercises.json`.
 *
 * Separado do `prisma/seed.ts` de propósito. Aquele cria contas com senha
 * pública e por isso se recusa a rodar em produção; este é o oposto — o
 * catálogo é o universo de prescrição do agente, e SEM ele a geração de treino
 * não funciona em lugar nenhum, produção inclusive.
 *
 * Idempotente por `upsert` no id: rodar duas vezes não duplica nada, e um
 * exercício retirado do arquivo é DESATIVADO em vez de apagado — apagar
 * quebraria a FK de um treino já prescrito para alguém.
 *
 * Uso: `npm run seed:exercises`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PrismaClient,
  type ExerciseType,
  type ExperienceLevel,
  type MuscleGroup,
} from '@prisma/client';

const prisma = new PrismaClient();

type CatalogRow = {
  id: string;
  name: string;
  description: string | null;
  muscleGroup: MuscleGroup;
  equipment: string;
  level: ExperienceLevel;
  type: ExerciseType;
};

async function main() {
  const path = join(__dirname, 'data', 'exercises.json');
  const rows = JSON.parse(readFileSync(path, 'utf8')) as CatalogRow[];
  /*
 Vídeos demonstrativos — `prisma/data/exercise-videos.json`, gerado a partir do
 catálogo do MUVX (mesmos ids). Arquivo ausente não é erro: é catálogo sem vídeo.
 */
const videos = new Map<string, { videoUrl: string; thumbnailUrl: string | null }>();
try {
  const lido = JSON.parse(readFileSync(join(__dirname, 'data', 'exercise-videos.json'), 'utf8')) as {
    videos: { id: string; videoUrl: string; thumbnailUrl: string | null }[];
  };
  for (const v of lido.videos) videos.set(v.id, { videoUrl: v.videoUrl, thumbnailUrl: v.thumbnailUrl });
} catch {
  // sem arquivo, sem vídeo
}

  if (rows.length === 0) {
    throw new Error(`catálogo vazio em ${path} — abortando antes de desativar tudo`);
  }

  for (const row of rows) {
    const data = {
      name: row.name,
      description: row.description,
      muscleGroup: row.muscleGroup,
      equipment: row.equipment,
      level: row.level,
      type: row.type,
      active: true,
    };
    // Vídeo do MUVX, quando há. `null` explícito no update: exercício que
    // perdeu o vídeo no catálogo de origem perde aqui também.
    const video = videos.get(row.id) ?? null;
    const comVideo = { ...data, videoUrl: video?.videoUrl ?? null, thumbnailUrl: video?.thumbnailUrl ?? null };
    await prisma.exercise.upsert({
      where: { id: row.id },
      create: { id: row.id, ...comVideo },
      update: comVideo,
    });
  }

  // Quem saiu do arquivo sai do universo de prescrição, mas continua existindo
  // para os treinos que já o referenciam.
  const retired = await prisma.exercise.updateMany({
    where: { id: { notIn: rows.map((r) => r.id) }, active: true },
    data: { active: false },
  });

  const byGroup = await prisma.exercise.groupBy({
    by: ['muscleGroup'],
    where: { active: true },
    _count: true,
  });

  console.log(`catálogo: ${rows.length} exercícios ativos, ${retired.count} desativados`);
  console.log(`  com vídeo: ${[...videos.keys()].filter((id) => rows.some((r) => r.id === id)).length}`);
  for (const g of byGroup.sort((a, b) => b._count - a._count)) {
    console.log(`  ${g.muscleGroup.padEnd(16)} ${g._count}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
