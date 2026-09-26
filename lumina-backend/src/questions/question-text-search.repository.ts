import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Colunas varridas pela busca textual de questões: o usuário pesquisa por
 * conteúdo e, junto, os eixos já classificados (assunto, disciplina e
 * prova) — o mesmo conjunto usado pela busca web (item 10). */
export const TEXT_SEARCH_COLUMNS = ['stem', 'topic', 'subject', 'exam'] as const;

/** Teto de ids devolvidos pela busca textual. Existe para dar teto de custo
 * ao `IN (...)` que alimenta a listagem paginada: o filtro textual vira um
 * pré-filtro de ids e a paginação/ordenação/`total` continuam no Prisma.
 * Acima deste teto a busca degrada para os candidatos mais recentes — nunca
 * estoura memória nem derruba a listagem. */
export const MAX_TEXT_SEARCH_IDS = 2000;

/** Escapa os curingas do LIKE para que o usuário possa pesquisar textos com
 * `%`, `_` ou `\` sem alterar o casamento. O Postgres usa a barra como
 * caractere de escape padrão do LIKE/ILIKE. */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

/** Monta o padrão ILIKE de "contém" para o termo informado. */
export function buildContainsPattern(term: string): string {
  return `%${escapeLikePattern(term.trim())}%`;
}

/** Monta o SQL parametrizado da busca textual sem acento.
 *
 * O `unaccent()` remove os diacríticos dos DOIS lados do LIKE: das colunas
 * (`unaccent("stem")`) e do padrão procurado (`unaccent($1)`). Sem isso o
 * usuário teria que acertar a acentuação do enunciado — digitar "funcoes"
 * não acharia "Funções", e digitar "funções" deixaria de achar. Devolvemos só
 * os ids: quem decide paginação, ordenação, `total` e estatísticas é a
 * listagem normal, via Prisma, sem SQL cru. O teto vem ordenado por data de
 * criação para que, quando estourar, sobrem as questões mais recentes. O
 * termo entra SEMPRE como parâmetro ligado (`Prisma.sql` + `Prisma.join`);
 * só os nomes das colunas, que são constantes deste arquivo, entram como
 * identificador.
 */
export function buildTextSearchSql(workspaceIds: string[], pattern: string): Prisma.Sql {
  const predicates = TEXT_SEARCH_COLUMNS.map((column) =>
    Prisma.sql`${Prisma.raw(`unaccent("${column}")`)} ILIKE unaccent(${pattern})`,
  );

  return Prisma.sql`
    SELECT "id"
    FROM "questions"
    WHERE "workspace_id" IN (${Prisma.join(workspaceIds)})
      AND (${Prisma.join(predicates, ' OR ')})
    ORDER BY "created_at" DESC
    LIMIT ${MAX_TEXT_SEARCH_IDS}
  `;
}

/** Códigos do Postgres que significam "a função/extensão não existe aqui":
 * 42883 = undefined_function, 42P01 = undefined_table, 42704 = undefined_object. */
const MISSING_UNACCENT_CODES = new Set(['42883', '42P01', '42704']);

function isMissingUnaccent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && MISSING_UNACCENT_CODES.has(code);
}

/**
 * Busca textual de questões insensível a acentos e a maiúsculas.
 *
 * Estratégia em duas etapas: este método resolve os ids que casam com o termo
 * (com `unaccent`, no banco) e a listagem segue com `id IN (...)` no Prisma.
 * Se o banco não tiver a extensão `unaccent` (ambiente sem a migration),
 * caímos no `contains` tradicional em vez de derrubar a busca com 500.
 */
@Injectable()
export class QuestionTextSearchRepository {
  private readonly logger = new Logger(QuestionTextSearchRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findIdsMatching(
    term: string,
    workspaceIds: string[],
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const trimmed = term.trim();
    if (trimmed.length === 0 || workspaceIds.length === 0) {
      return [];
    }

    try {
      const rows = await db.$queryRaw<{ id: string }[]>(
        buildTextSearchSql(workspaceIds, buildContainsPattern(trimmed)),
      );
      return rows.map((row) => row.id);
    } catch (error) {
      if (!isMissingUnaccent(error)) {
        throw error;
      }
      this.logger.warn(
        'Extensão unaccent indisponível no banco; usando busca textual sensível ' +
          'a acento. Aplique a migration que cria a extensão unaccent.',
      );
      return this.fallbackIdsMatching(trimmed, workspaceIds, db);
    }
  }

  /** Fallback com `contains` do Prisma: comportamento antigo (sensível a
   * acento), porém sem acento correto e nunca derrubando a listagem. */
  private async fallbackIdsMatching(
    term: string,
    workspaceIds: string[],
    db: PrismaService | Prisma.TransactionClient,
  ): Promise<string[]> {
    const rows = await db.question.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        OR: TEXT_SEARCH_COLUMNS.map((column) => ({
          [column]: { contains: term, mode: 'insensitive' as const },
        })),
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_TEXT_SEARCH_IDS,
    });
    return rows.map((row) => row.id);
  }
}
