import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';

describe('AiService', () => {
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
});