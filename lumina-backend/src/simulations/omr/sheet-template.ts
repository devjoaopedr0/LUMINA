import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildSheetLayout, isSheetLayout } from './sheet-layout';

type Db = PrismaService | Prisma.TransactionClient;

/** Cria (ou atualiza para o layout v2) o cartão-resposta de um simulado. */
export async function upsertSheetTemplate(db: Db, simulation: { id: string; title: string; items: { position: number; alternatives: unknown }[] }) {
  const items = [...simulation.items].sort((a, b) => a.position - b.position);
  const layout = buildSheetLayout(items.map((item) => (Array.isArray(item.alternatives) ? item.alternatives.length : 5)));
  const data = {
    name: `Cartão-resposta — ${simulation.title}`.slice(0, 120),
    description: `Cartão-resposta do simulado "${simulation.title}" (${items.length} questões).`,
    markersJson: layout.fiducials as unknown as Prisma.InputJsonValue,
    layoutJson: layout as unknown as Prisma.InputJsonValue,
    expectedWidth: null,
    expectedHeight: null,
  };
  const existing = await db.answerSheetTemplate.findUnique({ where: { simulationId: simulation.id } });
  if (existing && isSheetLayout(existing.layoutJson) && existing.layoutJson.questions.length === items.length) return { template: existing, layout: existing.layoutJson };
  const template = existing
    ? await db.answerSheetTemplate.update({ where: { id: existing.id }, data })
    : await db.answerSheetTemplate.create({ data: { ...data, simulationId: simulation.id } });
  return { template, layout };
}

