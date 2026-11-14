/**
 * Publica o acervo inicial dos cadernos (platform-content.ts).
 *
 *   npm run build && npm run notebooks:seed-platform
 *
 * Idempotente: um item com o mesmo nome/título no acervo é atualizado, não
 * duplicado. Os itens ficam em nome do primeiro usuário ADMIN (ou de
 * SEED_ADMIN_EMAIL, se informado). Use --dry-run para só conferir.
 */
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PLATFORM_FORMULAS, PLATFORM_REPERTOIRES } from './platform-content';

async function main() {
  try {
    process.loadEnvFile(join(__dirname, '..', '..', '.env'));
  } catch {
    // Sem .env, as variáveis vêm do ambiente.
  }
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaService({ get: (key: string) => process.env[key] } as unknown as ConfigService);
  await prisma.$connect();
  try {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    const admin = await prisma.user.findFirst({
      where: email ? { email } : { accountType: AccountType.ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, accountType: true },
    });
    if (!admin || admin.accountType !== AccountType.ADMIN) throw new Error('Nenhum usuário ADMIN encontrado para ser o dono do acervo.');

    let created = 0;
    let updated = 0;
    for (const formula of PLATFORM_FORMULAS) {
      const existing = await prisma.formula.findFirst({ where: { isPlatform: true, name: formula.name }, select: { id: true } });
      const data = { name: formula.name, discipline: formula.discipline ?? 'MATEMATICA', topic: formula.topic ?? null, latex: formula.latex, variables: formula.variables ?? null, whenToUse: formula.whenToUse ?? null, example: formula.example ?? null };
      if (dryRun) { existing ? updated++ : created++; continue; }
      if (existing) { await prisma.formula.update({ where: { id: existing.id }, data }); updated++; }
      else { await prisma.formula.create({ data: { ...data, userId: admin.id, isPlatform: true } }); created++; }
    }
    for (const rep of PLATFORM_REPERTOIRES) {
      const existing = await prisma.repertoire.findFirst({ where: { isPlatform: true, title: rep.title }, select: { id: true } });
      const data = {
        title: rep.title, summary: rep.summary, category: rep.category ?? 'OUTRA', author: rep.author ?? null, referenceType: rep.referenceType ?? 'OUTRO',
        source: rep.source ?? null, year: rep.year ?? null, theme: rep.theme ?? 'OUTRO', keywords: (rep.keywords ?? []).map((k) => k.toLowerCase()),
        relatedThemes: rep.relatedThemes ?? [], context: rep.context ?? null, importance: rep.importance ?? null, essayUse: rep.essayUse ?? null, example: rep.example ?? null,
      };
      if (dryRun) { existing ? updated++ : created++; continue; }
      if (existing) { await prisma.repertoire.update({ where: { id: existing.id }, data }); updated++; }
      else { await prisma.repertoire.create({ data: { ...data, userId: admin.id, isPlatform: true } }); created++; }
    }
    console.log(`${dryRun ? '[simulação] ' : ''}Acervo: ${PLATFORM_FORMULAS.length} fórmulas e ${PLATFORM_REPERTOIRES.length} repertórios · ${created} novos · ${updated} atualizados · dono: ${admin.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
