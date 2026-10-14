/** Erro operacional de um provedor de busca web. `code` permite o
 * controller decidir o HTTP status e o cliente exibir mensagem clara:
 *  - CONFIG: provedor sem configuração (chaves ausentes)
 *  - RATE_LIMIT: quota esgotada (429 do Google)
 *  - UNAUTHORIZED: chaves rejeitadas (401/403)
 *  - UPSTREAM: provedor indisponível (5xx)
 *  - TIMEOUT: AbortController disparou antes da resposta
 *  - UNKNOWN: outra falha inesperada */
export class WebSearchProviderError extends Error {
  constructor(
    readonly code:
      | 'CONFIG'
      | 'RATE_LIMIT'
      | 'UNAUTHORIZED'
      | 'UPSTREAM'
      | 'TIMEOUT'
      | 'UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'WebSearchProviderError';
  }
}

/** Timeout padrão para chamadas HTTP ao provedor (6s). */
export const WEB_SEARCH_PROVIDER_TIMEOUT_MS = 6000;
