import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TavilySearchProvider, TAVILY_SNIPPET_MAX } from './tavily.provider';
import { WebSearchProviderError } from './search-provider.error';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const originalFetch = globalThis.fetch;
const query = { q: 'questão função afim', exam: 'ENEM', subject: 'Matemática', topic: null };

describe('TavilySearchProvider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('só fica ativo com TAVILY_API_KEY (ignorando espaços)', () => {
    expect(new TavilySearchProvider(makeConfig({})).isConfigured()).toBe(false);
    expect(new TavilySearchProvider(makeConfig({ TAVILY_API_KEY: '   ' })).isConfigured()).toBe(false);
    expect(new TavilySearchProvider(makeConfig({ TAVILY_API_KEY: 'tvly-x' })).isConfigured()).toBe(true);
  });

  it('chama POST /search com a chave no header e a query montada com os filtros', async () => {
    const fetchFn = mockFetch(200, { results: [] });
    const provider = new TavilySearchProvider(makeConfig({ TAVILY_API_KEY: 'tvly-x', TAVILY_BASE_URL: 'https://api.tavily.com/' }));

    await provider.searchWeb(query, 'user-1', 50);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tvly-x');
    const body = JSON.parse(init.body);
    expect(body.query).toBe('questão função afim ENEM Matemática');
    expect(body.max_results).toBe(20);
    expect(body.include_raw_content).toBe(false);
  });

  it('mapeia resultados: trecho curto, domínio como fonte e link como sourceId', async () => {
    mockFetch(200, {
      results: [
        { title: 'Função afim no ENEM', url: 'https://www.exemplo.com.br/afim', content: 'x '.repeat(400) },
        { title: 'sem link', content: 'ignorado' },
      ],
    });
    const provider = new TavilySearchProvider(makeConfig({ TAVILY_API_KEY: 'tvly-x' }));

    const hits = await provider.searchWeb(query, 'user-1', 5);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      title: 'Função afim no ENEM',
      link: 'https://www.exemplo.com.br/afim',
      sourceName: 'exemplo.com.br',
      sourceId: 'https://www.exemplo.com.br/afim',
    });
    expect(hits[0].snippet.length).toBeLessThanOrEqual(TAVILY_SNIPPET_MAX);
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [429, 'RATE_LIMIT'],
    [432, 'RATE_LIMIT'],
    [433, 'RATE_LIMIT'],
    [502, 'UPSTREAM'],
    [400, 'UNKNOWN'],
  ])('HTTP %i vira erro %s', async (status, code) => {
    mockFetch(status, { detail: { error: 'x' } });
    const provider = new TavilySearchProvider(makeConfig({ TAVILY_API_KEY: 'tvly-x' }));
    await expect(provider.searchWeb(query, 'user-1', 5)).rejects.toMatchObject({ code });
  });

  it('sem chave lança CONFIG sem chamar a rede', async () => {
    const fetchFn = mockFetch(200, {});
    const provider = new TavilySearchProvider(makeConfig({}));
    await expect(provider.searchWeb(query, 'user-1', 5)).rejects.toBeInstanceOf(WebSearchProviderError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
