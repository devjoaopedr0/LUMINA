import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccountType, NotebookKind, PlanTier, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { notebookLimitsFor, NotebookLimits, TIER_LABELS } from '../plans/plan-limits';
import { PlanUsageService } from '../plans/plan-usage.service';
import {
  analyzeUsePrompt,
  applyPrompt,
  checkPrompt,
  connectionsPrompt,
  explainPrompt,
  FORMULA_SYSTEM,
  formulaPrompt,
  howToUsePrompt,
  parseApplication,
  parseCheck,
  parseSuggestions,
  parseUseAnalysis,
  PROMPT_VERSION,
  REPERTOIRE_SYSTEM,
  suggestPrompt,
} from './notebook-ai';
import {
  CollectionItemsDto,
  CreateCollectionDto,
  CreateFormulaDto,
  CreateRepertoireDto,
  FormulaAiDto,
  ListFormulasQueryDto,
  ListRepertoiresQueryDto,
  NotebookSort,
  RepertoireAiDto,
  UpdateCollectionDto,
  UpdateFormulaDto,
  UpdateRepertoireDto,
} from './notebooks.dto';

const MAX_KEYWORDS = 20;

/**
 * Modelos da LuminIA nos cadernos: AI_NOTEBOOK_MODELS ou, sem ela, a cadeia
 * da redação (AI_ESSAY_MODELS, Gemini primeiro). Avaliar repertório é
 * avaliar a competência 2; o modelo padrão do chat mediu pior em julgamento
 * (ver docs/GABARITO_INTELIGENTE.md). Vazio = cadeia padrão.
 */
export function notebookModels(env: Record<string, string | undefined> = process.env): string[] {
  const parse = (raw: string | undefined) => (raw ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const own = parse(env.AI_NOTEBOOK_MODELS);
  return own.length ? own : parse(env.AI_ESSAY_MODELS);
}
const MAX_THEMES = 15;

/** Normaliza as palavras-chave do repertório: minúsculas, sem espaço nas
 * pontas e sem repetição, para que achar o repertório na hora da redação não
 * dependa de como o aluno digitou ("Vigilância" e "vigilancia" colidem). */
function normalizeKeywords(keywords?: string[] | null): string[] {
  if (!keywords) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push(keyword);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** Temas relacionados: sem espaços nas pontas e sem repetição (sem mudar a grafia). */
function normalizeThemes(themes?: string[] | null): string[] {
  if (!themes) return [];
  const seen = new Set<string>();
  return themes
    .map((theme) => theme.trim())
    .filter((theme) => theme && !seen.has(theme.toLowerCase()) && seen.add(theme.toLowerCase()))
    .slice(0, MAX_THEMES);
}

/** Categoria fixa em maiúsculas; categoria própria mantém o nome digitado. */
function normalizeCategory(category?: string | null): string {
  const value = category?.trim();
  if (!value) return 'OUTRA';
  return /^[A-Z_]+$/.test(value) ? value : value.slice(0, 60);
}

function orderBy(sort: NotebookSort | undefined, alpha: 'name' | 'title') {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' as const }];
    case 'favorites':
      return [{ isFavorite: 'desc' as const }, { createdAt: 'desc' as const }];
    case 'az':
      return [{ [alpha]: 'asc' as const }];
    default:
      return [{ createdAt: 'desc' as const }];
  }
}

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** 429 do plano para os cadernos: mesmo formato (code PLAN_LIMIT) dos outros limites. */
export class NotebookLimitExceededException extends HttpException {
  constructor(tier: PlanTier, what: 'items' | 'collections', kind: NotebookKind, limit: number) {
    const notebook = kind === NotebookKind.FORMULA ? 'fórmulas' : 'repertórios';
    const message =
      what === 'items'
        ? `O plano ${TIER_LABELS[tier]} guarda até ${limit} ${notebook} no caderno. Com o Premium o caderno é ilimitado: veja em "Meu plano".`
        : `O plano ${TIER_LABELS[tier]} permite até ${limit} coleções no caderno de ${notebook}. Com o Premium elas são ilimitadas: veja em "Meu plano".`;
    super({ statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'PLAN_LIMIT', message, tier, limit }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const REPERTOIRE_INCLUDE = { collectionItems: { select: { collectionId: true } } } satisfies Prisma.RepertoireInclude;
const FORMULA_INCLUDE = { collectionItems: { select: { collectionId: true } } } satisfies Prisma.FormulaInclude;

type WithCollections<T> = T & { collectionItems?: { collectionId: string }[] };
function withCollectionIds<T extends object>(row: WithCollections<T>) {
  const { collectionItems, ...rest } = row;
  return { ...rest, collectionIds: (collectionItems ?? []).map((item) => item.collectionId) };
}

@Injectable()
export class NotebooksService {
  constructor(
    private readonly prisma: PrismaService,
    // Opcionais para os testes antigos montados à mão; no app vêm do PlansModule/AiModule.
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() private readonly planUsage?: PlanUsageService,
    @Optional() private readonly ai?: AiService,
  ) {}

  // ------------------------------------------------------------- comuns

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    return user?.accountType === AccountType.ADMIN;
  }

  private async limits(userId: string): Promise<{ tier: PlanTier; limits: NotebookLimits }> {
    if (!this.entitlements) return { tier: PlanTier.PREMIUM, limits: notebookLimitsFor(PlanTier.PREMIUM) };
    const { tier } = await this.entitlements.resolve(userId);
    return { tier, limits: notebookLimitsFor(tier) };
  }

  private async assertItemRoom(userId: string, kind: NotebookKind) {
    const { tier, limits } = await this.limits(userId);
    const where = { userId, isPlatform: false };
    const count = kind === NotebookKind.FORMULA ? await this.prisma.formula.count({ where }) : await this.prisma.repertoire.count({ where });
    if (count >= limits.items) throw new NotebookLimitExceededException(tier, 'items', kind, limits.items);
  }

  /** Só a administração publica no acervo da plataforma. */
  private async platformFlag(userId: string, requested?: boolean): Promise<boolean> {
    if (!requested) return false;
    if (!(await this.isAdmin(userId))) throw new ForbiddenException('Só a administração publica no acervo da plataforma.');
    return true;
  }

  private async ownCollection(userId: string, id: string, kind: NotebookKind) {
    const collection = await this.prisma.notebookCollection.findFirst({ where: { id, userId, kind } });
    if (!collection) throw new NotFoundException('Coleção não encontrada.');
    return collection;
  }

  private scope(userId: string, scope: 'mine' | 'platform' | 'all' | undefined) {
    if (scope === 'platform') return { isPlatform: true };
    if (scope === 'all') return { OR: [{ userId, isPlatform: false }, { isPlatform: true }] };
    return { userId, isPlatform: false };
  }

  // ------------------------------------------------------------- fórmulas

  async listFormulas(userId: string, query: ListFormulasQueryDto = {}) {
    if (query.collectionId) await this.ownCollection(userId, query.collectionId, NotebookKind.FORMULA);
    const q = query.q?.trim();
    const rows = await this.prisma.formula.findMany({
      where: {
        AND: [
          this.scope(userId, query.scope),
          q ? { OR: [{ name: contains(q) }, { topic: contains(q) }, { latex: contains(q) }, { description: contains(q) }, { whenToUse: contains(q) }] } : {},
          query.discipline ? { discipline: query.discipline } : {},
          query.favorite ? { isFavorite: true } : {},
          query.toMemorize ? { isMemorized: false } : {},
          query.collectionId ? { collectionItems: { some: { collectionId: query.collectionId } } } : {},
        ],
      },
      include: FORMULA_INCLUDE,
      orderBy: orderBy(query.sort, 'name'),
      take: 500,
    });
    return rows.map(withCollectionIds);
  }

  async formulaSummary(userId: string) {
    const where = { userId, isPlatform: false };
    const [total, favorites, memorized, disciplines, recent, platform, { tier, limits }] = await Promise.all([
      this.prisma.formula.count({ where }),
      this.prisma.formula.count({ where: { ...where, isFavorite: true } }),
      this.prisma.formula.count({ where: { ...where, isMemorized: true } }),
      this.prisma.formula.groupBy({ by: ['discipline'], where, _count: { _all: true } }),
      this.prisma.formula.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, discipline: true, createdAt: true } }),
      this.prisma.formula.count({ where: { isPlatform: true } }),
      this.limits(userId),
    ]);
    return {
      total,
      favorites,
      memorized,
      byDiscipline: disciplines.map((row) => ({ discipline: row.discipline, count: row._count._all })),
      recent,
      platformAvailable: platform,
      plan: { tier, itemLimit: limits.items, collectionLimit: limits.collections },
    };
  }

  async getFormula(userId: string, id: string) {
    return withCollectionIds(await this.findReadableFormula(userId, id));
  }

  async createFormula(userId: string, dto: CreateFormulaDto) {
    const isPlatform = await this.platformFlag(userId, dto.isPlatform);
    if (!isPlatform) await this.assertItemRoom(userId, NotebookKind.FORMULA);
    return this.prisma.formula.create({
      data: {
        userId,
        name: dto.name,
        discipline: dto.discipline ?? 'MATEMATICA',
        topic: dto.topic ?? null,
        latex: dto.latex,
        description: dto.description ?? null,
        variables: dto.variables ?? null,
        whenToUse: dto.whenToUse ?? null,
        example: dto.example ?? null,
        isFavorite: dto.isFavorite ?? false,
        isMemorized: dto.isMemorized ?? false,
        isPlatform,
      },
    });
  }

  async updateFormula(userId: string, id: string, dto: UpdateFormulaDto) {
    const formula = await this.findFormula(userId, id);
    const isPlatform = dto.isPlatform !== undefined ? await this.platformFlag(userId, dto.isPlatform) : undefined;
    const fields = ['name', 'discipline', 'topic', 'latex', 'description', 'variables', 'whenToUse', 'example', 'isFavorite', 'isMemorized'] as const;
    const data: Prisma.FormulaUpdateInput = {};
    for (const field of fields) if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = dto[field];
    if (isPlatform !== undefined) data.isPlatform = isPlatform;
    return this.prisma.formula.update({ where: { id: formula.id }, data });
  }

  async deleteFormula(userId: string, id: string) {
    const formula = await this.findFormula(userId, id);
    await this.prisma.formula.delete({ where: { id: formula.id } });
    return { deleted: true as const, id: formula.id };
  }

  /** Copia uma fórmula do acervo para o caderno (copiar de novo devolve a mesma cópia). */
  async copyFormula(userId: string, id: string) {
    const source = await this.prisma.formula.findFirst({ where: { id, isPlatform: true } });
    if (!source) throw new NotFoundException('Fórmula não encontrada no acervo.');
    const existing = await this.prisma.formula.findFirst({ where: { userId, platformSourceId: source.id } });
    if (existing) return existing;
    await this.assertItemRoom(userId, NotebookKind.FORMULA);
    return this.prisma.formula.create({
      data: {
        userId,
        name: source.name,
        discipline: source.discipline,
        topic: source.topic,
        latex: source.latex,
        description: null,
        variables: source.variables,
        whenToUse: source.whenToUse,
        example: source.example,
        origin: 'PLATFORM_COPY',
        platformSourceId: source.id,
      },
    });
  }

  /** Toda escrita passa pelo par (id, userId): o filtro no banco evita o
   * 404-vs-403 clássico, em que o aluno descobre que a fórmula de outra
   * pessoa existe só quando a dele não existe. */
  private async findFormula(userId: string, id: string) {
    const formula = await this.prisma.formula.findFirst({ where: { id, userId } });
    if (!formula) throw new NotFoundException('Fórmula não encontrada.');
    return formula;
  }

  /** Leitura: as do aluno e as do acervo da plataforma. */
  private async findReadableFormula(userId: string, id: string) {
    const formula = await this.prisma.formula.findFirst({ where: { id, OR: [{ userId }, { isPlatform: true }] }, include: FORMULA_INCLUDE });
    if (!formula) throw new NotFoundException('Fórmula não encontrada.');
    return formula;
  }

  // ---------------------------------------------------------- repertórios

  async listRepertoires(userId: string, query: ListRepertoiresQueryDto = {}) {
    if (query.collectionId) await this.ownCollection(userId, query.collectionId, NotebookKind.REPERTOIRE);
    const q = query.q?.trim();
    const rows = await this.prisma.repertoire.findMany({
      where: {
        AND: [
          this.scope(userId, query.scope),
          q
            ? {
                OR: [
                  { title: contains(q) },
                  { author: contains(q) },
                  { category: contains(q) },
                  { summary: contains(q) },
                  { context: contains(q) },
                  { essayUse: contains(q) },
                  { source: contains(q) },
                  { keywords: { has: q.toLowerCase() } },
                  { relatedThemes: { has: q } },
                  { concepts: { has: q } },
                  { socialProblems: contains(q) },
                  { brazilRelation: contains(q) },
                ],
              }
            : {},
          query.category ? { category: query.category } : {},
          query.theme ? { theme: query.theme } : {},
          query.referenceType ? { referenceType: query.referenceType } : {},
          query.axis ? { axes: { has: query.axis } } : {},
          query.argumentFunction ? { argumentFunctions: { has: query.argumentFunction } } : {},
          query.favorite ? { isFavorite: true } : {},
          query.collectionId ? { collectionItems: { some: { collectionId: query.collectionId } } } : {},
        ],
      },
      include: REPERTOIRE_INCLUDE,
      orderBy: orderBy(query.sort, 'title'),
      take: 500,
    });
    return rows.map(withCollectionIds);
  }

  async repertoireSummary(userId: string) {
    const where = { userId, isPlatform: false };
    const [total, favorites, categories, recent, platform, { tier, limits }, tagged] = await Promise.all([
      this.prisma.repertoire.count({ where }),
      this.prisma.repertoire.count({ where: { ...where, isFavorite: true } }),
      this.prisma.repertoire.groupBy({ by: ['category'], where, _count: { _all: true } }),
      this.prisma.repertoire.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, category: true, author: true, createdAt: true } }),
      this.prisma.repertoire.count({ where: { isPlatform: true } }),
      this.limits(userId),
      this.prisma.repertoire.findMany({ where: { OR: [where, { isPlatform: true }] }, select: { axes: true, argumentFunctions: true } }),
    ]);
    const tally = (lists: string[][]) => lists.flat().reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
    return {
      total,
      favorites,
      // Contagens de "meu caderno + acervo", para o mapa de aplicação.
      byAxis: tally(tagged.map((row) => row.axes)),
      byFunction: tally(tagged.map((row) => row.argumentFunctions)),
      categoriesUsed: categories.length,
      byCategory: categories.map((row) => ({ category: row.category, count: row._count._all })),
      recent,
      platformAvailable: platform,
      plan: { tier, itemLimit: limits.items, collectionLimit: limits.collections },
    };
  }

  async getRepertoire(userId: string, id: string) {
    return withCollectionIds(await this.findReadableRepertoire(userId, id));
  }

  async createRepertoire(userId: string, dto: CreateRepertoireDto) {
    const isPlatform = await this.platformFlag(userId, dto.isPlatform);
    if (!isPlatform) await this.assertItemRoom(userId, NotebookKind.REPERTOIRE);
    return this.prisma.repertoire.create({
      data: {
        userId,
        title: dto.title,
        summary: dto.summary,
        source: dto.source ?? null,
        year: dto.year ?? null,
        theme: dto.theme ?? 'OUTRO',
        keywords: normalizeKeywords(dto.keywords),
        isStudied: dto.isStudied ?? false,
        category: normalizeCategory(dto.category),
        author: dto.author ?? null,
        referenceType: dto.referenceType ?? 'OUTRO',
        context: dto.context ?? null,
        importance: dto.importance ?? null,
        essayUse: dto.essayUse ?? null,
        example: dto.example ?? null,
        relatedThemes: normalizeThemes(dto.relatedThemes),
        notes: dto.notes ?? null,
        isFavorite: dto.isFavorite ?? false,
        origin: dto.origin ?? 'MANUAL',
        axes: dto.axes ?? [],
        argumentFunctions: dto.argumentFunctions ?? [],
        concepts: normalizeThemes(dto.concepts),
        socialProblems: dto.socialProblems ?? null,
        brazilRelation: dto.brazilRelation ?? null,
        exampleSlot: dto.exampleSlot ?? null,
        connections: dto.connections ?? null,
        pitfalls: dto.pitfalls ?? null,
        quote: dto.quote ?? null,
        quoteSource: dto.quoteSource ?? null,
        isPlatform,
      },
    });
  }

  async updateRepertoire(userId: string, id: string, dto: UpdateRepertoireDto) {
    const repertoire = await this.findRepertoire(userId, id);
    const isPlatform = dto.isPlatform !== undefined ? await this.platformFlag(userId, dto.isPlatform) : undefined;
    const plain = ['title', 'summary', 'source', 'year', 'theme', 'isStudied', 'author', 'referenceType', 'context', 'importance', 'essayUse', 'example', 'notes', 'isFavorite', 'axes', 'argumentFunctions', 'socialProblems', 'brazilRelation', 'exampleSlot', 'connections', 'pitfalls', 'quote', 'quoteSource'] as const;
    const data: Prisma.RepertoireUpdateInput = {};
    for (const field of plain) if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = dto[field];
    if (dto.keywords !== undefined) data.keywords = normalizeKeywords(dto.keywords);
    if (dto.relatedThemes !== undefined) data.relatedThemes = normalizeThemes(dto.relatedThemes);
    if (dto.concepts !== undefined) data.concepts = normalizeThemes(dto.concepts);
    if (dto.category !== undefined) data.category = normalizeCategory(dto.category);
    if (isPlatform !== undefined) data.isPlatform = isPlatform;
    return this.prisma.repertoire.update({ where: { id: repertoire.id }, data });
  }

  async deleteRepertoire(userId: string, id: string) {
    const repertoire = await this.findRepertoire(userId, id);
    await this.prisma.repertoire.delete({ where: { id: repertoire.id } });
    return { deleted: true as const, id: repertoire.id };
  }

  /** Copia um repertório do acervo para o caderno (copiar de novo devolve a mesma cópia). */
  async copyRepertoire(userId: string, id: string) {
    const source = await this.prisma.repertoire.findFirst({ where: { id, isPlatform: true } });
    if (!source) throw new NotFoundException('Repertório não encontrado no acervo.');
    const existing = await this.prisma.repertoire.findFirst({ where: { userId, platformSourceId: source.id } });
    if (existing) return existing;
    await this.assertItemRoom(userId, NotebookKind.REPERTOIRE);
    const { id: _id, userId: _owner, createdAt: _c, updatedAt: _u, isPlatform: _p, platformSourceId: _s, notes: _n, isFavorite: _f, isStudied: _st, origin: _o, ...content } = source;
    return this.prisma.repertoire.create({ data: { ...content, userId, origin: 'PLATFORM_COPY', platformSourceId: source.id } });
  }

  private async findRepertoire(userId: string, id: string) {
    const repertoire = await this.prisma.repertoire.findFirst({ where: { id, userId } });
    if (!repertoire) throw new NotFoundException('Repertório não encontrado.');
    return repertoire;
  }

  private async findReadableRepertoire(userId: string, id: string) {
    const repertoire = await this.prisma.repertoire.findFirst({ where: { id, OR: [{ userId }, { isPlatform: true }] }, include: REPERTOIRE_INCLUDE });
    if (!repertoire) throw new NotFoundException('Repertório não encontrado.');
    return repertoire;
  }

  // ------------------------------------------------------------ coleções

  async listCollections(userId: string, kind: NotebookKind) {
    const rows = await this.prisma.notebookCollection.findMany({
      where: { userId, kind },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { repertoires: true, formulas: true } } },
    });
    return rows.map(({ _count, ...row }) => ({ ...row, itemCount: kind === NotebookKind.FORMULA ? _count.formulas : _count.repertoires }));
  }

  async createCollection(userId: string, kind: NotebookKind, dto: CreateCollectionDto) {
    const { tier, limits } = await this.limits(userId);
    const count = await this.prisma.notebookCollection.count({ where: { userId, kind } });
    if (count >= limits.collections) throw new NotebookLimitExceededException(tier, 'collections', kind, limits.collections);
    return this.prisma.notebookCollection.create({ data: { userId, kind, name: dto.name, description: dto.description ?? null } });
  }

  async updateCollection(userId: string, kind: NotebookKind, id: string, dto: UpdateCollectionDto) {
    const collection = await this.ownCollection(userId, id, kind);
    return this.prisma.notebookCollection.update({
      where: { id: collection.id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}) },
    });
  }

  async deleteCollection(userId: string, kind: NotebookKind, id: string) {
    const collection = await this.ownCollection(userId, id, kind);
    // Apagar a coleção não apaga os itens: eles continuam no caderno.
    await this.prisma.notebookCollection.delete({ where: { id: collection.id } });
    return { deleted: true as const, id: collection.id };
  }

  /** Adiciona itens do próprio caderno à coleção (repetidos são ignorados). */
  async addToCollection(userId: string, kind: NotebookKind, id: string, dto: CollectionItemsDto) {
    const collection = await this.ownCollection(userId, id, kind);
    const ids = [...new Set(dto.ids)];
    const owned =
      kind === NotebookKind.FORMULA
        ? await this.prisma.formula.findMany({ where: { id: { in: ids }, userId, isPlatform: false }, select: { id: true } })
        : await this.prisma.repertoire.findMany({ where: { id: { in: ids }, userId, isPlatform: false }, select: { id: true } });
    if (owned.length !== ids.length) throw new BadRequestException('Só itens do seu caderno entram nas coleções. Salve os do acervo antes.');
    if (kind === NotebookKind.FORMULA) {
      await this.prisma.formulaCollectionItem.createMany({ data: owned.map((row) => ({ collectionId: collection.id, formulaId: row.id })), skipDuplicates: true });
    } else {
      await this.prisma.repertoireCollectionItem.createMany({ data: owned.map((row) => ({ collectionId: collection.id, repertoireId: row.id })), skipDuplicates: true });
    }
    return { collectionId: collection.id, added: owned.length };
  }

  async removeFromCollection(userId: string, kind: NotebookKind, id: string, itemId: string) {
    const collection = await this.ownCollection(userId, id, kind);
    if (kind === NotebookKind.FORMULA) {
      await this.prisma.formulaCollectionItem.deleteMany({ where: { collectionId: collection.id, formulaId: itemId } });
    } else {
      await this.prisma.repertoireCollectionItem.deleteMany({ where: { collectionId: collection.id, repertoireId: itemId } });
    }
    return { collectionId: collection.id, removed: itemId };
  }

  // ------------------------------------------------------------- LuminIA

  private async generate(system: string, prompt: string, maxTokens: number): Promise<{ text: string; model: string | null }> {
    if (!this.ai) throw new ServiceUnavailableException('A LuminIA não está disponível agora.');
    const result = await this.ai.generateStructured({ system, prompt, maxTokens, timeoutMs: 45_000, temperature: 0.3, models: notebookModels() });
    if (!result?.text?.trim()) throw new ServiceUnavailableException('A LuminIA não está disponível agora. Tente de novo em instantes.');
    return { text: result.text.trim(), model: result.model ?? null };
  }

  /** Cada pedido gasta uma mensagem da LuminIA; se falhar, a mensagem volta. */
  private withQuota<T>(userId: string, run: () => Promise<T>): Promise<T> {
    return this.planUsage ? this.planUsage.withQuota(userId, 'LUMINIA_MESSAGE', run) : run();
  }

  async repertoireAi(userId: string, dto: RepertoireAiDto) {
    const ids = [...new Set(dto.ids ?? [])];
    const needs = { suggest: [0, 0], explain: [1, 1], howToUse: [1, 1], check: [1, 1], apply: [1, 1], analyzeUse: [0, 0], connections: [2, 4] }[dto.action];
    if (ids.length < needs[0] || ids.length > needs[1]) {
      throw new BadRequestException(dto.action === 'connections' ? 'Escolha de 2 a 4 repertórios.' : dto.action === 'suggest' ? 'A sugestão parte de um tema, não de repertórios.' : 'Escolha um repertório.');
    }
    if ((dto.action === 'suggest' || dto.action === 'check' || dto.action === 'apply') && !dto.theme) throw new BadRequestException('Informe o tema da redação.');
    if (dto.action === 'analyzeUse' && !dto.paragraph) throw new BadRequestException('Cole o parágrafo que você quer analisar.');
    const items = ids.length
      ? await this.prisma.repertoire.findMany({ where: { id: { in: ids }, OR: [{ userId }, { isPlatform: true }] } })
      : [];
    if (items.length !== ids.length) throw new NotFoundException('Repertório não encontrado.');
    const base = { action: dto.action, promptVersion: PROMPT_VERSION, disclaimer: 'Gerado pela LuminIA. Confira autores, datas e dados antes de usar na redação.' };

    return this.withQuota(userId, async () => {
      switch (dto.action) {
        case 'suggest': {
          const { text, model } = await this.generate(REPERTOIRE_SYSTEM, suggestPrompt(dto.theme!), 1800);
          const suggestions = parseSuggestions(text);
          if (!suggestions.length) throw new BadGatewayException('A LuminIA devolveu uma resposta que não deu para ler. Tente de novo.');
          return { ...base, model, theme: dto.theme, suggestions };
        }
        case 'check': {
          const { text, model } = await this.generate(REPERTOIRE_SYSTEM, checkPrompt(items[0], dto.theme!), 700);
          const check = parseCheck(text);
          if (!check) throw new BadGatewayException('A LuminIA devolveu uma resposta que não deu para ler. Tente de novo.');
          return { ...base, model, theme: dto.theme, check };
        }
        case 'apply': {
          const { text, model } = await this.generate(REPERTOIRE_SYSTEM, applyPrompt(items[0], dto.theme!), 1400);
          const application = parseApplication(text);
          if (!application) throw new BadGatewayException('A LuminIA devolveu uma resposta que não deu para ler. Tente de novo.');
          return { ...base, model, theme: dto.theme, application };
        }
        case 'analyzeUse': {
          const { text, model } = await this.generate(REPERTOIRE_SYSTEM, analyzeUsePrompt(dto.paragraph!, dto.theme), 900);
          const analysis = parseUseAnalysis(text, dto.paragraph!);
          if (!analysis) throw new BadGatewayException('A LuminIA devolveu uma resposta que não deu para ler. Tente de novo.');
          return { ...base, model, theme: dto.theme, analysis };
        }
        case 'explain':
          return { ...base, ...(await this.generate(REPERTOIRE_SYSTEM, explainPrompt(items[0]), 900)) };
        case 'howToUse':
          return { ...base, ...(await this.generate(REPERTOIRE_SYSTEM, howToUsePrompt(items[0], dto.part ?? 'DESENVOLVIMENTO'), 900)) };
        case 'connections': {
          const ordered = ids.map((id) => items.find((item) => item.id === id)!);
          return { ...base, ...(await this.generate(REPERTOIRE_SYSTEM, connectionsPrompt(ordered), 1000)) };
        }
      }
    });
  }

  async formulaAi(userId: string, dto: FormulaAiDto) {
    const formula = await this.findReadableFormula(userId, dto.id);
    return this.withQuota(userId, async () => {
      const { text, model } = await this.generate(FORMULA_SYSTEM, formulaPrompt(dto.action, formula), dto.action === 'example' ? 1200 : 800);
      return { action: dto.action, promptVersion: PROMPT_VERSION, model, text, disclaimer: 'Gerado pela LuminIA. Confira as contas antes de estudar por ele.' };
    });
  }
}
