/**
 * Cliente mínimo da API v3 do Asaas (https://docs.asaas.com/).
 *
 * - Autenticação pelo header `access_token`; o Asaas exige User-Agent para
 *   contas criadas a partir de 13/06/2024.
 * - Sandbox e produção têm URLs e chaves diferentes (chaves `$aact_hmlg_` e
 *   `$aact_prod_`): ASAAS_ENVIRONMENT escolhe a URL.
 * - A Lumina nunca recebe dados de cartão: o aluno paga na página hospedada
 *   do Asaas (`invoiceUrl` da cobrança).
 */
import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export type AsaasBillingType = 'UNDEFINED' | 'BOLETO' | 'CREDIT_CARD' | 'PIX';

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
}

export interface AsaasCustomer {
  id: string;
}

export interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate?: string;
}

export interface AsaasPayment {
  id: string;
  subscription?: string | null;
  status: string;
  value?: number;
  dueDate?: string;
  invoiceUrl?: string | null;
}

const BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const;

/** Lê a configuração; null quando a cobrança ainda não foi configurada. */
export function asaasConfigFromEnv(env: Record<string, string | undefined> = process.env): AsaasConfig | null {
  const apiKey = env.ASAAS_API_KEY?.trim();
  if (!apiKey) return null;
  const environment = env.ASAAS_ENVIRONMENT?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
  return { apiKey, baseUrl: BASE_URLS[environment], userAgent: 'Lumina/1.0' };
}

export class AsaasError extends HttpException {
  constructor(message: string, readonly upstreamStatus?: number) {
    super(message, HttpStatus.BAD_GATEWAY);
  }
}

export class AsaasClient {
  private readonly logger = new Logger(AsaasClient.name);

  constructor(
    private readonly config: AsaasConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          access_token: this.config.apiKey,
          'User-Agent': this.config.userAgent,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.logger.warn(`Asaas ${method} ${path} falhou: ${error instanceof Error ? error.message : error}`);
      throw new AsaasError('Não foi possível falar com o provedor de pagamento. Tente de novo em instantes.');
    }
    const text = await response.text();
    let data: unknown = {};
    try {
      data = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      // Página de erro em HTML (ex.: proxy): trata como resposta sem corpo.
    }
    if (!response.ok) {
      // O Asaas devolve { errors: [{ code, description }] }; a descrição é
      // segura para mostrar (ex.: CPF inválido).
      const description = (data as { errors?: { description?: string }[] })?.errors?.[0]?.description;
      this.logger.warn(`Asaas ${method} ${path} → ${response.status}: ${description ?? text.slice(0, 200)}`);
      throw new AsaasError(description ?? 'O provedor de pagamento recusou a operação.', response.status);
    }
    return data as T;
  }

  createCustomer(input: { name: string; email: string; cpfCnpj: string; externalReference: string }): Promise<AsaasCustomer> {
    return this.request('POST', '/customers', input);
  }

  createSubscription(input: {
    customer: string;
    billingType: AsaasBillingType;
    value: number;
    nextDueDate: string;
    cycle: 'MONTHLY';
    description: string;
    externalReference: string;
  }): Promise<AsaasSubscription> {
    return this.request('POST', '/subscriptions', input);
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    const list = await this.request<{ data?: AsaasPayment[] }>('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
    return list.data ?? [];
  }

  /** Encerra a recorrência; cobranças pendentes da assinatura são removidas. */
  deleteSubscription(subscriptionId: string): Promise<{ deleted: boolean; id: string }> {
    return this.request('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }
}
