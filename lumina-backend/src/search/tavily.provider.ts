import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSearchProviderError } from './search-provider.error';
import { WebSearchHit, WebSearchProvider, WebSearchQuery } from './search-provider.interface';

/** Resposta da Tavily Search API — https://docs.tavily.com/documentation/api-reference/endpoint/search */
interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilyResult[];
  detail?: { error?: string } | string;
}

/** A Tavily costuma responder em 1–3 s, mas a busca é mais lenta que a do Google. */
export const TAVILY_TIMEOUT_MS = 10000;
/** Tamanho máximo do trecho devolvido: só um resumo, nunca a página inteira. */
export const TAVILY_SNIPPET_MAX = 300;

/** Provedor REAL de busca: Tavily (preferido quando TAVILY_API_KEY existe).
 *
 * Mesma política do Google CSE: devolvemos só metadados públicos (título,
 * link, trecho curto e o domínio como atribuição). A Tavily manda um resumo
 * do conteúdo da página em `content`; cortamos em TAVILY_SNIPPET_MAX
 * caracteres e não guardamos nada — o texto da questão é transcrito pelo
 * usuário ao salvar, com o link original preservado. */
@Injectable()
export class TavilySearchProvider implements WebSearchProvider {
  readonly name = 'tavily' as const;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  private apiKey(): string {
    return this.configService.get<string>('TAVILY_API_KEY')?.trim() ?? '';
  }

  private baseUrl(): string {
    return (this.configService.get<string>('TAVILY_BASE_URL')?.trim() || 'https://api.tavily.com').replace(/\/+$/, '');
  }

  /** Mesmo critério do Google CSE: o texto livre mais os filtros escolhidos. */
  static buildQuery(query: WebSearchQuery): string {
    return [query.q, query.exam, query.subject, query.topic].filter(Boolean).join(' ');
  }

  static snippet(content: string): string {
    const clean = content.replace(/\s+/g, ' ').trim();
    return clean.length > TAVILY_SNIPPET_MAX ? `${clean.slice(0, TAVILY_SNIPPET_MAX - 1).trimEnd()}…` : clean;
  }

  static sourceName(url: string): string | undefined {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  private mapResults(results: TavilyResult[]): WebSearchHit[] {
    return results
      .filter((item) => item.url)
      .map((item) => ({
        title: item.title?.trim() || item.url!,
        link: item.url!,
        snippet: TavilySearchProvider.snippet(item.content ?? ''),
        sourceName: TavilySearchProvider.sourceName(item.url!),
        sourceId: item.url!,
      }));
  }

  async searchWeb(query: WebSearchQuery, _userId: string, limit: number): Promise<WebSearchHit[]> {
    if (!this.isConfigured()) {
      throw new WebSearchProviderError('CONFIG', 'Tavily não configurada (TAVILY_API_KEY ausente).');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
    let res: globalThis.Response;
    try {
      res = await fetch(`${this.baseUrl()}/search`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: TavilySearchProvider.buildQuery(query),
          max_results: Math.max(1, Math.min(limit, 20)),
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        }),
      });
    } catch (error) {
      const cause = error as Error;
      if (cause?.name === 'AbortError') {
        throw new WebSearchProviderError('TIMEOUT', `Tavily excedeu ${TAVILY_TIMEOUT_MS}ms.`);
      }
      throw new WebSearchProviderError('UNKNOWN', `Falha de rede ao chamar a Tavily: ${cause?.message}`);
    } finally {
      clearTimeout(timer);
    }

    // 429 = muitas requisições; 432/433 = limite do plano ou de gasto atingido.
    if (res.status === 429 || res.status === 432 || res.status === 433) {
      throw new WebSearchProviderError('RATE_LIMIT', `Limite da Tavily atingido (HTTP ${res.status}).`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new WebSearchProviderError('UNAUTHORIZED', `Tavily rejeitou a chave (HTTP ${res.status}).`);
    }
    if (res.status >= 500) {
      throw new WebSearchProviderError('UPSTREAM', `Tavily indisponível (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      throw new WebSearchProviderError('UNKNOWN', `Tavily retornou HTTP ${res.status}.`);
    }

    let body: TavilySearchResponse;
    try {
      body = (await res.json()) as TavilySearchResponse;
    } catch (error) {
      throw new WebSearchProviderError('UNKNOWN', `Resposta inválida da Tavily: ${(error as Error)?.message}`);
    }
    return this.mapResults(body.results ?? []).slice(0, limit);
  }
}
