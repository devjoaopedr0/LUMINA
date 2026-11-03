import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildSheetLayout, defaultSheetOptions, isSheetLayout, SheetLayout, SheetOptions } from './sheet-layout';

type Db = PrismaService | Prisma.TransactionClient;

interface SheetSimulation {
  id: string;
  title: string;
  enemDay?: number | null;
  items: { position: number; alternatives: unknown }[];
}

const sameOptions = (a: SheetOptions | undefined, b: SheetOptions) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cria (ou atualiza) o cartão-resposta de um simulado.
 *
 * - Sem `options`: mantém o cartão que já existe — inclusive os antigos, sem
 *   cabeçalho configurável —, porque folhas já impressas são lidas com ele.
 *   Um cartão antigo só é refeito no layout novo se nenhuma folha dele foi
 *   gerada ainda.
 * - Com `options` (o gestor salvou): refaz o layout. Quem chama confere antes
 *   que nenhuma folha foi lida com o layout anterior.
 */
export async function upsertSheetTemplate(db: Db, simulation: SheetSimulation, options?: SheetOptions): Promise<{ template: { id: string }; layout: SheetLayout }> {
  const items = [...simulation.items].sort((a, b) => a.position - b.position);
  const existing = await db.answerSheetTemplate.findUnique({ where: { simulationId: simulation.id } });
  const existingLayout = existing && isSheetLayout(existing.layoutJson) ? existing.layoutJson : null;
  const sameCount = existingLayout?.questions.length === items.length;

  if (existing && existingLayout && sameCount) {
    if (options ? sameOptions(existingLayout.options, options) : existingLayout.options) return { template: existing, layout: existingLayout };
    if (!options && (await db.answerSheetCode.count({ where: { templateId: existing.id } })) > 0) return { template: existing, layout: existingLayout };
  }

  const chosen = options ?? existingLayout?.options ?? defaultSheetOptions({ enemDay: simulation.enemDay });
  const layout = buildSheetLayout(items.map((item) => (Array.isArray(item.alternatives) ? item.alternatives.length : 5)), chosen);
  const data = {
    name: `Cartão-resposta — ${simulation.title}`.slice(0, 120),
    description: `Cartão-resposta do simulado "${simulation.title}" (${items.length} questões).`,
    markersJson: layout.fiducials as unknown as Prisma.InputJsonValue,
    layoutJson: layout as unknown as Prisma.InputJsonValue,
    expectedWidth: null,
    expectedHeight: null,
  };
  if (existing) return { template: await db.answerSheetTemplate.update({ where: { id: existing.id }, data }), layout };
  try {
    return { template: await db.answerSheetTemplate.create({ data: { ...data, simulationId: simulation.id } }), layout };
  } catch (error) {
    // Duas requisições ao mesmo tempo (aba aberta duas vezes, React em modo
    // dev): a outra criou primeiro — vale a dela.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    const winner = await db.answerSheetTemplate.findUniqueOrThrow({ where: { simulationId: simulation.id } });
    return { template: winner, layout: winner.layoutJson as unknown as SheetLayout };
  }
}
