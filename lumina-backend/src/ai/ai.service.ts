import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChatMessageDto, AiChatRequestDto, AiChatResponseDto } from './ai.dto';

interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ProviderResponse {
  content: string;
}

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Envia mensagem para o provedor de IA configurado.
   * Suporta: OpenAI (gpt-4o-mini), Anthropic (claude-3-haiku), ou mock para desenvolvimento.
   */
  async sendMessage(dto: AiChatRequestDto): Promise<AiChatResponseDto> {
    const { message, history } = dto;

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
        return this.callOpenAI(message, history);
      case 'anthropic':
        return this.callAnthropic(message, history);
      case 'mock':
      default:
        return this.mockResponse(message, history);
    }
  }

  /**
   * Mock para desenvolvimento — responde sem chamar API externa.
   */
  private async mockResponse(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
  ): Promise<AiChatResponseDto> {
    // Simula latência
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 500));

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
        'Essa é uma resposta simulada da LuminIA. Para respostas reais, configure `AI_PROVIDER=openai` ou `AI_PROVIDER=anthropic` no `.env` com sua chave de API.\n\n' +
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
  ): Promise<AiChatResponseDto> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    if (!apiKey) {
      throw new BadRequestException('OPENAI_API_KEY não configurada no ambiente.');
    }

    const messages: ProviderMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.content },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new BadRequestException(`Erro OpenAI: ${response.status} ${JSON.stringify(err)}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return { message: data.choices[0]?.message?.content?.trim() ?? 'Sem resposta.' };
  }

  /**
   * Anthropic (Claude 3 Haiku — rápido e barato).
   */
  private async callAnthropic(
    message: AiChatMessageDto,
    history: AiChatMessageDto[],
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
      body: JSON.stringify({
        model,
        max_tokens: 800,
        temperature: 0.7,
        system: this.getSystemPrompt(),
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

  private getSystemPrompt(): string {
    return `Você é a LuminIA, assistente de estudos do app Lumina.
- Responda em português do Brasil.
- Seja conciso, didático e encorajador.
- Foque em ENEM, vestibulares brasileiros e ensino médio.
- Não invente fatos; se não souber, diga que não sabe.
- Não forneça respostas de questões de prova atuais (ética).
- Para redação, use as competências do ENEM (C1 a C5).`;
  }
}