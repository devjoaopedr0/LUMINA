import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { enemArea, gradeAnswers, GradingError, GradingItem, letterToPosition } from './answer-key.grading';
import { AnswerKeysService } from './answer-keys.service';

const item = (number: number, answer: number | null, extra: Partial<GradingItem> = {}): GradingItem => ({ number, language: '', answer, area: enemArea(number), validated: true, ...extra });

describe('Gabarito Inteligente — conferência', () => {
  it('conta acerto, erro e branco; percentual sobre as que contam', () => {
    const items = [item(1, 1), item(2, 2), item(3, 3), item(4, 4)];
    const r = gradeAnswers(items, { 1: 1, 2: 3, 3: null });
    expect(r.questions.map((q) => q.status)).toEqual(['CORRECT', 'WRONG', 'BLANK', 'BLANK']);
    expect([r.correct, r.wrong, r.blank, r.total, r.answered]).toEqual([1, 1, 2, 4, 2]);
    expect(r.percent).toBe(25);
  });

  it('anulada e pendente de validação não entram no percentual', () => {
    const items = [item(1, 1), item(2, null), item(3, 2, { validated: false })];
    const r = gradeAnswers(items, { 1: 1, 2: 4, 3: 2 });
    expect(r.questions.map((q) => q.status)).toEqual(['CORRECT', 'ANNULLED', 'PENDING']);
    expect([r.annulled, r.pending, r.percent]).toEqual([1, 1, 100]);
  });

  it('língua estrangeira do Enem: vale o item da língua escolhida e ela é obrigatória', () => {
    const items = [item(1, 1, { language: 'INGLES' }), item(1, 3, { language: 'ESPANHOL' }), item(6, 2)];
    expect(gradeAnswers(items, { 1: 3, 6: 2 }, 'ESPANHOL').correct).toBe(2);
    expect(gradeAnswers(items, { 1: 3, 6: 2 }, 'INGLES').correct).toBe(1);
    expect(() => gradeAnswers(items, { 1: 3 })).toThrow(GradingError);
  });

  it('recusa questão fora do gabarito e resposta inválida', () => {
    expect(() => gradeAnswers([item(1, 1)], { 7: 1 })).toThrow(/fora do gabarito/);
    expect(() => gradeAnswers([item(1, 1)], { 1: 9 })).toThrow(/inválida/);
  });

  it('resultado por área do Enem pela numeração', () => {
    const items = [item(91, 1), item(92, 1), item(136, 2), item(137, 2)];
    const r = gradeAnswers(items, { 91: 1, 92: 2, 136: 2, 137: 2 });
    expect(r.byArea).toEqual([
      expect.objectContaining({ area: 'Ciências da Natureza e suas Tecnologias', correct: 1, wrong: 1, percent: 50 }),
      expect.objectContaining({ area: 'Matemática e suas Tecnologias', correct: 2, percent: 100 }),
    ]);
  });

  it('letras do gabarito', () => {
    expect(['A', 'e', ' c ', 'X', '', null].map(letterToPosition)).toEqual([1, 5, 3, null, null, null]);
  });
});

describe('Gabarito Inteligente — cadastro e permissões', () => {
  const service = (prisma: unknown) => new AnswerKeysService(prisma as never);
  const base = { examId: '00000000-0000-4000-8000-000000000001', origin: 'OFFICIAL' as const, items: [{ number: 1, answer: 1 }] };

  it('oficial só pela administração e sempre com fonte e data de publicação', async () => {
    await expect(service({}).create({ id: 'u', accountType: 'TEACHER' }, base)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service({}).create({ id: 'u', accountType: 'ADMIN' }, base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aluno não cadastra gabarito de professor; IA/comunitário ainda não por aqui', async () => {
    await expect(service({}).create({ id: 'u', accountType: 'STUDENT_INDEPENDENT' }, { ...base, origin: 'TEACHER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service({}).create({ id: 'u', accountType: 'TEACHER' }, { ...base, origin: 'COMMUNITY' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('oficial duplicado (mesma prova, aplicação, dia e cor) vira conflito, não um segundo oficial', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: base.examId }), findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'ENEM' }) },
      workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      answerKey: { create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' })) },
    };
    const dto = { ...base, sourceName: 'INEP', sourceUrl: 'https://download.inep.gov.br/x.pdf', publishedAt: '2025-11-13' };
    await expect(service(prisma).create({ id: 'admin', accountType: 'ADMIN' }, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('item repetido e língua pela metade são recusados', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: base.examId }), findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'ENEM' }) },
    };
    const s = service(prisma);
    await expect(s.create({ id: 't', accountType: 'TEACHER' }, { ...base, origin: 'TEACHER', items: [{ number: 1, answer: 1 }, { number: 1, answer: 2 }] })).rejects.toThrow(/repetida/);
    await expect(s.create({ id: 't', accountType: 'TEACHER' }, { ...base, origin: 'TEACHER', items: [{ number: 1, answer: 1, language: 'INGLES' }, { number: 1, answer: 2 }] })).rejects.toThrow(/por língua/);
  });

  it('aluno vê oficial publicado, os próprios e os publicados pelos professores das turmas dele', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      classMember: { findMany: vi.fn().mockResolvedValue([{ class: { createdBy: 'prof-1', teachers: [{ userId: 'prof-2' }] } }]) },
      answerKey: { findMany },
    };
    await service(prisma).list({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, {});
    const where = findMany.mock.calls[0][0].where.AND[0];
    expect(where.OR).toEqual([
      { origin: 'OFFICIAL', status: 'PUBLISHED' },
      { createdBy: 'aluno', status: { not: 'ARCHIVED' } },
      { origin: 'TEACHER', status: 'PUBLISHED', createdBy: { in: ['prof-1', 'prof-2'] } },
    ]);
  });
});
