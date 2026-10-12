import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedCurriculumTopics } from './seed-curriculum-topics';

/**
 * Cria só os tópicos do currículo que faltam, sem rodar o resto do seed:
 *   npx tsx src/prisma/seed-curriculum-topics.cli.ts
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    console.log(`Tópicos do currículo criados: ${await seedCurriculumTopics(prisma)}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
