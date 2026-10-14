import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { GoogleCseSearchProvider } from './google-cse.provider';
import { WebSearchProviderError } from './search-provider.error';
import { QuestionDifficulty } from '@prisma/client';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const originalFetch = globalThis.fetch;

describe('GoogleCseSearchProvider (item 10 — busca web real)', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('false quando GOOGLE_CSE_ID está ausente', () => {
      const provider = new GoogleCseSearchProvider(
        makeConfig({ GOOGLE_CSE_API_KEY: 'key-abc' }),
      );
      expect(provider.isConfigured()).toBe(false);
    });

    it('false quando GOOGLE_CSE_API_KEY está ausente', () => {
      const provider = new GoogleCseSearchProvider(
        makeConfig({ GOOGLE_CSE_ID: 'cx-123' }),
      );
      expect(provider.isConfigured()).toBe(false);
    });

    it('true somente com as DUAS chaves presentes', () => {
      const provider = new GoogleCseSearchProvider(
        makeConfig({ GOOGLE_CSE_ID: 'cx-123', GOOGLE_CSE_API_KEY: 'key-abc' }),
      );
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('searchWeb', () => {
    let provider: GoogleCseSearchProvider;

    beforeEach(() => {
      provider = new GoogleCseSearchProvider(
        makeConfig({ GOOGLE_CSE_ID: 'cx-123', GOOGLE_CSE_API_KEY: 'key-abc' }),
      );
    });

    it('recusa chamar a API sem configuração (erro CONFIG) — o service cai no demo', async () => {
      const unconfigured = new GoogleCseSearchProvider(makeConfig({}));
      await expect(
        unconfigured.searchWeb({ q: 'matemática' }, 'user-1', 10),
      ).rejects.toMatchObject({ name: 'WebSearchProviderError', code: 'CONFIG' });
    });

    it('mapeia items do Google preservando metadados + atribuição (link/displayLink)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              title: 'ENEM 2023 — Questão de Probabilidade',
              link: 'https://exemplo.org/questao/123',
              snippet: 'Calcule a probabilidade...',
              displayLink: 'exemplo.org',
            },
          ],
        }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const hits = await provider.searchWeb({ q: 'probabilidade' }, 'user-1', 10);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('googleapis.com/customsearch/v1');
      expect(url).toContain('cx-123');
      expect(url).toContain('key-abc');
      expect(url).toContain(encodeURIComponent('probabilidade'));

      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        title: 'ENEM 2023 — Questão de Probabilidade',
        link: 'https://exemplo.org/questao/123',
        snippet: 'Calcule a probabilidade...',
        sourceName: 'exemplo.org',
        sourceId: 'https://exemplo.org/questao/123',
      });
    });

    it('monta a query combinando conteúdo + exam + subject + topic', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await provider.searchWeb(
        {
          q: 'funções exponenciais',
          exam: 'ENEM',
          subject: 'Matemática',
          topic: 'Funções',
          difficulty: QuestionDifficulty.MEDIA,
        },
        'user-1',
        10,
      );

      const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
      expect(url).toContain('funções exponenciais');
      expect(url).toContain('ENEM');
      expect(url).toContain('Matemática');
      expect(url).toContain('Funções');
    });

    it('devolve lista vazia quando o Google responde sem items', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).resolves.toEqual([]);
    });

    it('traduz HTTP 429 em erro RATE_LIMIT', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'RATE_LIMIT',
      });
    });

    it('traduz HTTP 401/403 em erro UNAUTHORIZED', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('traduz HTTP 5xx em erro UPSTREAM', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'UPSTREAM',
      });
    });

    it('traduz body com error do Google em RATE_LIMIT', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 429, message: 'Quota excedida' } }),
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'RATE_LIMIT',
      });
    });

    it('traduz falha de rede em erro UNKNOWN', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('traduz AbortError (timeout) em erro TIMEOUT', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it('traduz JSON inválido em erro UNKNOWN', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token <');
        },
      }) as unknown as typeof fetch;

      await expect(provider.searchWeb({ q: 'x' }, 'user-1', 10)).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('expõe name=google-cse (usado pelo SearchService para marcar demoMode=false)', () => {
      expect(provider.name).toBe('google-cse');
    });

    it('lança sempre WebSearchProviderError (tipo padronizado para o controller)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch;

      const error = await provider.searchWeb({ q: 'x' }, 'user-1', 10).catch((e) => e);
      expect(error).toBeInstanceOf(WebSearchProviderError);
    });
  });
});
