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
    await prisma.exercise.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
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
