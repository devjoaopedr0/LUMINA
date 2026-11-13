import { NotebookKind, PlanTier } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { parseCheck, parseSuggestions, suggestPrompt } from './notebook-ai';
import { CreateRepertoireDto, ListRepertoiresQueryDto, RepertoireAiDto } from './notebooks.dto';
import { NotebookLimitExceededException, NotebooksService } from './notebooks.service';

const repertoire = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'owner',
  title: 'Zygmunt Bauman — modernidade líquida',
  summary: 'Relações e instituições frágeis e passageiras na sociedade de consumo.',
  author: 'Zygmunt Bauman',
  category: 'SOCIOLOGIA',
  context: null,
  essayUse: null,
  isPlatform: false,
};

function setup(opts: { tier?: PlanTier; count?: number; accountType?: string; ai?: unknown } = {}) {
  const db = {
    user: { findUnique: vi.fn().mockResolvedValue({ accountType: opts.accountType ?? 'STUDENT_INDEPENDENT' }) },
    formula: { count: vi.fn().mockResolvedValue(opts.count ?? 0), create: vi.fn(async ({ data }: any) => ({ id: 'f-new', ...data })), findFirst: vi.fn() },
    repertoire: {
      count: vi.fn().mockResolvedValue(opts.count ?? 0),
      create: vi.fn(async ({ data }: any) => ({ id: 'r-new', ...data })),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    notebookCollection: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: any) => ({ id: 'c-new', ...data })),
      findFirst: vi.fn(),
    },
    repertoireCollectionItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const entitlements = { resolve: vi.fn().mockResolvedValue({ tier: opts.tier ?? PlanTier.FREE }) };
  const planUsage = { withQuota: vi.fn((_u: string, _f: string, run: () => Promise<unknown>) => run()) };
  const service = new NotebooksService(db as any, entitlements as any, planUsage as any, opts.ai as any);
  return { db, service, planUsage };
}

describe('limites do plano nos cadernos', () => {
  it('Gratuito: o 21º repertório é bloqueado com a mensagem do Premium', async () => {
    const { service, db } = setup({ count: 20 });
    const error = await service.createRepertoire('owner', { title: 'Novo', summary: 'Um resumo com mais de dez letras.' }).catch((e) => e);
    expect(error).toBeInstanceOf(NotebookLimitExceededException);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: 'PLAN_LIMIT', limit: 20 });
    expect(error.message).toContain('Com o Premium o caderno é ilimitado');
    expect(db.repertoire.create).not.toHaveBeenCalled();
  });

  it('Premium passa dos 20; coleções do Gratuito param em 2', async () => {
    const premium = setup({ tier: PlanTier.PREMIUM, count: 20 });
    await expect(premium.service.createFormula('owner', { name: 'Bhaskara', latex: 'x' })).resolves.toMatchObject({ id: 'f-new' });

    const free = setup();
    free.db.notebookCollection.count.mockResolvedValue(2);
    await expect(free.service.createCollection('owner', NotebookKind.REPERTOIRE, { name: 'Educação' })).rejects.toBeInstanceOf(NotebookLimitExceededException);
  });
});

describe('acervo da plataforma', () => {
  it('só a administração publica; o item do acervo não conta no limite', async () => {
    const student = setup();
    await expect(student.service.createRepertoire('owner', { title: 'X', summary: 'Resumo suficiente aqui.', isPlatform: true })).rejects.toThrow('Só a administração');

    const admin = setup({ accountType: 'ADMIN', count: 999 });
    const created = await admin.service.createRepertoire('admin', { title: 'X', summary: 'Resumo suficiente aqui.', isPlatform: true });
    expect(created).toMatchObject({ isPlatform: true });
    expect(admin.db.repertoire.count).not.toHaveBeenCalled();
  });

  it('copiar do acervo cria uma cópia limpa; copiar de novo devolve a mesma', async () => {
    const { service, db } = setup();
    const source = { ...repertoire, id: 'p1', userId: 'admin', isPlatform: true, notes: 'nota do admin', isFavorite: true, origin: 'MANUAL', platformSourceId: null, createdAt: new Date(), updatedAt: new Date(), isStudied: true };
    db.repertoire.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce(null);
    const copy = await service.copyRepertoire('owner', 'p1');
    expect(copy).toMatchObject({ userId: 'owner', origin: 'PLATFORM_COPY', platformSourceId: 'p1', title: source.title });
    expect(copy).not.toHaveProperty('notes');
    expect(copy).not.toHaveProperty('isFavorite');

    db.repertoire.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce({ id: 'already' });
    await expect(service.copyRepertoire('owner', 'p1')).resolves.toEqual({ id: 'already' });
  });
});

describe('coleções', () => {
  it('só itens do próprio caderno entram na coleção', async () => {
    const { service, db } = setup();
    db.notebookCollection.findFirst.mockResolvedValue({ id: 'c1' });
    db.repertoire.findMany.mockResolvedValue([{ id: 'a' }]);
    await expect(service.addToCollection('owner', NotebookKind.REPERTOIRE, 'c1', { ids: ['a', 'b'] })).rejects.toThrow('Só itens do seu caderno');
    db.repertoire.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await expect(service.addToCollection('owner', NotebookKind.REPERTOIRE, 'c1', { ids: ['a', 'b', 'a'] })).resolves.toEqual({ collectionId: 'c1', added: 2 });
    expect(db.repertoireCollectionItem.createMany).toHaveBeenCalledWith({ data: [{ collectionId: 'c1', repertoireId: 'a' }, { collectionId: 'c1', repertoireId: 'b' }], skipDuplicates: true });
  });

  it('coleção de outro aluno é 404', async () => {
    const { service, db } = setup();
    db.notebookCollection.findFirst.mockResolvedValue(null);
    await expect(service.listRepertoires('owner', { collectionId: 'c-alheia' })).rejects.toThrow('Coleção não encontrada.');
  });
});

describe('busca de repertórios', () => {
  it('combina texto, categoria, favoritos e escopo do acervo', async () => {
    const { service, db } = setup();
    await service.listRepertoires('owner', { q: 'Bauman', category: 'SOCIOLOGIA', favorite: true, scope: 'all', sort: 'az' });
    const call = db.repertoire.findMany.mock.calls[0][0];
    expect(call.where.AND[0]).toEqual({ OR: [{ userId: 'owner', isPlatform: false }, { isPlatform: true }] });
    expect(call.where.AND[1].OR).toEqual(expect.arrayContaining([{ author: { contains: 'Bauman', mode: 'insensitive' } }, { keywords: { has: 'bauman' } }]));
    expect(call.where.AND).toEqual(expect.arrayContaining([{ category: 'SOCIOLOGIA' }, { isFavorite: true }]));
    expect(call.orderBy).toEqual([{ title: 'asc' }]);
  });

  it('a query string "true" vira booleano', async () => {
    const query = plainToInstance(ListRepertoiresQueryDto, { favorite: 'true' });
    expect(await validate(query)).toHaveLength(0);
    expect(query.favorite).toBe(true);
  });

  it('categoria própria do aluno é aceita; registro incompleto não', async () => {
    const base = { title: 'Pierre Lévy', summary: 'Inteligência coletiva em rede.' };
    expect(await validate(plainToInstance(CreateRepertoireDto, { ...base, category: 'Minha categoria' }))).toHaveLength(0);
    expect(await validate(plainToInstance(CreateRepertoireDto, { title: 'Só título' }))).not.toHaveLength(0);
  });
});

describe('LuminIA nos repertórios', () => {
  const aiReturning = (text: string) => ({ generateStructured: vi.fn().mockResolvedValue({ text, model: 'gemini:teste' }) });

  it('sugere para um tema, gastando uma mensagem da LuminIA, e marca "a conferir"', async () => {
    const ai = aiReturning(
      JSON.stringify({
        suggestions: [
          { title: 'Constituição Federal de 1988, art. 6º', author: null, category: 'LEGISLACAO', referenceType: 'LEI', context: 'Direitos sociais.', relation: 'Educação como direito.', howToArgue: 'Contrastar com a realidade.', example: 'A Constituição garante...', verify: null },
          { title: '', relation: 'sem título é descartado' },
        ],
      }),
    );
    const { service, planUsage } = setup({ ai });
    const result: any = await service.repertoireAi('owner', { action: 'suggest', theme: 'Desafios da educação no Brasil' });
    expect(planUsage.withQuota).toHaveBeenCalledWith('owner', 'LUMINIA_MESSAGE', expect.any(Function));
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ category: 'LEGISLACAO', referenceType: 'LEI' });
    expect(result.disclaimer).toContain('Confira');
  });

  it('sem IA configurada responde 503 (e o crédito volta pelo withQuota)', async () => {
    const { service } = setup({ ai: { generateStructured: vi.fn().mockResolvedValue(null) } });
    await expect(service.repertoireAi('owner', { action: 'suggest', theme: 'Tema qualquer' })).rejects.toThrow('A LuminIA não está disponível');
  });

  it('valida quantos repertórios cada ação usa e exige o tema', async () => {
    const { service } = setup({ ai: aiReturning('{}') });
    await expect(service.repertoireAi('owner', { action: 'connections', ids: [repertoire.id] })).rejects.toThrow('Escolha de 2 a 4');
    await expect(service.repertoireAi('owner', { action: 'check', ids: [repertoire.id] })).rejects.toThrow('Informe o tema');
    expect(await validate(plainToInstance(RepertoireAiDto, { action: 'inventar' }))).not.toHaveLength(0);
  });

  it('confere a pertinência com veredito estruturado', async () => {
    const ai = aiReturning('```json\n{"verdict":"forcado","explanation":"O conceito não dialoga com o recorte.","tips":["Ligue ao recorte do tema."]}\n```');
    const { service, db } = setup({ ai });
    db.repertoire.findMany.mockResolvedValue([repertoire]);
    const result: any = await service.repertoireAi('owner', { action: 'check', ids: [repertoire.id], theme: 'Mobilidade urbana' });
    expect(result.check).toEqual({ verdict: 'FORCADO', explanation: 'O conceito não dialoga com o recorte.', tips: ['Ligue ao recorte do tema.'] });
  });
});

describe('leitura das respostas da LuminIA', () => {
  it('categoria desconhecida vira OUTRA; resposta sem JSON vira lista vazia', () => {
    const parsed = parseSuggestions('{"suggestions":[{"title":"Obra X","category":"ASTROLOGIA","referenceType":"???","relation":"r"}]}');
    expect(parsed[0]).toMatchObject({ category: 'OUTRA', referenceType: 'OUTRO', author: null });
    expect(parseSuggestions('desculpe, não sei')).toEqual([]);
    expect(parseCheck('{"verdict":"TALVEZ","explanation":"x"}')).toBeNull();
  });

  it('o prompt proíbe inventar citação, número e data', () => {
    expect(suggestPrompt('tema')).toContain('sem citação literal inventada');
  });
});
