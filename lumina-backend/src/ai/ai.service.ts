import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChatMessageDto, AiChatRequestDto, AiChatResponseDto } from './ai.dto';
import { humanizeReasons, luminiaSystemPrompt } from './luminia-persona';

interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

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

    switch (provider) {
      case 'openai':
        return this.callOpenAI(message, history, context, systemPrompt);
      case 'openrouter':
        return this.callOpenRouter(message, history, context, systemPrompt);
      case 'anthropic':
        return this.callAnthropic(message, history, context, systemPrompt);
      case 'groq':
        return this.callGroq(message, history, context, systemPrompt);
      case 'mock':
      default:
        return this.mockResponse(message, history, context);
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
  ): Promise<AiChatResponseDto> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('OPENAI_API_KEY não configurada no ambiente.');
    }
    const model = this.config.get<string>('AI_MODEL') || this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    return this.chatCompletion({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey,
      models: [model],
      providerName: 'OpenAI',
      message,
      history,
      context,
      systemPrompt,
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
  ): Promise<AiChatResponseDto> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('OPENAI_API_KEY não configurada no ambiente.');
    }
    const baseUrl =
      this.config.get<string>('OPENAI_BASE_URL')?.replace(/\/+$/, '') ??
      'https://openrouter.ai/api/v1';
    const primary = this.config.get<string>('AI_MODEL') || 'openrouter/free';
    const fallbacks = (this.config.get<string>('AI_FALLBACK_MODELS') ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    return this.chatCompletion({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      models: [primary, ...fallbacks],
      providerName: 'OpenRouter',
      message,
      history,
      context,
      systemPrompt,
      headers: {
        'HTTP-Referer': this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5174',
        'X-Title': 'Lumina',
      },
      // Os modelos gratuitos raciocinam antes de responder e gastavam o
      // orçamento de tokens nisso (resposta vazia) ou 20 s de espera. Para
      // uma conversa de tutoria, raciocínio curto basta — e a resposta chega
      // em poucos segundos.
      extraBody: { reasoning: { effort: 'low', exclude: true } },
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
    headers: Record<string, string>;
    /** Campos do corpo que só este provedor entende. */
    extraBody?: Record<string, unknown>;
  }): Promise<AiChatResponseDto> {
    const messages: ProviderMessage[] = [
      { role: 'system', content: params.systemPrompt },
      ...(params.context ? [{ role: 'system' as const, content: params.context }] : []),
      ...params.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: params.message.content },
    ];

    let lastError = 'nenhuma tentativa executada';
    for (const model of params.models) {
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
            temperature: 0.8,
            max_tokens: 800,
            ...params.extraBody,
          }),
          // Modelo gratuito às vezes aceita a conexão e não responde: sem
          // limite, a conversa do aluno ficava pendurada para sempre. O
          // estouro cai no catch e a vez passa para o próximo modelo.
          signal: AbortSignal.timeout(this.requestTimeoutMs()),
        });

        if (!response.ok) {
          const raw = await response.text();
          lastError = `${response.status} ${raw.slice(0, 200)}`;
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
          return { message: content };
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
  ): Promise<AiChatResponseDto> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const model = this.config.get<string>('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';

    if (!apiKey) {
      throw new BadRequestException('ANTHROPIC_API_KEY não configurada no ambiente.');
    }

    const messages = [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.content },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs()),
      body: JSON.stringify({
        model,
        max_tokens: 800,
        temperature: 0.7,
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

    return { message: data.content[0]?.text?.trim() ?? 'Sem resposta.' };
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
  ): Promise<AiChatResponseDto> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('GROQ_API_KEY não configurada no ambiente.');
    }
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.1-70b-versatile';
    return this.chatCompletion({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey,
      models: [model],
      providerName: 'Groq',
      message,
      history,
      context,
      systemPrompt,
      headers: {},
    });
  }
}