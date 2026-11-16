import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { AiChatRequestDto } from './ai.dto';
import { AiService } from './ai.service';
import { luminiaSystemPrompt } from './luminia-persona';

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const service = (env: Record<string, string>) => new AiService({ get: (k: string) => env[k] } as unknown as ConfigService);
const dto = (over: Partial<AiChatRequestDto> = {}) =>
  ({ message: { role: 'user', content: 'Me ajuda com esta questão?' }, history: [{ role: 'user', content: 'oi' }], ...over }) as AiChatRequestDto;

describe('chat com imagem', () => {
  it('vai para a cadeia de visão, com histórico e contexto', async () => {
    const ai = service({ AI_PROVIDER: 'openrouter', AI_VISION_MODELS: 'gemini:gemini-3.5-flash-lite' });
    const chain = vi.spyOn(ai as never, 'callChain' as never).mockResolvedValue({ text: 'É uma questão de função afim.', model: 'gemini:x' } as never);
    const r = await ai.sendMessage(dto({ image: IMG }), 'CONTEXTO', 'Ana');
    expect(r).toEqual({ message: 'É uma questão de função afim.' });
    const [refs, provider, message, , options, history, context] = (chain.mock.calls[0] as unknown[]) as [string[], string, unknown, string, { imageDataUrl: string }, unknown[], string];
    expect(refs).toEqual(['gemini:gemini-3.5-flash-lite']);
    expect(provider).toBe('openrouter');
    expect(message).toMatchObject({ content: 'Me ajuda com esta questão?' });
    expect(options.imageDataUrl).toBe(IMG);
    expect(history).toHaveLength(1);
    expect(context).toBe('CONTEXTO');
  });

  it('sem imagem, o chat segue o caminho de sempre', async () => {
    const ai = service({ AI_PROVIDER: 'openrouter', AI_VISION_MODELS: 'gemini:gemini-3.5-flash-lite' });
    const chain = vi.spyOn(ai as never, 'callChain' as never);
    const open = vi.spyOn(ai as never, 'callOpenRouter' as never).mockResolvedValue({ message: 'oi' } as never);
    await ai.sendMessage(dto());
    expect(chain).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
  });

  it('provedor sem leitura de imagem avisa, e o mock não finge que leu', async () => {
    await expect(service({ AI_PROVIDER: 'groq' }).sendMessage(dto({ image: IMG }))).rejects.toBeInstanceOf(BadRequestException);
    expect((await service({ AI_PROVIDER: 'mock' }).sendMessage(dto({ image: IMG }))).message).toMatch(/não está configurada/);
  });

  it('valida o formato da imagem', async () => {
    const errors = async (image: string) => (await validate(plainToInstance(AiChatRequestDto, { ...dto(), image }))).map((e) => e.property);
    expect(await errors(IMG)).toEqual([]);
    expect(await errors('data:image/svg+xml;base64,PHN2Zz4=')).toEqual(['image']);
    expect(await errors('https://exemplo.com/foto.jpg')).toEqual(['image']);
  });

  it('o prompt pede LaTeX para matemática e cuidado com imagem ilegível', () => {
    const prompt = luminiaSystemPrompt();
    expect(prompt).toMatch(/entre \$\$\.\.\.\$\$/);
    // O exemplo chega ao modelo com as barras do LaTeX (no template string, "\f" viraria caractere de controle).
    expect(prompt).toContain('$$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$');
    expect(prompt).toMatch(/ilegível ou cortada/);
    expect(prompt).not.toMatch(/Não use markdown pesado/);
  });
});
