import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  MAX_TEXT_SEARCH_IDS,
  QuestionTextSearchRepository,
  TEXT_SEARCH_COLUMNS,
  buildContainsPattern,
  buildTextSearchSql,
  escapeLikePattern,
} from './question-text-search.repository';

/** O `Prisma.Sql` guarda o texto já remontado com os parâmetros separados;
 * inspecionamos `strings`/`values` para garantir que nada do usuário foi
 * concatenado no SQL. */
function inspecionar(sql: Prisma.Sql) {
  return {
    texto: sql.text,
    valores: sql.values.map((value) =>
      Array.isArray(value) ? `[${value.join(',')}]` : String(value),
    ),
  };
}

describe('escapeLikePattern', () => {
  it('escapa os curingas do LIKE para o termo valer como texto literal', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c\\d')).toBe('c\\\\d');
  });

  it('deixa intacto o texto sem curinga', () => {
    expect(escapeLikePattern('funções exponenciais')).toBe('funções exponenciais');
  });
});

describe('buildContainsPattern', () => {
  it('monta o padrão de contém e remove espaços das pontas', () => {
    expect(buildContainsPattern('  matematica  ')).toBe('%matematica%');
  });

  it('escapa curingas dentro do padrão', () => {
    expect(buildContainsPattern('50% off_')).toBe('%50\\% off\\_%');
  });
});

describe('buildTextSearchSql', () => {
  it('usa unaccent em todas as colunas de texto pesquisáveis', () => {
    const { texto } = inspecionar(buildTextSearchSql(['ws-1'], '%termo%'));

    for (const column of TEXT_SEARCH_COLUMNS) {
      expect(texto).toContain(`unaccent("${column}")`);
    }
    // o padrão também passa por unaccent: "funcoes" acha "Funções" e
    // "funções" também continua achando
    expect(texto).toContain('ILIKE unaccent(');
    expect(texto).toContain('"workspace_id" IN (');
  });

  it('mantém workspaces e termo como parâmetros ligados (nada concatenado)', () => {
    const termo = `%${escapeLikePattern("'; DROP TABLE questions; --")}%`;
    const { texto, valores } = inspecionar(buildTextSearchSql(['ws-1', 'ws-2'], termo));

    expect(texto).not.toContain('DROP TABLE');
    expect(texto).not.toContain('ws-1');
    // cada workspace vira um parâmetro ligado; o termo entra uma vez por
    // coluna pesquisável; o teto vai por último
    expect(valores).toEqual([
      'ws-1',
      'ws-2',
      termo,
      termo,
      termo,
      termo,
      String(MAX_TEXT_SEARCH_IDS),
    ]);
  });

  it('aplica o teto de ids devolvidos, mantendo os mais recentes', () => {
    const { texto, valores } = inspecionar(buildTextSearchSql(['ws-1'], '%a%'));
    expect(texto).toContain('ORDER BY "created_at" DESC');
    expect(texto).toContain('LIMIT');
    expect(valores).toContain(String(MAX_TEXT_SEARCH_IDS));
  });
});

describe('QuestionTextSearchRepository', () => {
  type FakeDb = {
    $queryRaw: ReturnType<typeof vi.fn>;
    question: { findMany: ReturnType<typeof vi.fn> };
  };

  function makeDb(overrides: Record<string, unknown> = {}): FakeDb {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'q-1' }, { id: 'q-2' }]),
      question: { findMany: vi.fn().mockResolvedValue([{ id: 'q-9' }]) },
      ...overrides,
    } as unknown as FakeDb;
  }

  it('devolve os ids vindos do SQL cru', async () => {
    const db = makeDb();
    const repository = new QuestionTextSearchRepository(db as never);

    await expect(repository.findIdsMatching('funcoes', ['ws-1'])).resolves.toEqual([
      'q-1',
      'q-2',
    ]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.question.findMany).not.toHaveBeenCalled();
  });

  it('não consulta o banco para termo vazio ou sem workspaces', async () => {
    const db = makeDb();
    const repository = new QuestionTextSearchRepository(db as never);

    await expect(repository.findIdsMatching('   ', ['ws-1'])).resolves.toEqual([]);
    await expect(repository.findIdsMatching('termo', [])).resolves.toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('cai no contains do Prisma quando a extensão unaccent não existe no banco', async () => {
    const db = makeDb({
      $queryRaw: vi.fn().mockRejectedValue(Object.assign(new Error('no function unaccent'), { code: '42883' })),
    });
    const repository = new QuestionTextSearchRepository(db as never);

    await expect(repository.findIdsMatching('funcoes', ['ws-1'])).resolves.toEqual(['q-9']);

    const [call] = db.question.findMany.mock.calls[0];
    expect(call.where.workspaceId).toEqual({ in: ['ws-1'] });
    expect(call.where.OR).toHaveLength(TEXT_SEARCH_COLUMNS.length);
    expect(call.select).toEqual({ id: true });
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
    expect(call.take).toBe(MAX_TEXT_SEARCH_IDS);
  });

  it('propaga erros que não têm relação com a extensão ausente', async () => {
    const db = makeDb({
      $queryRaw: vi.fn().mockRejectedValue(Object.assign(new Error('conexão perdida'), { code: 'P1001' })),
    });
    const repository = new QuestionTextSearchRepository(db as never);

    await expect(repository.findIdsMatching('funcoes', ['ws-1'])).rejects.toThrow('conexão perdida');
    expect(db.question.findMany).not.toHaveBeenCalled();
  });
});
