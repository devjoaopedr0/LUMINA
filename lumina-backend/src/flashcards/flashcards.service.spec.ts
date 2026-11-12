import { FlashcardRating } from '@prisma/client';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createFakePrisma } from '../../test/fake-prisma';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { FlashcardsService } from './flashcards.service';

describe('FlashcardsService', () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let ai: { generateStructured: ReturnType<typeof vi.fn> };
  let service: FlashcardsService;

  beforeEach(() => {
    fake = createFakePrisma();
    ai = { generateStructured: vi.fn().mockResolvedValue(null) };
    service = new FlashcardsService(
      fake as unknown as PrismaService,
      ai as unknown as AiService,
    );
  });

  it('cria, lista e resume um cartão manual', async () => {
    const created = await service.create('user-1', {
      front: 'O que é entropia?',
      back: 'Medida de desordem de um sistema.',
    });

    expect(created.source).toBe('MANUAL');
    expect(created.due).toBe(true);
    expect(created.reviewCount).toBe(0);
    expect(await service.list('user-1')).toHaveLength(1);

    const summary = await service.summary('user-1');
    expect(summary).toMatchObject({ total: 1, due: 1, newCards: 1, totalReviews: 0 });
  });

  it('gera cartões com a IA e guarda a origem e os metadados de auditoria', async () => {
    ai.generateStructured.mockResolvedValue({
      text: JSON.stringify({
        cards: [
          { front: 'O que é entropia?', back: 'É a medida de desordem de um sistema.' },
          { front: 'O que é a segunda lei?', back: 'A entropia de um sistema isolado não diminui.' },
        ],
      }),
      model: 'test:model',
    });

    const cards = await service.generate('user-1', {
      content: 'Entropia é a medida de desordem de um sistema. Em um sistema isolado, ela nunca diminui.',
      count: 2,
    });

    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.source === 'AI' && card.due)).toBe(true);
    expect(cards[0].front).toBe('O que é entropia?');

    const [row] = await fake.flashcard.findMany({ where: { userId: 'user-1' } });
    expect(row.metadata).toMatchObject({
      generator: 'LUMINIA',
      model: 'test:model',
      origin: 'CONTENT',
      reviewStatus: 'UNREVIEWED',
    });
  });

  it('não simula flashcards quando não há provedor de IA configurado', async () => {
    await expect(
      service.generate('user-1', {
        content: 'Conteúdo de estudo suficiente para tentar gerar os cartões.',
      }),
    ).rejects.toThrow('precisa de um provedor de IA configurado.');
  });

  it('recusa a resposta da IA quando o JSON de cartões é inválido', async () => {
    ai.generateStructured.mockResolvedValue({ text: 'desculpe, não consegui', model: 'test:model' });

    await expect(
      service.generate('user-1', {
        content: 'Conteúdo de estudo suficiente para tentar gerar os cartões.',
      }),
    ).rejects.toThrow('devolveu flashcards inválidos');
    expect(await service.list('user-1')).toHaveLength(0);
  });

  it('revisa, atualiza o histórico e tira o cartão da fila até o próximo dia', async () => {
    // `due` é calculado com o relógio real; fixa o "agora" no dia da revisão
    // para o teste não vencer quando a data do calendário passar de 10/11.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T15:00:00.000Z'));
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const created = await service.create('user-1', {
      front: 'Frente',
      back: 'Verso',
    });

    const reviewed = await service.review(
      'user-1',
      created.id,
      FlashcardRating.GOOD,
      new Date('2026-11-09T15:00:00.000Z'),
    );
    expect(reviewed.reviewCount).toBe(1);
    expect(reviewed.correctCount).toBe(1);
    expect(reviewed.streak).toBe(1);
    expect(reviewed.intervalDays).toBe(1);
    expect(reviewed.nextReviewAt).toBe('2026-11-10T00:00:00.000Z');
    expect(reviewed.due).toBe(false);

    const history = await service.history('user-1', created.id);
    expect(history.flashcard.reviewCount).toBe(1);
    expect(history.reviews).toHaveLength(1);
    expect(history.reviews[0]).toMatchObject({
      rating: 'GOOD',
      remembered: true,
      intervalDays: 1,
    });

    expect(await service.list('user-1', { due: 'true' })).toHaveLength(0);
  });

  it('cria a partir do caderno de erros usando gabarito e explicação do servidor', async () => {
    const question = await fake.question.create({
      data: {
        workspaceId: 'workspace-1',
        subject: 'Biologia',
        topic: 'Citologia',
        difficulty: 'MEDIA',
        exam: 'ENEM',
        stem: 'Qual organela produz ATP?',
        explanation: 'A mitocôndria realiza a respiração celular.',
        alternatives: {
          create: [
            { text: 'Mitocôndria', position: 1, isCorrect: true },
            { text: 'Ribossomo', position: 2, isCorrect: false },
          ],
        },
      },
    });
    await fake.errorNotebookEntry.create({
      data: { userId: 'user-1', questionId: question.id, notes: 'Errei por confundir com ribossomo.' },
    });

    const card = await service.createFromError('user-1', question.id);
    expect(card.source).toBe('ERROR_NOTEBOOK');
    expect(card.front).toBe('Qual organela produz ATP?');
    expect(card.back).toContain('Mitocôndria');
    expect(card.back).toContain('respiração celular');
    expect(card.sourceQuestionId).toBe(question.id);

    await expect(service.createFromError('user-1', question.id)).rejects.toThrow(
      'Você já criou um flashcard para esta questão.',
    );
  });

  it('não deixa um aluno ver ou editar o cartão de outro', async () => {
    const created = await service.create('user-1', { front: 'F', back: 'V' });
    await expect(service.get('user-2', created.id)).rejects.toThrow('Flashcard não encontrado.');
    await expect(
      service.review('user-2', created.id, FlashcardRating.GOOD),
    ).rejects.toThrow('Flashcard não encontrado.');
  });

  it('remove o cartão e o histórico junto', async () => {
    const created = await service.create('user-1', { front: 'F', back: 'V' });
    await service.review('user-1', created.id, FlashcardRating.AGAIN);
    expect((await service.history('user-1', created.id)).reviews).toHaveLength(1);

    await service.remove('user-1', created.id);
    expect(await service.list('user-1')).toHaveLength(0);
    await expect(service.history('user-1', created.id)).rejects.toThrow(
      'Flashcard não encontrado.',
    );
  });
});
