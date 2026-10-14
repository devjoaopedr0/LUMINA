import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { importSisuCutoffs } from './import-sisu-cutoffs';

/**
 * Carrega as notas de corte do Sisu sem rodar o resto do seed:
 *   npx tsx src/prisma/import-sisu-cutoffs.cli.ts
 *
 * Para acrescentar uma edição nova, gere o arquivo de novo com
 * scripts/sisu_xlsx_to_csv.py e rode este comando.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const report = await importSisuCutoffs(prisma);
    console.log(`Notas de corte do Sisu: ${report.rows} cursos/ano das edições ${report.years.join(', ')}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
