import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { buildSteps, computeProgress, target, weakestTopic, type PoolQuestion, type StepDef } from './recovery-plan';
import { RecoveryPlansService } from './recovery-plans.service';

const q = (id: string, difficulty: PoolQuestion['difficulty'], over: Partial<PoolQuestion> = {}): PoolQuestion => ({
  id, difficulty, source: 'TOPIC', alreadyCorrect: false, answeredBefore: false, ...over,
});

describe('montagem das etapas', () => {
  it('ordem fixa e evolução da dificuldade, com meta de 70%', () => {
    const pool = [q('f1', 'FACIL'), q('f2', 'FACIL'), q('f3', 'FACIL'), q('f4', 'FACIL'), q('m1', 'MEDIA'), q('m2', 'MEDIA'), q('m3', 'MEDIA'), q('m4', 'MEDIA'), q('d1', 'DIFICIL'), q('d2', 'DIFICIL')];
    const steps = buildSteps(pool, 'Funções');
    expect(steps.map((s) => s.kind)).toEqual(['VIDEO', 'EASY', 'MEDIUM', 'HARD', 'REVIEW', 'REASSESS']);
    expect(steps[1]).toMatchObject({ questionIds: ['f1', 'f2', 'f3', 'f4'], target: 3 });
    expect(steps[3]).toMatchObject({ questionIds: ['d1', 'd2'], target: 2 });
    expect(steps[0].title).toBe('Revisar Funções em uma videoaula');
  });

  it('prefere questões do assunto e nunca respondidas; completa com nível vizinho e avisa; pula etapa vazia', () => {
    const pool = [
      q('s1', 'FACIL', { source: 'SUBJECT' }),
      q('t-ok', 'FACIL', { answeredBefore: true, alreadyCorrect: true }),
      q('t-new', 'FACIL'),
      q('k1', 'FACIL', { source: 'SKILL' }),
      q('m1', 'MEDIA'),
    ];
    const steps = buildSteps(pool, 'X');
    expect(steps[1].questionIds).toEqual(['t-new', 't-ok', 'k1', 's1']);
    // médias: só 1 → completa com o que sobrou? não sobrou fácil; difícil não há
    expect(steps[2].questionIds).toEqual(['m1']);
    expect(steps[2].note).toMatch(/Só 1 de 4/);
    expect(steps[3]).toMatchObject({ questionIds: [], target: 0 });
    expect(steps[3].note).toMatch(/foi pulada/);

    const borrowed = buildSteps([q('m1', 'MEDIA'), q('m2', 'MEDIA'), q('m3', 'MEDIA'), q('m4', 'MEDIA'), q('m5', 'MEDIA'), q('m6', 'MEDIA')], 'X');
    expect(borrowed[1].questionIds).toHaveLength(4);
    expect(borrowed[1].note).toMatch(/não tem questões fáceis suficientes/);
  });

  it('meta: todas com até 2 questões; acima, 70% arredondado', () => {
    expect([1, 2, 3, 4, 10].map(target)).toEqual([1, 2, 2, 3, 7]);
  });

  it('assunto mais fraco com tentativas, ignorando os que já têm plano', () => {
    const rows = [{ topicId: 'a', masteryScore: 10, attempts: 0 }, { topicId: 'b', masteryScore: 20, attempts: 3 }, { topicId: 'c', masteryScore: 15, attempts: 5 }];
    expect(weakestTopic(rows, new Set())?.topicId).toBe('c');
    expect(weakestTopic(rows, new Set(['c']))?.topicId).toBe('b');
    expect(weakestTopic([], new Set())).toBeNull();
  });
});

describe('progresso do plano', () => {
  const created = new Date('2026-11-15T10:00:00Z');
  const reviewAt = new Date('2026-11-18T10:00:00Z');
  const steps: StepDef[] = [
    { kind: 'VIDEO', title: 'v', questionIds: [], target: 0 },
    { kind: 'EASY', title: 'e', questionIds: ['f1', 'f2', 'f3'], target: 3 },
    { kind: 'MEDIUM', title: 'm', questionIds: ['m1', 'm2'], target: 2 },
    { kind: 'HARD', title: 'h', questionIds: [], target: 0 },
    { kind: 'REVIEW', title: 'r', questionIds: [], target: 0 },
    { kind: 'REASSESS', title: 'a', questionIds: [], target: 0 },
  ];
  const at = (iso: string) => new Date(iso);
  const plan = { createdAt: created, reviewAt, videoWatchedAt: null };

  it('trava a etapa seguinte até a meta; a última resposta de cada questão conta', () => {
    const attempts = [
      { questionId: 'f1', isCorrect: true, at: at('2026-11-15T11:00:00Z') },
      { questionId: 'f2', isCorrect: false, at: at('2026-11-15T11:01:00Z') },
      { questionId: 'f3', isCorrect: true, at: at('2026-11-15T11:02:00Z') },
      { questionId: 'f1', isCorrect: true, at: at('2026-11-14T11:00:00Z') }, // antes do plano: ignorada
    ];
    let p = computeProgress(steps, attempts, plan, at('2026-11-15T12:00:00Z'));
    expect(p.steps[1]).toMatchObject({ state: 'AVAILABLE', answered: 3, correct: 2, results: { f1: true, f2: false, f3: true } });
    expect(p.steps[2].state).toBe('LOCKED');
    expect(p.steps[3].state).toBe('SKIPPED');
    expect(p.steps[0].state).toBe('AVAILABLE'); // videoaula não bloqueia

    attempts.push({ questionId: 'f2', isCorrect: true, at: at('2026-11-15T11:05:00Z') }); // refez e acertou
    p = computeProgress(steps, attempts, plan, at('2026-11-15T12:00:00Z'));
    expect(p.steps[1].state).toBe('DONE');
    expect(p.steps[2].state).toBe('AVAILABLE');
  });

  it('revisão espera a data, usa as erradas e conclui o plano', () => {
    const attempts = [
      ...['f1', 'f2', 'f3'].map((id) => ({ questionId: id, isCorrect: true, at: at('2026-11-15T11:00:00Z') })),
      { questionId: 'm1', isCorrect: true, at: at('2026-11-15T11:10:00Z') },
      { questionId: 'm2', isCorrect: false, at: at('2026-11-15T11:11:00Z') },
      { questionId: 'm2', isCorrect: true, at: at('2026-11-15T11:12:00Z') },
    ];
    let p = computeProgress(steps, attempts, plan, at('2026-11-16T10:00:00Z'));
    expect(p.steps[4]).toMatchObject({ state: 'WAITING' });
    expect(p.finished).toBe(false);
    // a revisão usa as erradas na primeira tentativa (m2), mesmo que depois tenha acertado
    expect(p.reviewQuestionIds).toEqual(['m2']);

    p = computeProgress(steps, attempts, plan, at('2026-11-18T12:00:00Z'));
    expect(p.steps[4].state).toBe('AVAILABLE');
    // errar de novo na revisão não desfaz as etapas já concluídas
    const wrongAgain = [{ questionId: 'm2', isCorrect: false, at: at('2026-11-18T13:00:00Z') }];
    p = computeProgress(steps, [...attempts, ...wrongAgain], plan, at('2026-11-18T13:30:00Z'));
    expect(p.steps[2].state).toBe('DONE');
    expect(p.steps[4]).toMatchObject({ state: 'AVAILABLE', answered: 1, correct: 0 });
    const right = [...wrongAgain, { questionId: 'm2', isCorrect: true, at: at('2026-11-18T13:40:00Z') }];
    p = computeProgress(steps, [...attempts, ...right], plan, at('2026-11-18T14:00:00Z'));
    expect(p.steps[4]).toMatchObject({ state: 'DONE', correct: 1, target: 1 });
    expect(p.steps[5].state).toBe('DONE');
    expect(p.finished).toBe(true);
  });

  it('sem erros, a revisão usa até 3 das praticadas', () => {
    const attempts = ['f1', 'f2', 'f3', 'm1', 'm2'].map((id) => ({ questionId: id, isCorrect: true, at: at('2026-11-15T11:00:00Z') }));
    expect(computeProgress(steps, attempts, plan, at('2026-11-15T12:00:00Z')).reviewQuestionIds).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('permissões', () => {
  const access = { getPersonalWorkspace: vi.fn(), getBankWorkspace: vi.fn() } as unknown as QuestionAccessService;

  it('professor só cria plano para aluno de turma em que leciona', async () => {
    const prisma = { class: { findFirst: vi.fn().mockResolvedValue(null) }, recoveryPlan: { findMany: vi.fn() } };
    const service = new RecoveryPlansService(prisma as unknown as PrismaService, access);
    await expect(service.create('prof', { studentId: 'aluno' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.class.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teachers: { some: { userId: 'prof' } }, members: { some: { userId: 'aluno' } } }),
    }));
    expect(prisma.recoveryPlan.findMany).not.toHaveBeenCalled();
  });

  it('plano automático sem dados pede para escolher o assunto', async () => {
    const prisma = { recoveryPlan: { findMany: vi.fn().mockResolvedValue([]) }, topicMastery: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new RecoveryPlansService(prisma as unknown as PrismaService, access);
    await expect(service.create('aluno', {})).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('limite de planos ativos', async () => {
    const prisma = { recoveryPlan: { findMany: vi.fn().mockResolvedValue([{ topicId: 'a' }, { topicId: 'b' }, { topicId: 'c' }]) } };
    const service = new RecoveryPlansService(prisma as unknown as PrismaService, access);
    await expect(service.create('aluno', {})).rejects.toThrow(/3 planos de recuperação ativos/);
  });
});
