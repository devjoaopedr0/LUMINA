import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QuestionDifficulty } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimilarQuestionService } from './similar-question.service';
import { SIMILAR_QUESTION_PROMPT_VERSION } from './similar-question';

const generatedResponse = {
  stem: 'Uma cultura começa com 3 bactérias e dobra a cada hora. Quantas haverá após 3 horas?',
  explanation: 'A população é 3 · 2^t. Para t = 3, temos 24.',
  alternatives: [
    { text: '9', isCorrect: false, explanation: 'Não representa as dobras sucessivas.' },
    { text: '12', isCorrect: false, explanation: 'Representa apenas duas horas.' },
    { text: '24', isCorrect: true, explanation: '3 · 2^3 = 24.' },
    { text: '48', isCorrect: false, explanation: 'Representa quatro horas.' },
  ],
};

const source = {
  id: 'question-1',
  subject: 'Matemática',
  topic: 'Funções exponenciais',
  subjectId: 'subject-1',
  topicId: 'topic-1',
  difficulty: QuestionDifficulty.MEDIA,
  exam: 'ENEM',
  year: 2023,
  stem: 'Considere f(x) = 2^x. Qual é o valor de f(3)?',
  explanation: '2^3 = 8.',
  hasImage: false,
  alternatives: [
    { text: '4', isCorrect: false, explanation: null },
    { text: '6', isCorrect: false, explanation: null },
    { text: '8', isCorrect: true, explanation: '2^3 = 8.' },
    { text: '10', isCorrect: false, explanation: null },
  ],
};

describe('SimilarQuestionService', () => {
  let aiService: any;
  let questionsService: any;
  let service: SimilarQuestionService;

  beforeEach(() => {
    aiService = { generateStructured: vi.fn() };
    questionsService = {
      similarQuestionSource: vi.fn().mockResolvedValue(source),
      createGeneratedQuestion: vi.fn().mockResolvedValue({ id: 'generated-1' }),
    };
    service = new SimilarQuestionService(aiService, questionsService);
  });

  it('valida a resposta e salva no workspace pessoal com metadados de auditoria', async () => {
    aiService.generateStructured.mockResolvedValue({
      text: JSON.stringify(generatedResponse),
      model: 'openrouter:modelo-teste',
    });

    const result = await service.generate('user-1', 'question-1');

    expect(aiService.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('LuminIA'),
        prompt: expect.stringContaining('Considere f(x) = 2^x'),
        maxTokens: 2500,
        timeoutMs: 60_000,
      }),
    );
    expect(questionsService.createGeneratedQuestion).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        sourceQuestionId: 'question-1',
        subject: 'Matemática',
        topic: 'Funções exponenciais',
        difficulty: QuestionDifficulty.MEDIA,
        stem: generatedResponse.stem,
        metadata: expect.objectContaining({
          generator: 'LUMINIA',
          generatedFromQuestionId: 'question-1',
          promptVersion: SIMILAR_QUESTION_PROMPT_VERSION,
          model: 'openrouter:modelo-teste',
          reviewStatus: 'UNREVIEWED',
        }),
      }),
    );
    expect(result).toEqual({ id: 'generated-1' });
  });

  it('devolve 503 quando não há provedor de IA configurado', async () => {
    aiService.generateStructured.mockResolvedValue(null);

    await expect(service.generate('user-1', 'question-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(questionsService.createGeneratedQuestion).not.toHaveBeenCalled();
  });

  it('não salva quando a IA devolve uma questão inválida', async () => {
    aiService.generateStructured.mockResolvedValue({
      text: JSON.stringify({
        ...generatedResponse,
        alternatives: generatedResponse.alternatives.map((alternative) => ({
          ...alternative,
          isCorrect: true,
        })),
      }),
      model: 'modelo-teste',
    });

    await expect(service.generate('user-1', 'question-1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(questionsService.createGeneratedQuestion).not.toHaveBeenCalled();
  });

  it('converte falha do provedor em 502 sem vazar o erro técnico', async () => {
    aiService.generateStructured.mockRejectedValue(new Error('429 do provedor'));

    await expect(service.generate('user-1', 'question-1')).rejects.toMatchObject({
      message: expect.not.stringContaining('429'),
    });
    expect(questionsService.createGeneratedQuestion).not.toHaveBeenCalled();
  });
});
