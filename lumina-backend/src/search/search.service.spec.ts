import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { SearchService } from './search.service';
import { GoogleCseSearchProvider } from './google-cse.provider';
import { DemoWebSearchProvider } from './demo-search.provider';
import { TavilySearchProvider } from './tavily.provider';
import { WebHitClassifierService } from './web-hit-classifier.service';
import { WebSearchProviderError } from './search-provider.error';
import { ServiceUnavailableException } from '@nestjs/common';
import { QuestionsService } from '../questions/questions.service';
import { QuestionImportService } from '../questions/import/question-import.service';
import { SaveWebQuestionDto, SearchWebQueryDto } from './search.dto';

const baseQuery: SearchWebQueryDto = {
  q: 'funções exponenciais',
  exam: 'ENEM',
  subject: 'Matemática',
};

const hit = {
  title: 'ENEM 2023 — Funções exponenciais',
  link: 'https://exemplo.org/questao/7',
  snippet: 'Considere f(x)=2^x...',
  sourceName: 'exemplo.org',
  sourceId: 'https://exemplo.org/questao/7',
  classification: {
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    exam: 'ENEM',
    year: 2023,
    difficulty: QuestionDifficulty.MEDIA,
  },
};

const importReport = { total: 1, imported: 1, updated: 0, skipped: 0, duplicates: [], issues: [] };

function makeService(options: {
  googleConfigured: boolean;
  hits?: unknown[];
  tavilyConfigured?: boolean;
  tavilyError?: WebSearchProviderError;
  googleError?: WebSearchProviderError;
}) {
  const tavily = {
    name: 'tavily' as const,
    isConfigured: vi.fn().mockReturnValue(options.tavilyConfigured ?? false),
    searchWeb: options.tavilyError
      ? vi.fn().mockRejectedValue(options.tavilyError)
      : vi.fn().mockResolvedValue(options.hits ?? [hit]),
  } as unknown as TavilySearchProvider;

  const google = {
    name: 'google-cse' as const,
    isConfigured: vi.fn().mockReturnValue(options.googleConfigured),
    searchWeb: options.googleError
      ? vi.fn().mockRejectedValue(options.googleError)
      : vi.fn().mockResolvedValue(options.hits ?? [hit]),
  } as unknown as GoogleCseSearchProvider;

  const demo = {
    name: 'demo' as const,
    isConfigured: vi.fn().mockReturnValue(true),
    searchWeb: vi.fn().mockResolvedValue([hit]),
  } as unknown as DemoWebSearchProvider;

  const questionsService = {
    getImportWorkspace: vi.fn().mockResolvedValue({ id: 'ws-personal' }),
  } as unknown as QuestionsService;

  const questionImportService = {
    importFromDtos: vi.fn().mockResolvedValue(importReport),
  } as unknown as QuestionImportService;

  const classifier = {
    classifyAndRank: vi.fn().mockImplementation(async (hits: unknown[]) => hits),
  } as unknown as WebHitClassifierService;

  const service = new SearchService(tavily, google, demo, questionsService, questionImportService, classifier);
  return { service, tavily, google, demo, questionsService, questionImportService };
}

describe('SearchService (item 10 — busca de questões na web)', () => {
  describe('searchWeb — seleção de provedor', () => {
    it('usa o Google CSE quando configurado e sinaliza demoMode=false', async () => {
      const { service, google, demo } = makeService({ googleConfigured: true });

      const result = await service.searchWeb('user-1', baseQuery);

      expect(google.searchWeb).toHaveBeenCalledTimes(1);
      expect(demo.searchWeb).not.toHaveBeenCalled();
      expect(result.provider).toBe('google-cse');
      expect(result.demoMode).toBe(false);
    });

    it('usa o provider DEMO quando o Google CSE não está configurado e sinaliza demoMode=true', async () => {
      const { service, google, demo } = makeService({ googleConfigured: false });

      const result = await service.searchWeb('user-1', baseQuery);

      expect(demo.searchWeb).toHaveBeenCalledTimes(1);
      expect(google.searchWeb).not.toHaveBeenCalled();
      expect(result.provider).toBe('demo');
      expect(result.demoMode).toBe(true);
    });
  });

  describe('searchWeb — Tavily e reserva', () => {
    it('prefere a Tavily quando configurada', async () => {
      const { service, tavily, google, demo } = makeService({ googleConfigured: true, tavilyConfigured: true });
      const result = await service.searchWeb('user-1', { q: 'função afim' });
      expect(result.provider).toBe('tavily');
      expect(result.demoMode).toBe(false);
      expect(tavily.searchWeb).toHaveBeenCalled();
      expect(google.searchWeb).not.toHaveBeenCalled();
      expect(demo.searchWeb).not.toHaveBeenCalled();
    });

    it('cai no Google CSE quando a Tavily falha', async () => {
      const { service, google } = makeService({
        googleConfigured: true,
        tavilyConfigured: true,
        tavilyError: new WebSearchProviderError('RATE_LIMIT', 'limite'),
      });
      const result = await service.searchWeb('user-1', { q: 'função afim' });
      expect(result.provider).toBe('google-cse');
      expect(google.searchWeb).toHaveBeenCalled();
    });

    it('responde 503 (sem cair no demo) quando todos os provedores reais falham', async () => {
      const { service, demo } = makeService({
        googleConfigured: false,
        tavilyConfigured: true,
        tavilyError: new WebSearchProviderError('UPSTREAM', 'fora do ar'),
      });
      await expect(service.searchWeb('user-1', { q: 'função afim' })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(demo.searchWeb).not.toHaveBeenCalled();
    });

    it('não engole erros que não são do provedor', async () => {
      const { service } = makeService({ googleConfigured: true, tavilyConfigured: true, tavilyError: new TypeError('bug') as never });
      await expect(service.searchWeb('user-1', { q: 'função afim' })).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe('searchWeb — mapeamento e filtros', () => {
    it('devolve os hits preservando metadados públicos + classificação', async () => {
      const { service } = makeService({ googleConfigured: true });

      const result = await service.searchWeb('user-1', baseQuery);

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        title: 'ENEM 2023 — Funções exponenciais',
        link: 'https://exemplo.org/questao/7',
        snippet: 'Considere f(x)=2^x...',
        sourceName: 'exemplo.org',
        sourceId: 'https://exemplo.org/questao/7',
        classification: {
          subject: 'Matemática',
          topic: 'Funções exponenciais',
          exam: 'ENEM',
          year: 2023,
          difficulty: QuestionDifficulty.MEDIA,
        },
      });
    });

    it('encaminha conteúdo/exame/disciplina ao provider com o q normalizado (trim)', async () => {
      const { service, google } = makeService({ googleConfigured: true });

      await service.searchWeb('user-1', { ...baseQuery, q: '  funções exponenciais  ' });

      const [payload, userId] = (google.searchWeb as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(payload).toMatchObject({
        q: 'funções exponenciais',
        exam: 'ENEM',
        subject: 'Matemática',
      });
      expect(payload.q).toBe(payload.q.trim());
      expect(userId).toBe('user-1');
    });

    it('normaliza filtros ausentes para null (evita "undefined" na query do provedor)', async () => {
      const { service, google } = makeService({ googleConfigured: true });

      await service.searchWeb('user-1', { q: 'probabilidade' });

      const [payload] = (google.searchWeb as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(payload).toEqual({
        q: 'probabilidade',
        exam: null,
        subject: null,
        topic: null,
        difficulty: null,
      });
    });

    it('aplica o limite padrão (10) quando o cliente não informa limit', async () => {
      const { service, google } = makeService({ googleConfigured: true });

      await service.searchWeb('user-1', baseQuery);

      const [, , limit] = (google.searchWeb as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(limit).toBe(10);
    });

    it('limita o resultado a no máximo 20 itens mesmo com limit alto', async () => {
      const { service, google } = makeService({ googleConfigured: true });

      await service.searchWeb('user-1', { ...baseQuery, limit: 100 });

      const [, , limit] = (google.searchWeb as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(limit).toBe(20);
    });

    it('respeita limite informado dentro da faixa válida', async () => {
      const { service, google } = makeService({ googleConfigured: true });

      await service.searchWeb('user-1', { ...baseQuery, limit: 5 });

      const [, , limit] = (google.searchWeb as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(limit).toBe(5);
    });

    it('reflete a query original no response (echo para o cliente)', async () => {
      const { service } = makeService({ googleConfigured: false });

      const result = await service.searchWeb('user-1', baseQuery);

      expect(result.query).toEqual(baseQuery);
    });
  });

  describe('save — pipeline de importação com direitos autorais', () => {
    const dto: SaveWebQuestionDto = {
      sourceUrl: 'https://exemplo.org/questao/7',
      sourceName: 'exemplo.org',
      question: {
        stem: 'Considere f(x)=2^x. Qual o valor de f(3)?',
        subject: 'Matemática',
        topic: 'Funções exponenciais',
        exam: 'ENEM',
        year: 2023,
        difficulty: QuestionDifficulty.MEDIA,
        sourceType: QuestionSourceType.OFFICIAL,
        sourceName: 'nome-ignorado-pelo-service',
        options: [
          { text: '8', correct: true },
          { text: '6', correct: false },
        ],
      },
    } as unknown as SaveWebQuestionDto;

    it('salva no workspace pessoal do usuário', async () => {
      const { service, questionsService, questionImportService } = makeService({
        googleConfigured: false,
      });

      await service.save('user-1', dto);

      expect(questionsService.getImportWorkspace).toHaveBeenCalledWith('user-1', 'PERSONAL');
      expect(questionImportService.importFromDtos).toHaveBeenCalledWith(
        expect.any(Array),
        'ws-personal',
        'user-1',
      );
    });

    it('força sourceType=IMPORTED, sourceName=fonte e sourceId=URL original (atribuição)', async () => {
      const { service, questionImportService } = makeService({ googleConfigured: false });

      await service.save('user-1', dto);

      const [items] = (questionImportService.importFromDtos as unknown as ReturnType<
        typeof vi.fn
      >).mock.calls[0];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        sourceType: QuestionSourceType.IMPORTED,
        sourceName: 'exemplo.org',
        sourceId: 'https://exemplo.org/questao/7',
      });
    });

    it('NÃO sobrescreve o conteúdo transcrito pelo usuário (preserva enunciado e alternativas)', async () => {
      const { service, questionImportService } = makeService({ googleConfigured: false });

      await service.save('user-1', dto);

      const [items] = (questionImportService.importFromDtos as unknown as ReturnType<
        typeof vi.fn
      >).mock.calls[0];
      expect(items[0].stem).toBe('Considere f(x)=2^x. Qual o valor de f(3)?');
      expect(items[0].options).toHaveLength(2);
    });

    it('devolve o ImportReport (dedup/contagem) do pipeline de importação', async () => {
      const { service } = makeService({ googleConfigured: false });

      const report = await service.save('user-1', dto);

      expect(report).toEqual(importReport);
    });

    it('propaga falha do pipeline de importação (não engole o erro)', async () => {
      const { service, questionImportService } = makeService({ googleConfigured: false });
      (questionImportService.importFromDtos as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Falha na importação'),
      );

      await expect(service.save('user-1', dto)).rejects.toThrow();
    });
  });
});
