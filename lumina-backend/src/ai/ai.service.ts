import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChatMessageDto, AiChatRequestDto, AiChatResponseDto } from './ai.dto';
import { humanizeReasons, luminiaSystemPrompt } from './luminia-persona';

interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 800;

/** Ajustes de uma geração que foge do padrão de conversa (texto longo). */
interface GenerationOptions {
  maxTokens?: number;
  timeoutMs?: number;
  /** Padrão 0.8 (conversa). Correção pede valor baixo, para ser estável. */
  temperature?: number;
  /** Imagem (data URL) anexada à mensagem do usuário — leitura por visão. */
  imageDataUrl?: string;
  /** Modelos a tentar, em ordem, no lugar de AI_MODEL + AI_FALLBACK_MODELS. */
  models?: string[];
}

/** Resultado de uma geração fora da conversa, com o modelo que respondeu. */
export interface GenerationResult {
  text: string;
  model: string;
}

/** Modelos com entrada de imagem usados quando AI_VISION_MODELS não está definido. */
const DEFAULT_OPENROUTER_VISION_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-26b-a4b-it:free',
];

/** Provedores que podem aparecer como prefixo numa lista de modelos. */
const ROUTABLE_PROVIDERS = ['openrouter', 'gemini', 'groq', 'openai'] as const;
type RoutableProvider = (typeof ROUTABLE_PROVIDERS)[number];

/**
 * Referência a um modelo numa lista do ambiente. `gemini:gemini-3.8-flash`
 * e `groq:openai/gpt-oss-120b` apontam o provedor; sem prefixo, vale o
 * `AI_PROVIDER`. O prefixo só conta se for um provedor conhecido: nomes do
 * OpenRouter como `nvidia/x:free` têm ":" mas não começam por um.
 */
export function parseModelRef(ref: string, defaultProvider: string): { provider: string; model: string } {
  const i = ref.indexOf(':');
  const prefix = i > 0 ? ref.slice(0, i).toLowerCase() : '';
  if ((ROUTABLE_PROVIDERS as readonly string[]).includes(prefix)) return { provider: prefix, model: ref.slice(i + 1) };
  return { provider: defaultProvider, model: ref };
}

/**
 * Folga de tokens para modelos que raciocinam antes de responder e contam
 * esse raciocínio dentro de max_tokens (Gemini 2.5+/3.x, gpt-oss, Qwen 3).
 * Sem ela, o JSON da correção chega cortado.
 */
const REASONING_HEADROOM_TOKENS = 4000;

/** Espera máxima aceita num 429 antes de passar ao próximo modelo. */
const MAX_RETRY_AFTER_S = 30;
/** Espera num 429 por rajada que não diz quanto esperar. */
const DEFAULT_RATE_LIMIT_WAIT_S = 20;
/**
 * 5xx transitório (em especial o 503 "high demand" do Gemini) não significa
 * que o modelo caiu: a mesma requisição costuma passar segundos depois. Tenta
 * o mesmo modelo com estas esperas antes de gastar a vez no próximo.
 */
const TRANSIENT_RETRY_DELAYS_MS = [2_000, 5_000];
/** Plano gratuito do Gemini: 15 requisições por minuto (gemini-3.5-flash-lite). */
const DEFAULT_GEMINI_RPM = 15;
/**
 * Espera máxima por uma vaga no limite por minuto antes de trocar de modelo.
 * A janela é de 60 s, então 61 s garante a vaga (a chamada entra na fila em
 * vez de falhar). `AI_RATE_MAX_WAIT_MS` reduz isso para trocar de modelo antes.
 */
const MAX_RATE_WAIT_MS = 61_000;

type EndpointConfig = {
  url: string;
  apiKey: string;
  providerName: string;
  headers: Record<string, string>;
  extraBody?: Record<string, unknown>;
  extraBodyFor?: (model: string) => Record<string, unknown>;
  reasoningHeadroom?: number;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** Instantes das chamadas do último minuto, por provedor:modelo. */
  private readonly recentCalls = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Envia mensagem para o provedor de IA configurado.
   * Suporta: OpenAI, OpenRouter, Anthropic, Groq, ou mock para desenvolvimento.
   *
   * `context` é texto montado NO SERVIDOR (ex.: por que uma tarefa está no
   * cronograma do aluno) e entra como mensagem de sistema antes do histórico.
   * `studentFirstName` deixa a LuminIA chamar o aluno pelo nome.
   */
  async sendMessage(
    dto: AiChatRequestDto,
    context?: string,
    studentFirstName?: string | null,
  ): Promise<AiChatResponseDto> {
    const { message, history } = dto;
    const systemPrompt = luminiaSystemPrompt(studentFirstName);

    // Validação básica
    if (!message?.content?.trim()) {
      throw new BadRequestException('Mensagem vazia.');
    }
    if (message.content.length > 4000) {
      throw new BadRequestException('Mensagem muito longa (máx. 4000 caracteres).');
    }

    const provider = this.config.get<string>('AI_PROVIDER')?.toLowerCase() || 'mock';

    // O chat devolve só a mensagem: o modelo que respondeu é detalhe interno.
    const only = async (call: Promise<AiChatResponseDto>) => ({ message: (await call).message });
    switch (provider) {
      case 'openai':
        return only(this.callOpenAI(message, history, context, systemPrompt));
      case 'openrouter':
        return only(this.callOpenRouter(message, history, context, systemPrompt));
      case 'anthropic':
        return only(this.callAnthropic(message, history, context, systemPrompt));
      case 'groq':
        return only(this.callGroq(message, history, context, systemPrompt));
      case 'gemini':
        return only(this.callGemini(message, history, context, systemPrompt));
      case 'mock':
      default:
        return this.mockResponse(message, history, context);
    }
  }

  /**
   * Gera um texto fora da conversa (ex.: o resumo de teoria de um tópico),
   * com prompt de sistema próprio em vez da persona da LuminIA. Devolve null
   * quando não há provedor de IA configurado (AI_PROVIDER=mock): quem chama
   * decide o que mostrar — aqui não se inventa conteúdo de estudo.
   */
  async generateText(params: {
    system: string;
    prompt: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<string | null> {
    const provider = this.config.get<string>('AI_PROVIDER')?.toLowerCase() || 'mock';
    const message: AiChatMessageDto = { role: 'user', content: params.prompt };
    const options: GenerationOptions = { maxTokens: params.maxTokens, timeoutMs: params.timeoutMs };
    switch (provider) {
      case 'openai':
        return (await this.callOpenAI(message, [], undefined, params.system, options)).message;
      case 'openrouter':
        return (await this.callOpenRouter(message, [], undefined, params.system, options)).message;
      case 'anthropic':
        return (await this.callAnthropic(message, [], undefined, params.system, options)).message;
      case 'groq':
        return (await this.callGroq(message, [], undefined, params.system, options)).message;
      case 'gemini':
        return (await this.callGemini(message, [], undefined, params.system, options)).message;
      default:
        return null;
    }
  }

  /**
   * Geração para tarefas estruturadas (correção de redação, leitura de foto).
   * Diferente de `generateText`: aceita imagem, temperatura própria e devolve
   * qual modelo respondeu — a correção guarda isso para auditoria. Com
   * imagem, usa só modelos com entrada de imagem (`AI_VISION_MODELS`).
   * Devolve null sem provedor configurado (AI_PROVIDER=mock).
   */
  async generateStructured(params: {
    system: string;
    prompt: string;
    imageDataUrl?: string;
    maxTokens?: number;
    timeoutMs?: number;
    temperature?: number;
    /** Modelos próprios da tarefa (ex.: AI_ESSAY_MODELS); vazio = cadeia padrão. */
    models?: string[];
  }): Promise<GenerationResult | null> {
    const provider = this.config.get<string>('AI_PROVIDER')?.toLowerCase() || 'mock';
    const message: AiChatMessageDto = { role: 'user', content: params.prompt };
    const options: GenerationOptions = {
      maxTokens: params.maxTokens,
      timeoutMs: params.timeoutMs,
      temperature: params.temperature,
      imageDataUrl: params.imageDataUrl,
      models: params.models?.length ? params.models : undefined,
    };
    const vision = Boolean(params.imageDataUrl);
    const chain = vision ? this.listFromEnv('AI_VISION_MODELS') : options.models ?? [];
    // Qualquer modelo com prefixo de provedor (mesmo o do AI_PROVIDER) vai
    // pela cadeia, que tira o prefixo antes de chamar a API.
    if (provider !== 'mock' && chain.some((ref) => parseModelRef(ref, provider).model !== ref)) {
      return this.callChain(chain, provider, message, params.system, options);
    }
    let result: AiChatResponseDto & { model?: string };
    switch (provider) {
      case 'openai':
        result = await this.callOpenAI(message, [], undefined, params.system, options, vision);
        break;
      case 'openrouter':
        result = await this.callOpenRouter(message, [], undefined, params.system, options, vision);
        break;
      case 'anthropic':
        result = await this.callAnthropic(message, [], undefined, params.system, options);
        break;
      case 'groq':
        if (vision) return null;
        result = await this.callGroq(message, [], undefined, params.system, options);
        break;
      case 'gemini':
        result = await this.callGemini(message, [], undefined, params.system, options);
        break;
      default:
        return null;
    }
    return { text: result.message, model: result.model ?? provider };
  }

  /**
   * Cadeia com modelos de provedores diferentes (ex.: AI_ESSAY_MODELS =
   * "gemini:gemini-3.8-flash,groq:openai/gpt-oss-120b,nvidia/x:free").
   * Tenta em ordem; provedor sem chave é pulado. O modelo devolvido leva o
   * prefixo do provedor, para a auditoria e a calibração por modelo.
   */
  private async callChain(
    refs: string[],
    defaultProvider: string,
    message: AiChatMessageDto,
    system: string,
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    let lastError = 'nenhum provedor configurado na cadeia';
    for (const ref of refs) {
      const { provider, model } = parseModelRef(ref, defaultProvider);
      const endpoint = this.endpointFor(provider as RoutableProvider);
      if (!endpoint) {
        lastError = `${provider}: sem chave de API`;
        continue;
      }
      try {
        const result = await this.chatCompletion({ ...endpoint, models: [model], message, history: [], systemPrompt: system, options });
        return { text: result.message, model: `${provider}:${result.model ?? model}` };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    throw new BadRequestException(`Erro de IA: todos os modelos da cadeia falharam. Ultimo erro: ${lastError}`);
  }

  /** Endereço, chave e ajustes de cada provedor compatível com a API da OpenAI. */
  private endpointFor(provider: RoutableProvider): EndpointConfig | null {
    switch (provider) {
      case 'openrouter': {
        const apiKey = this.config.get<string>('OPENROUTER_API_KEY') || this.config.get<string>('OPENAI_API_KEY');
        if (!apiKey) return null;
        const configured = this.config.get<string>('OPENAI_BASE_URL')?.replace(/\/+$/, '');
        return {
          url: `${configured?.includes('openrouter') ? configured : 'https://openrouter.ai/api/v1'}/chat/completions`,
          apiKey,
          providerName: 'OpenRouter',
          headers: { 'HTTP-Referer': this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5174', 'X-Title': 'Lumina' },
          extraBody: { reasoning: { enabled: false } },
        };
      }
      case 'gemini': {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');
        if (!apiKey) return null;
        return {
          url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          apiKey,
          providerName: 'Gemini',
          headers: {},
          extraBody: { reasoning_effort: this.config.get<string>('GEMINI_REASONING_EFFORT') || 'low' },
          reasoningHeadroom: REASONING_HEADROOM_TOKENS,
        };
      }
      case 'groq': {
        const apiKey = this.config.get<string>('GROQ_API_KEY');
        if (!apiKey) return null;
        return {
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey,
          providerName: 'Groq',
          headers: {},
          extraBodyFor: (model) =>
            model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : model.startsWith('qwen/') ? { reasoning_effort: 'none' } : {},
          // O plano gratuito limita tokens por minuto CONTANDO o max_tokens
          // pedido (8 mil no gpt-oss-120b): folga grande nunca caberia.
          reasoningHeadroom: 800,
        };
      }
      case 'openai': {
        const apiKey = this.config.get<string>('OPENAI_API_KEY');
        // Com OPENAI_BASE_URL no OpenRouter, a chave é do OpenRouter, não da OpenAI.
        if (!apiKey || this.config.get<string>('OPENAI_BASE_URL')?.includes('openrouter')) return null;
        return { url: 'https://api.openai.com/v1/chat/completions', apiKey, providerName: 'OpenAI', headers: {} };
      }
      default:
        return null;
    }
  }

  /**
   * Mock para desenvolvimento — responde sem chamar API externa.
   */
  private async mockResponse(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
  ): Promise<AiChatResponseDto> {
    // Simula latência
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 500));

    // Com contexto do cronograma, o mock responde com os próprios motivos —
    // assim a explicação funciona em desenvolvimento, sem provedor externo.
    if (context) {
      const reasons = context
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2));
      return { message: humanizeReasons(reasons) };
    }

    const userMsg = message.content.toLowerCase();

    // Respostas contextuais simples
    if (userMsg.includes('olá') || userMsg.includes('oi') || userMsg.includes('hello')) {
      return { message: 'Olá! Como posso ajudar nos seus estudos hoje?' };
    }
    if (userMsg.includes('matemática') || userMsg.includes('math')) {
      return { message: 'Posso ajudar com matemática! Tem alguma dúvida específica sobre funções, geometria, álgebra ou cálculo?' };
    }
    if (userMsg.includes('redação') || userMsg.includes('ensaio')) {
      return { message: 'Sobre redação: posso explicar as competências do ENEM (C1 a C5), dar dicas de estrutura ou revisar seu texto se você colar aqui.' };
    }
    if (userMsg.includes('prova') || userMsg.includes('simulado') || userMsg.includes('enem')) {
      return { message: 'Posso ajudar com questões de provas anteriores, estratégias para o ENEM ou criar simulados personalizados.' };
    }
    if (userMsg.includes('obrigad') || userMsg.includes('valeu') || userMsg.includes('thanks')) {
      return { message: 'De nada! Bons estudos! 📚' };
    }

    // Resposta genérica útil
    return {
      message:
        'Essa é uma resposta simulada da LuminIA. Para respostas reais, configure `AI_PROVIDER` no `.env` do backend com `openrouter` (grátis), `openai`, `anthropic` ou `groq`.\n\n' +
        'Enquanto isso, posso:\n' +
        '• Explicar conceitos (ex.: "Como funciona a derivada?")\n' +
        '• Ajudar com redação (estrutura, competências ENEM)\n' +
        '• Sugerir questões para praticar\n' +
        '• Criar planos de estudo',
    };
  }

  /**
   * OpenAI (gpt-4o-mini por padrão — barato e rápido).
   */
  private async callOpenAI(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
    systemPrompt = luminiaSystemPrompt(),
    options: GenerationOptions = {},
    vision = false,
  ): Promise<AiChatResponseDto & { model?: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('OPENAI_API_KEY não configurada no ambiente.');
    }
    const model = vision
      ? this.listFromEnv('AI_VISION_MODELS')[0] || 'gpt-4o-mini'
      : this.config.get<string>('AI_MODEL') || this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    return this.chatCompletion({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey,
      models: [model],
      providerName: 'OpenAI',
      message,
      history,
      context,
      systemPrompt,
      options,
      headers: {},
    });
  }

  /**
   * OpenRouter — agregador com rota compatível com a da OpenAI e um
   * catálogo de modelos gratuitos (`:free`). Como os gratuitos respondem mal
   * sob carga (429 com frequência) e alguns gastam o orçamento de tokens
   * raciocinando, a chamada tenta os modelos de `AI_FALLBACK_MODELS` em
   * sequência até um responder de verdade.
   */
  private async callOpenRouter(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
    systemPrompt = luminiaSystemPrompt(),
    options: GenerationOptions = {},
    vision = false,
  ): Promise<AiChatResponseDto & { model?: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('OPENAI_API_KEY não configurada no ambiente.');
    }
    const baseUrl =
      this.config.get<string>('OPENAI_BASE_URL')?.replace(/\/+$/, '') ??
      'https://openrouter.ai/api/v1';
    const primary = this.config.get<string>('AI_MODEL') || 'openrouter/free';
    const fallbacks = this.listFromEnv('AI_FALLBACK_MODELS');
    const visionModels = this.listFromEnv('AI_VISION_MODELS');
    const models = vision
      ? visionModels.length
        ? visionModels
        : DEFAULT_OPENROUTER_VISION_MODELS
      : options.models ?? [primary, ...fallbacks];

    return this.chatCompletion({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      models,
      providerName: 'OpenRouter',
      message,
      history,
      context,
      systemPrompt,
      options,
      headers: {
        'HTTP-Referer': this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5174',
        'X-Title': 'Lumina',
      },
      // Os modelos gratuitos raciocinam antes de responder e gastavam o
      // orçamento de tokens inteiro nisso (resposta vazia) ou 20 s de espera
      // — num texto longo, como o resumo de teoria, nem "raciocínio curto"
      // sobrava espaço para a resposta. Para tutoria, responder direto basta.
      extraBody: { reasoning: { enabled: false } },
    });
  }

  /**
   * Uma única chamada a uma API compatível com a da OpenAI, com tentativa
   * nos modelos em sequência. Só desiste quando todos falham, e aí reporta
   * o último erro: assim o aluno não vê "Sem resposta." sem saber por quê.
   */
  private async chatCompletion(params: {
    url: string;
    apiKey: string;
    models: string[];
    providerName: string;
    message: AiChatMessageDto;
    history: AiChatMessageDto[];
    context?: string;
    systemPrompt: string;
    options: GenerationOptions;
    headers: Record<string, string>;
    /** Campos do corpo que só este provedor entende. */
    extraBody?: Record<string, unknown>;
    /** Como extraBody, mas por modelo (ex.: esforço de raciocínio no Groq). */
    extraBodyFor?: (model: string) => Record<string, unknown>;
    /** O provedor conta o raciocínio dentro de max_tokens: tokens de folga. */
    reasoningHeadroom?: number;
  }): Promise<AiChatResponseDto & { model?: string }> {
    const userContent: ProviderMessage['content'] = params.options.imageDataUrl
      ? [
          { type: 'text', text: params.message.content },
          { type: 'image_url', image_url: { url: params.options.imageDataUrl } },
        ]
      : params.message.content;
    const messages: ProviderMessage[] = [
      { role: 'system', content: params.systemPrompt },
      ...(params.context ? [{ role: 'system' as const, content: params.context }] : []),
      ...params.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ];

    let lastError = 'nenhuma tentativa executada';
    const queue = params.models.map((model) => ({ model, waited: false, transientRetries: 0 }));
    for (let q = 0; q < queue.length; q++) {
      const { model } = queue[q];
      // Ritmo por modelo (planos gratuitos limitam requisições por minuto):
      // espera a vaga; se demorar demais, a vez passa ao próximo modelo.
      if (!(await this.acquireRateSlot(params.providerName, model))) {
        lastError = `${params.providerName} ${model}: limite de requisições por minuto`;
        this.logger.warn(`${params.providerName} ${model} sem vaga no limite por minuto; tentando o proximo modelo.`);
        continue;
      }
      try {
        const response = await fetch(params.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.apiKey}`,
            ...params.headers,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: params.options.temperature ?? 0.8,
            max_tokens: (params.options.maxTokens ?? DEFAULT_MAX_TOKENS) + (params.reasoningHeadroom ?? 0),
            ...params.extraBody,
            ...params.extraBodyFor?.(model),
          }),
          // Modelo gratuito às vezes aceita a conexão e não responde: sem
          // limite, a conversa do aluno ficava pendurada para sempre. O
          // estouro cai no catch e a vez passa para o próximo modelo.
          signal: AbortSignal.timeout(params.options.timeoutMs ?? this.requestTimeoutMs()),
        });

        if (!response.ok) {
          const raw = await response.text();
          lastError = `${response.status} ${raw.slice(0, 200)}`;
          // Limite por minuto (Groq e Gemini gratuitos): se o provedor diz
          // que libera em poucos segundos, espera uma vez e tenta o mesmo
          // modelo antes de cair para o próximo.
          // No Gemini e no Groq, 429 sem prazo e que não é cota diária =
          // rajada acima do limite por minuto: espera um intervalo padrão. No
          // OpenRouter, 429 costuma ser o provedor do modelo sobrecarregado: a
          // vez passa logo ao próximo modelo (o chat não pode ficar esperando).
          const burstLimited = params.providerName === 'Gemini' || params.providerName === 'Groq';
          const retryAfter =
            response.status === 429
              ? this.retryAfterSeconds(response, raw) ?? (burstLimited && !/per ?day|PerDay|daily/i.test(raw) ? DEFAULT_RATE_LIMIT_WAIT_S : null)
              : null;
          if (retryAfter !== null && retryAfter <= MAX_RETRY_AFTER_S && !queue[q].waited) {
            queue[q].waited = true;
            this.logger.warn(`${params.providerName} ${model} pediu ${retryAfter}s de espera (429); aguardando.`);
            await new Promise((r) => setTimeout(r, Math.ceil(retryAfter * 1000) + 250));
            q--;
            continue;
          }
          const transient = response.status === 502 || response.status === 503 || response.status === 504;
          if (transient && queue[q].transientRetries < TRANSIENT_RETRY_DELAYS_MS.length) {
            const delay = TRANSIENT_RETRY_DELAYS_MS[queue[q].transientRetries];
            queue[q].transientRetries += 1;
            this.logger.warn(
              `${params.providerName} ${model} respondeu ${response.status}; nova tentativa no mesmo modelo em ${delay}ms.`,
            );
            await new Promise((r) => setTimeout(r, delay));
            q--;
            continue;
          }
          this.logger.warn(
            `${params.providerName} ${model} respondeu ${response.status}; tentando o proximo modelo.`,
          );
          continue;
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string | null }; finish_reason?: string }[];
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return { message: content, model };
        }

        // Resposta 200 sem texto: o modelo gastou o orçamento com raciocínio
        // (finish_reason "length") ou devolveu null. Conta como falha.
        lastError = `resposta vazia (finish_reason=${data.choices?.[0]?.finish_reason ?? 'desconhecido'})`;
        this.logger.warn(`${params.providerName} ${model} devolveu vazio; tentando o proximo modelo.`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `${params.providerName} ${model} lancou ${lastError}; tentando o proximo modelo.`,
        );
      }
    }

    throw new BadRequestException(
      `Erro ${params.providerName}: todos os modelos falharam. Ultimo erro: ${lastError}`,
    );
  }

  /**
   * Anthropic (Claude 3 Haiku — rápido e barato).
   */
  private async callAnthropic(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
    systemPrompt = luminiaSystemPrompt(),
    options: GenerationOptions = {},
  ): Promise<AiChatResponseDto & { model?: string }> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';

    if (!apiKey) {
      throw new BadRequestException('ANTHROPIC_API_KEY não configurada no ambiente.');
    }

    const image = options.imageDataUrl?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    const userContent = image
      ? [
          { type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } },
          { type: 'text', text: message.content },
        ]
      : message.content;
    const messages = [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? this.requestTimeoutMs()),
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? 0.7,
        system: context ? `${systemPrompt}\n\n${context}` : systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new BadRequestException(`Erro Anthropic: ${response.status} ${JSON.stringify(err)}`);
    }

    const data = (await response.json()) as {
      content: { text: string }[];
    };

    return { message: data.content[0]?.text?.trim() ?? 'Sem resposta.', model };
  }

  /**
   * Requisições por minuto permitidas para um modelo. `AI_RPM_LIMITS` =
   * "gemini:gemini-3.5-flash-lite=15,groq:openai/gpt-oss-120b=8" (o nome do
   * provedor sozinho vale para todos os modelos dele). Padrão: 15 no Gemini
   * (plano gratuito); sem limite nos demais.
   */
  private rpmLimit(providerName: string, model: string): number | null {
    const provider = providerName.toLowerCase();
    const entries = new Map(
      this.listFromEnv('AI_RPM_LIMITS').map((item) => {
        const i = item.lastIndexOf('=');
        return [item.slice(0, i).trim().toLowerCase(), Number(item.slice(i + 1))] as const;
      }),
    );
    const value = entries.get(`${provider}:${model.toLowerCase()}`) ?? entries.get(provider) ?? (provider === 'gemini' ? DEFAULT_GEMINI_RPM : null);
    return value && Number.isFinite(value) && value > 0 ? value : null;
  }

  /** Reserva uma vaga na janela de 60 s do modelo; false se a espera passar do máximo. */
  private async acquireRateSlot(providerName: string, model: string): Promise<boolean> {
    const rpm = this.rpmLimit(providerName, model);
    if (!rpm) return true;
    const key = `${providerName}:${model}`;
    let budget = Number(this.config.get<string>('AI_RATE_MAX_WAIT_MS')) || MAX_RATE_WAIT_MS;
    for (;;) {
      const now = Date.now();
      const recent = (this.recentCalls.get(key) ?? []).filter((t) => now - t < 60_000);
      if (recent.length < rpm) {
        recent.push(now);
        this.recentCalls.set(key, recent);
        return true;
      }
      const wait = 60_000 - (now - recent[0]) + 50;
      if (wait > budget) return false;
      budget -= wait;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  /** Segundos até o provedor liberar: cabeçalho Retry-After ou o texto do erro. */
  private retryAfterSeconds(response: Response, body: string): number | null {
    const header = Number(response.headers.get('retry-after'));
    if (Number.isFinite(header) && header > 0) return header;
    const groq = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(body);
    if (groq) return Number(groq[1] ?? 0) * 60 + Number(groq[2]);
    const gemini = /"retryDelay":\s*"([\d.]+)s"/.exec(body) ?? /retry in ([\d.]+)s/i.exec(body);
    if (gemini) return Number(gemini[1]);
    return null;
  }

  /** Lista separada por vírgula vinda do ambiente (ex.: AI_FALLBACK_MODELS). */
  private listFromEnv(key: string): string[] {
    return (this.config.get<string>(key) ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  /** Tempo máximo de espera por UMA chamada ao provedor (`AI_TIMEOUT_MS`). */
  private requestTimeoutMs(): number {
    const configured = Number(this.config.get<string>('AI_TIMEOUT_MS'));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Groq (Llama 3.1, Mixtral, Gemma — API compatível OpenAI, grátis e rápido).
   */
  private async callGroq(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
    systemPrompt = luminiaSystemPrompt(),
    options: GenerationOptions = {},
  ): Promise<AiChatResponseDto & { model?: string }> {
    const endpoint = this.endpointFor('groq');
    if (!endpoint) {
      throw new BadRequestException('GROQ_API_KEY não configurada no ambiente.');
    }
    // GROQ_MODEL aceita lista separada por vírgula, tentada em ordem.
    const models = options.models ?? this.listFromEnv('GROQ_MODEL');
    return this.chatCompletion({
      ...endpoint,
      models: models.length ? models : ['openai/gpt-oss-120b'],
      message,
      history,
      context,
      systemPrompt,
      options,
    });
  }

  /**
   * Google Gemini pela rota compatível com a da OpenAI. `GEMINI_MODEL`
   * aceita lista separada por vírgula, tentada em ordem.
   */
  private async callGemini(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
    context?: string,
    systemPrompt = luminiaSystemPrompt(),
    options: GenerationOptions = {},
  ): Promise<AiChatResponseDto & { model?: string }> {
    const endpoint = this.endpointFor('gemini');
    if (!endpoint) {
      throw new BadRequestException('GEMINI_API_KEY não configurada no ambiente.');
    }
    const models = options.models ?? this.listFromEnv('GEMINI_MODEL');
    return this.chatCompletion({
      ...endpoint,
      models: models.length ? models : ['gemini-3.5-flash'],
      message,
      history,
      context,
      systemPrompt,
      options,
    });
  }
}