import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import './search-provider.error';
import { WebSearchProviderError, WEB_SEARCH_PROVIDER_TIMEOUT_MS } from './search-provider.error';
import {
  WebSearchHit,
  WebSearchProvider,
  WebSearchQuery,
} from './search-provider.interface';

/** Resposta bruta do Google Programmable Search Engine (CSE) JSON API —
 * https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list */
interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface GoogleCseListResponse {
  items?: GoogleCseItem[];
  error?: { code?: number; message?: string; errors?: { reason?: string }[] };
}

/** Provedor REAL de busca: Google Programmable Search Engine (antigo CSE).
 *
 * Só é usado quando as chaves GOOGLE_CSE_ID/GOOGLE_CSE_API_KEY existem no
 * ambiente (isConfigured() = true). Sem elas, a SearchService cai no modo
 * demonstração e o response explicita `provider=demo`.
 *
 * Direitos autorais: guardamos APENAS metadados públicos do resultado
 * (title/link/snippet + displayLink como atribuição de domínio) — o
 * conteúdo integral das questões é transcrito pelo usuário no momento de
 * salvar, com sourceName/sourceId (link) sempre preservados. Nunca
 * baixamos nem cacheamos o texto integral de páginas de terceiros. */
@Injectable()
export class GoogleCseSearchProvider implements WebSearchProvider {
  readonly name = 'google-cse' as const;
  private readonly logger = new Logger(GoogleCseSearchProvider.name);
  private readonly baseUrl =
    'https://www.googleapis.com/customsearch/v1?key={KEY}&cx={CX}&q={Q}&num={LIMIT}';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('GOOGLE_CSE_ID') &&
        this.configService.get<string>('GOOGLE_CSE_API_KEY'),
    );
  }

  private buildSearchUrl(query: WebSearchQuery, limit: number): string {
    const key = this.configService.get<string>('GOOGLE_CSE_API_KEY') ?? '';
    const cx = this.configService.get<string>('GOOGLE_CSE_ID') ?? '';
    const q = [
      query.q,
      query.exam,
      query.subject,
      query.topic,
    ]
      .filter(Boolean)
      .join(' ');
    return this.baseUrl
      .replace('{KEY}', encodeURIComponent(key))
      .replace('{CX}', encodeURIComponent(cx))
      .replace('{Q}', encodeURIComponent(q))
      .replace('{LIMIT}', String(Math.min(limit, 10)));
  }

  private mapItems(items: GoogleCseItem[]): WebSearchHit[] {
    return items.map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      snippet: item.snippet ?? '',
      sourceName: item.displayLink ?? undefined,
      sourceId: item.link ?? undefined,
    }));
  }

  async searchWeb(
    query: WebSearchQuery,
    _userId: string,
    limit: number,
  ): Promise<WebSearchHit[]> {
    if (!this.isConfigured()) {
      throw new WebSearchProviderError(
        'CONFIG',
        'Google CSE não configurado (GOOGLE_CSE_ID/GOOGLE_CSE_API_KEY ausentes).',
      );
    }

    const url = this.buildSearchUrl(query, Math.min(limit, 10));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEB_SEARCH_PROVIDER_TIMEOUT_MS);

    let res: globalThis.Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (error) {
      const cause = error as Error;
      if (cause?.name === 'AbortError') {
        throw new WebSearchProviderError(
          'TIMEOUT',
          `Google CSE excedeu ${WEB_SEARCH_PROVIDER_TIMEOUT_MS}ms.`,
        );
      }
      throw new WebSearchProviderError(
        'UNKNOWN',
        `Falha de rede ao chamar Google CSE: ${cause?.message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      throw new WebSearchProviderError(
        'RATE_LIMIT',
        'Quota do Google CSE esgotada (HTTP 429).',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new WebSearchProviderError(
        'UNAUTHORIZED',
        `Google CSE rejeitou as chaves (HTTP ${res.status}).`,
      );
    }
    if (res.status >= 500) {
      throw new WebSearchProviderError(
        'UPSTREAM',
        `Google CSE indisponível (HTTP ${res.status}).`,
      );
    }
    if (!res.ok) {
      throw new WebSearchProviderError(
        'UNKNOWN',
        `Google CSE retornou HTTP ${res.status}.`,
      );
    }

    let body: GoogleCseListResponse;
    try {
      body = (await res.json()) as GoogleCseListResponse;
    } catch (error) {
      throw new WebSearchProviderError(
        'UNKNOWN',
        `Resposta inválida do Google CSE: ${(error as Error)?.message}`,
      );
    }
    if (body.error) {
      throw new WebSearchProviderError(
        'RATE_LIMIT',
        `Erro do Google CSE: ${body.error.message ?? body.error.code}`,
      );
    }
    return this.mapItems(body.items ?? []);
  }
}
