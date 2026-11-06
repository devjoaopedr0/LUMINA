import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';

describe('AiService', () => {
  // Um spy de fetch que vaza para o teste seguinte faz o teste "openai usa
  // AI_MODEL" herdar a URL do openrouter e falhar por motivo errado.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  let service: AiService;
  let configService: any;

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'AI_PROVIDER') return 'mock';
        return undefined;
      }),
    };
    service = new AiService(configService);
  });

  describe('sendMessage', () => {
    it('deve lançar erro se mensagem estiver vazia', async () => {
      await expect(
        service.sendMessage({
          message: { role: 'user', content: '' },
          history: [],
        }),
      ).rejects.toThrow('Mensagem vazia.');
    });

    it('deve lançar erro se mensagem for muito longa', async () => {
      await expect(
        service.sendMessage({
          message: { role: 'user', content: 'a'.repeat(4001) },
          history: [],
        }),
      ).rejects.toThrow('Mensagem muito longa');
    });

    it('deve responder com mock quando AI_PROVIDER=mock', async () => {
      const res = await service.sendMessage({
        message: { role: 'user', content: 'Olá' },
        history: [],
      });
      expect(typeof res.message).toBe('string');
      expect(res.message.length).toBeGreaterThan(0);
    });

    it('deve responder contextualmente para saudações', async () => {
      const res = await service.sendMessage({
        message: { role: 'user', content: 'Oi, tudo bem?' },
        history: [],
      });
      expect(res.message.toLowerCase()).toMatch(/olá|ajudar|estudos/);
    });

    it('deve responder contextualmente para matemática', async () => {
      const res = await service.sendMessage({
        message: { role: 'user', content: 'Tenho dúvida de matemática' },
        history: [],
      });
      expect(res.message.toLowerCase()).toMatch(/matemática|funç|geometria|álgebra|cálculo/);
    });

    it('deve responder contextualmente para redação', async () => {
      const res = await service.sendMessage({
        message: { role: 'user', content: 'Preciso de ajuda com redação' },
        history: [],
      });
      expect(res.message.toLowerCase()).toMatch(/redação|competên|estrutura/);
    });

    it('deve incluir histórico na resposta mock', async () => {
      const history = [
        { id: '1', role: 'user' as const, content: 'Qual a capital do Brasil?' },
        { id: '2', role: 'assistant' as const, content: 'A capital é Brasília.' },
      ];
      const res = await service.sendMessage({
        message: { role: 'user', content: 'E a população?' },
        history,
      });
      expect(typeof res.message).toBe('string');
    });
  });

  describe('contexto do cronograma (LuminIA explica a tarefa)', () => {
    const question = { message: { role: 'user' as const, content: 'Por que essa tarefa está no meu dia?' }, history: [] };
    const context = [
      'Contexto do cronograma do aluno:',
      'Tarefa: "Questões — Ondas" — 40 minutos em 20/10.',
      'Motivos de a tarefa estar no dia:',
      '- Seu domínio nesse tópico está em 35%.',
      '- Você está na fase de Consolidação.',
    ].join('\n');

    it('o mock responde com os próprios motivos, sem provedor externo', async () => {
      const res = await service.sendMessage(question, context);
      // Mesmo sem provedor, a explicação sai como conversa, não como lista.
      expect(res.message).toBe(
        'O principal motivo: seu domínio nesse tópico está em 35%.\n\n' +
        'Além disso, você está na fase de Consolidação.\n\n' +
        'Faz sentido para você? Se quiser trocar o dia, é só usar o "Reagendar" na tarefa.',
      );
    });

    it('o mock não confunde o contexto da questão com o do cronograma', async () => {
      const res = await service.sendMessage(
        question,
        'CONTEXTO DA QUESTÃO (dados do sistema):\nEnunciado:\n2 + 2 = ?',
      );

      expect(res.message).toContain('modo de demonstração');
      expect(res.message).not.toContain('Reagendar');
    });

    it('o prompt de sistema traz a persona, a conversa-modelo e o nome do aluno', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'Oi, Ana.' } }] }), { status: 200 }),
      );
      const real = new AiService({
        get: vi.fn((key: string) => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } as Record<string, string>)[key]),
      } as never);
      await real.sendMessage(question, undefined, 'Ana');
      const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
      const system = body.messages[0].content as string;
      expect(system).toContain('Você é a LuminIA, a tutora de estudos do app Lumina');
      expect(system).toContain('O aluno se chama Ana.');
      expect(system).toContain('Aluno: to muito atrasado, acho que não vai dar tempo');
      expect(system).toContain('os fatos e números deles são ilustrativos');
    });

    it('anthropic recebe o prompt de sistema junto com o contexto', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ content: [{ text: 'Porque é a base.' }] }), { status: 200 }),
      );
      const real = new AiService({
        get: vi.fn((key: string) => ({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' } as Record<string, string>)[key]),
      } as never);
      await real.sendMessage(question, context);
      const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
      expect(body.system).toContain('Você é a LuminIA');
      expect(body.system.endsWith(context)).toBe(true);
    });

    it('nos provedores reais o contexto entra como mensagem de sistema, antes do histórico', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'Porque seu domínio está baixo.' } }] }), { status: 200 }),
      );
      const real = new AiService({
        get: vi.fn((key: string) => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } as Record<string, string>)[key]),
      } as never);
      await real.sendMessage({ ...question, history: [{ role: 'assistant', content: 'Olá!' }] }, context);

      const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'system', 'assistant', 'user']);
      expect(body.messages[1].content).toBe(context);
    });

    it('sem contexto nada muda na conversa', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'Oi.' } }] }), { status: 200 }),
      );
      const real = new AiService({
        get: vi.fn((key: string) => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } as Record<string, string>)[key]),
      } as never);
      await real.sendMessage(question);
      const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
    });
  });

  describe('tempo-limite do provedor', () => {
    const prompt = { message: { role: 'user' as const, content: 'explique Hardy-Weinberg' }, history: [] };
    const withConfig = (values: Record<string, string | undefined>) =>
      new AiService({ get: vi.fn((key: string) => values[key]) } as never);
    const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

    it('toda chamada sai com um sinal de cancelamento', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
      );
      await withConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_TIMEOUT_MS: '1500' }).sendMessage(prompt);
      expect((fetchSpy.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
    });

    it('modelo que não responde a tempo cede a vez ao próximo', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(timeoutError())
        .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Resposta do segundo.' } }] }), { status: 200 }));
      const service = withConfig({ AI_PROVIDER: 'openrouter', OPENAI_API_KEY: 'sk-or-test', AI_MODEL: 'lento', AI_FALLBACK_MODELS: 'rapido' });
      await expect(service.sendMessage(prompt)).resolves.toEqual({ message: 'Resposta do segundo.' });
    });

    it('quando todos estouram, o erro diz que foi tempo-limite em vez de pendurar', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeoutError());
      const service = withConfig({ AI_PROVIDER: 'openrouter', OPENAI_API_KEY: 'sk-or-test', AI_MODEL: 'lento' });
      await expect(service.sendMessage(prompt)).rejects.toThrow(/timeout/);
    });
  });

  describe('provedores reais', () => {
    function withConfig(values: Record<string, string | undefined>) {
      const configService = { get: vi.fn((key: string) => values[key]) };
      return new AiService(configService as never);
    }

    const prompt = { message: { role: 'user' as const, content: 'explique Hardy-Weinberg' }, history: [] };

    it('recusa provider desconhecido com mensagem de erro, não mock silencioso', async () => {
      const service = withConfig({ AI_PROVIDER: 'openrouter' });
      await expect(service.sendMessage(prompt)).rejects.toThrow('OPENAI_API_KEY');
    });

    it('openrouter chama a base URL configurada e devolve o texto do modelo', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Lei de Hardy-Weinberg.' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const service = withConfig({
        AI_PROVIDER: 'openrouter',
        OPENAI_API_KEY: 'sk-or-test',
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        AI_MODEL: 'nvidia/nemotron-3-super-120b-a12b:free',
      });

      await expect(service.sendMessage(prompt)).resolves.toEqual({
        message: 'Lei de Hardy-Weinberg.',
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
      expect((init.headers as Record<string, string>)['X-Title']).toBe('Lumina');
      expect(JSON.parse(String(init.body)).model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
      // Sem raciocínio: o modelo gratuito responde em segundos em vez de
      // gastar os tokens pensando.
      expect(JSON.parse(String(init.body)).reasoning).toEqual({ enabled: false });
      fetchSpy.mockRestore();
    });

    it('cai no próximo modelo quando o primeiro dá 429, e o usuário não vê erro', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('{"error":{"message":"Provider returned error"}}', { status: 429 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Resposta do segundo modelo.' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const service = withConfig({
        AI_PROVIDER: 'openrouter',
        OPENAI_API_KEY: 'sk-or-test',
        AI_MODEL: 'modelo-que-cai',
        AI_FALLBACK_MODELS: 'modelo-que-da-certo',
      });

      await expect(service.sendMessage(prompt)).resolves.toEqual({
        message: 'Resposta do segundo modelo.',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(JSON.parse(String(secondInit.body)).model).toBe('modelo-que-da-certo');
    });

    it('repete o mesmo modelo quando o provedor responde 503 transitório', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('{"error":{"message":"high demand"}}', { status: 503 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Resposta depois do 503.' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const service = withConfig({
        AI_PROVIDER: 'openrouter',
        OPENAI_API_KEY: 'sk-or-test',
        AI_MODEL: 'modelo-instavel',
      });

      const pending = service.sendMessage(prompt);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual({ message: 'Resposta depois do 503.' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(JSON.parse(String(secondInit.body)).model).toBe('modelo-instavel');
      vi.useRealTimers();
      fetchSpy.mockRestore();
    });

    it('trata resposta 200 sem texto como falha e tenta o próximo modelo', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'length' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Texto util.' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const service = withConfig({
        AI_PROVIDER: 'openrouter',
        OPENAI_API_KEY: 'sk-or-test',
        AI_MODEL: 'que-gasta-token',
        AI_FALLBACK_MODELS: 'que-responde',
      });

      await expect(service.sendMessage(prompt)).resolves.toEqual({ message: 'Texto util.' });
      fetchSpy.mockRestore();
    });

    it('quando todos os modelos falham, o erro diz qual foi a última falha', async () => {
      // Response nova a cada chamada: o body de uma Response só pode ser lido
      // uma vez, e o serviço lê para montar a mensagem de erro.
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('sem credito', { status: 402 }));

      const service = withConfig({
        AI_PROVIDER: 'openrouter',
        OPENAI_API_KEY: 'sk-or-test',
        AI_MODEL: 'modelo-a',
        AI_FALLBACK_MODELS: 'modelo-b',
      });

      await expect(service.sendMessage(prompt)).rejects.toThrow(/402/);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('openai usa AI_MODEL quando ele existe, para não divergir do openrouter', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const service = withConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MODEL: 'gpt-4o-mini' });
      await service.sendMessage(prompt);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(JSON.parse(String(init.body)).model).toBe('gpt-4o-mini');
      fetchSpy.mockRestore();
    });
  });
});