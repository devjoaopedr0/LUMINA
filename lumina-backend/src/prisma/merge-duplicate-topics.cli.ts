import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { mergeDuplicateTopics } from './merge-duplicate-topics';

/**
 * Roda só a fusão de tópicos duplicados, sem o resto do seed:
 *   npx tsx src/prisma/merge-duplicate-topics.cli.ts
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const report = await mergeDuplicateTopics(prisma);
    console.log(
      `Tópicos fundidos: ${report.merged} (${report.questionsMoved} questões, ${report.masteriesMoved} domínios e ${report.tasksMoved} tarefas movidos).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
