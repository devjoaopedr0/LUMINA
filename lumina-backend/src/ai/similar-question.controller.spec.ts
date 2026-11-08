import { describe, expect, it, vi } from 'vitest';
import { SimilarQuestionController } from './similar-question.controller';

describe('SimilarQuestionController', () => {
  it('passa apenas o usuário autenticado e o id da questão para o serviço', async () => {
    const service = { generate: vi.fn().mockResolvedValue({ id: 'generated-1' }) };
    const controller = new SimilarQuestionController(service as any);

    const result = await controller.generate(
      { id: 'user-1' } as any,
      { questionId: 'question-1' },
    );

    expect(service.generate).toHaveBeenCalledWith('user-1', 'question-1');
    expect(result).toEqual({ id: 'generated-1' });
  });
});
