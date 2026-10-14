import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { QuestionDifficulty } from '@prisma/client';
import { DemoWebSearchProvider } from './demo-search.provider';
import { QuestionsRepository } from '../questions/questions.repository';
import { QuestionAccessService } from '../questions/question-access.service';
import { QuestionTextSearchRepository } from '../questions/question-text-search.repository';

const PERSONAL = { id: 'ws-personal' };
const BANK = { id: 'ws-banco' };

function makeRepo(questions: unknown[]): QuestionsRepository {
  return { findMany: vi.fn().mockResolvedValue(questions) } as unknown as QuestionsRepository;
}

function makeAccess(personal: unknown = PERSONAL, bank: unknown = BANK): QuestionAccessService {
  return {
    getPersonalWorkspace: vi.fn().mockResolvedValue(personal),
    getBankWorkspace: vi.fn().mockResolvedValue(bank),
  } as unknown as QuestionAccessService;
}

/** A busca textual é um pré-filtro de ids: devolve todos os ids do banco para
 * que o teste siga focado no resto do filtro. */
function makeTextSearch(ids: string[] = ['q-1']): QuestionTextSearchRepository {
  return {
    findIdsMatching: vi.fn().mockResolvedValue(ids),
  } as unknown as QuestionTextSearchRepository;
}

function makeConfig(frontendUrl = 'http://localhost:5174'): ConfigService {
  return { get: vi.fn().mockReturnValue(frontendUrl) } as unknown as ConfigService;
}

const question = {
  id: 'q-1',
  subject: 'Matemática',
  topic: 'Funções exponenciais',
  exam: 'ENEM',
  year: 2023,
  difficulty: QuestionDifficulty.MEDIA,
  stem: 'Considere a função exponencial f(x) = 2^x. Qual o valor de f(3)?',
  sourceName: 'Prova ENEM 2023',
  sourceId: 'https://exemplo.org/enem-2023/12',
};

describe('DemoWebSearchProvider (item 10 — modo demonstração)', () => {
  let repo: QuestionsRepository;
  let access: QuestionAccessService;
  let textSearch: QuestionTextSearchRepository;
  let config: ConfigService;
  let provider: DemoWebSearchProvider;

  beforeEach(() => {
    repo = makeRepo([question]);
    access = makeAccess();
    textSearch = makeTextSearch();
    config = makeConfig();
    provider = new DemoWebSearchProvider(repo, access, textSearch, config);
  });

  const whereOf = () =>
    (repo.findMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

  it('se identifica como name=demo (o SearchService marca demoMode=true)', () => {
    expect(provider.name).toBe('demo');
  });

  it('isConfigured() é true — o provider demo está sempre disponível', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('busca no banco acessível (personal + banco) filtrando pelo conteúdo', async () => {
    const hits = await provider.searchWeb({ q: 'exponencial' }, 'user-1', 10);

    expect(repo.findMany).toHaveBeenCalledTimes(1);
    const where = whereOf();
    expect(where.workspaceId).toEqual({ in: [PERSONAL.id, BANK.id] });

    expect(hits).toHaveLength(1);
  });

  it('delega o termo livre à busca textual insensível a acento', async () => {
    await provider.searchWeb({ q: 'funcoes' }, 'user-1', 10);

    expect(textSearch.findIdsMatching).toHaveBeenCalledWith('funcoes', [
      PERSONAL.id,
      BANK.id,
    ]);
    // o `q` deixa de virar filtro `contains` acento-sensível no Prisma
    expect(whereOf().OR).toBeUndefined();
    expect(whereOf().id).toEqual({ in: ['q-1'] });
  });

  it('não consulta a busca textual quando não há termo livre', async () => {
    await provider.searchWeb({ q: '' }, 'user-1', 10);

    expect(textSearch.findIdsMatching).not.toHaveBeenCalled();
    expect(whereOf().id).toBeUndefined();
  });

  it('classifica automaticamente o hit com os campos do catálogo Lumina', async () => {
    const [hit] = await provider.searchWeb({ q: 'exponencial' }, 'user-1', 10);

    expect(hit.classification).toEqual({
      subject: 'Matemática',
      topic: 'Funções exponenciais',
      exam: 'ENEM',
      year: 2023,
      difficulty: QuestionDifficulty.MEDIA,
    });
  });

  it('preserva a atribuição original (sourceName/sourceId) do hit', async () => {
    const [hit] = await provider.searchWeb({ q: 'exponencial' }, 'user-1', 10);

    expect(hit.sourceName).toBe('Prova ENEM 2023');
    expect(hit.sourceId).toBe('https://exemplo.org/enem-2023/12');
  });

  it('gera link ABSOLUTO (exigência de POST /search/save) e limita o trecho a 200 chars', async () => {
    repo = makeRepo([{ ...question, stem: 'X'.repeat(500) }]);
    provider = new DemoWebSearchProvider(repo, access, textSearch, config);

    const [hit] = await provider.searchWeb({ q: 'exponencial' }, 'user-1', 10);
    expect(hit.link).toBe('http://localhost:5174/app/questoes/q-1');
    expect(hit.snippet).toHaveLength(200);
  });

  it('usa o FRONTEND_URL configurado e remove barra final', async () => {
    config = makeConfig('https://app.lumina.com.br/');
    provider = new DemoWebSearchProvider(repo, access, textSearch, config);

    const [hit] = await provider.searchWeb({ q: 'exponencial' }, 'user-1', 10);
    expect(hit.link).toBe('https://app.lumina.com.br/app/questoes/q-1');
  });

  it('aplica filtro de subject quando informado', async () => {
    await provider.searchWeb({ q: 'exponencial', subject: 'Matemática' }, 'user-1', 10);
    expect(whereOf().subject).toEqual({ contains: 'Matemática', mode: 'insensitive' });
  });

  it('aplica filtro de exam e difficulty quando informados', async () => {
    await provider.searchWeb(
      { q: 'exponencial', exam: 'ENEM', difficulty: QuestionDifficulty.MEDIA },
      'user-1',
      10,
    );
    const where = whereOf();
    expect(where.exam).toEqual({ contains: 'ENEM', mode: 'insensitive' });
    expect(where.difficulty).toBe(QuestionDifficulty.MEDIA);
  });

  it('respeita o limite máximo de 20 resultados', async () => {
    await provider.searchWeb({ q: 'x' }, 'user-1', 500);
    const [, options] = (repo.findMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.take).toBe(20);
  });

  it('devolve lista vazia quando o usuário não tem nenhum workspace acessível', async () => {
    access = makeAccess(null, null);
    provider = new DemoWebSearchProvider(repo, access, textSearch, config);

    await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).resolves.toEqual([]);
    expect(repo.findMany).not.toHaveBeenCalled();
    expect(textSearch.findIdsMatching).not.toHaveBeenCalled();
  });

  it('devolve lista vazia quando o banco não tem questões para o termo', async () => {
    repo = makeRepo([]);
    textSearch = makeTextSearch([]);
    provider = new DemoWebSearchProvider(repo, access, textSearch, config);

    await expect(provider.searchWeb({ q: 'inexistente' }, 'user-1', 10)).resolves.toEqual([]);
  });
});
