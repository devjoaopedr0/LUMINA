import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { ListGeneratorService } from './list-generator.service';

const alts = (ok = true) => (ok
  ? [{ position: 1, isCorrect: false }, { position: 2, isCorrect: true }, { position: 3, isCorrect: false }, { position: 4, isCorrect: false }]
  : [{ position: 1, isCorrect: true }, { position: 2, isCorrect: true }]);

function q(id: string, topicId: string, extra: Record<string, unknown> = {}) {
  return { id, stem: `Enunciado ${id}`, subject: 'Matemática', subjectId: 'mat', topic: topicId, topicId, difficulty: 'MEDIA', exam: 'ENEM', year: 2023, workspaceId: 'bank', alternatives: alts(), ...extra };
}

function fakeDb() {
  const questions = [
    q('q1', 'funcoes'), q('q2', 'funcoes'), q('q3', 'funcoes'),
    q('q4', 'geometria'), q('q5', 'geometria'),
    q('q6', 'estatistica', { difficulty: 'DIFICIL' }),
    q('bad', 'funcoes', { alternatives: alts(false) }),
    q('bio', 'genetica', { subject: 'Biologia', subjectId: 'bio' }),
  ];
  const matches = (row: any, where: any) => Object.entries(where).every(([k, c]: [string, any]) => {
    if (c && typeof c === 'object') {
      if ('in' in c) return c.in.includes(row[k]);
      if ('notIn' in c) return !c.notIn.includes(row[k]);
      if ('equals' in c) return String(row[k]).toLowerCase() === String(c.equals).toLowerCase();
    }
    return row[k] === c;
  });
  return {
    question: { findMany: async ({ where }: any) => questions.filter((r) => matches(r, where)) },
    workspaceMember: { findMany: async () => [{ workspaceId: 'personal' }] },
    classTeacher: { findUnique: async ({ where }: any) => (where.classId_userId.userId === 'prof' ? { class: { id: 'c1', name: '3º A', archived: false } } : null) },
    classMember: { findMany: async () => [{ userId: 'ana' }, { userId: 'bia' }] },
    topicMastery: {
      findMany: async ({ where }: any) => (where.userId === 'ana' ? [{ topicId: 'geometria', masteryScore: 30, topic: { name: 'Geometria' } }] : []),
      groupBy: async () => [
        { topicId: 'estatistica', _avg: { masteryScore: 40 }, _count: { _all: 2 } },
        { topicId: 'funcoes', _avg: { masteryScore: 90 }, _count: { _all: 2 } },
      ],
    },
    topic: {
      findMany: async () => [{ id: 'estatistica', name: 'Estatística' }],
      findUnique: async () => ({ name: 'Funções' }),
    },
    subject: { findUnique: async () => ({ name: 'Matemática' }) },
    questionAttempt: { findMany: async () => [{ questionId: 'q1' }, { questionId: 'q2' }] },
  } as unknown as PrismaService;
}

const access = { getBankWorkspace: async () => ({ id: 'bank' }) } as unknown as QuestionAccessService;

describe('ListGeneratorService', () => {
  it('filtros: só questões compatíveis com o cartão, equilibradas entre assuntos', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('ana', { count: 5, basis: 'filters', subjectId: 'mat' });
    const ids = res.questions.map((x) => x.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain('bad');
    expect(ids).not.toContain('bio');
    expect(new Set(res.questions.map((x) => x.topic)).size).toBe(3);
    expect(res.title).toBe('Lista de Matemática (5 questões)');
  });

  it('avisa quando há menos questões que o pedido', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('ana', { count: 10, basis: 'filters', subjectId: 'mat', difficulty: 'DIFICIL' });
    expect(res.found).toBe(1);
    expect(res.warnings[0]).toMatch(/Só encontramos 1 de 10/);
  });

  it('dificuldades do aluno: usa o assunto mais fraco', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('ana', { count: 5, basis: 'weaknesses' });
    expect(res.basis).toBe('weaknesses');
    expect(res.weakTopics).toEqual([{ name: 'Geometria', mastery: 30 }]);
    expect(res.questions.every((x) => x.topic === 'geometria')).toBe(true);
  });

  it('sem histórico, cai para os filtros com aviso', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('caio', { count: 5, basis: 'weaknesses' });
    expect(res.basis).toBe('filters');
    expect(res.warnings[0]).toMatch(/ainda não tem histórico/);
  });

  it('professor: dificuldades da turma (só a média) e acesso conferido', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('prof', { count: 5, basis: 'weaknesses', classId: 'c1' });
    expect(res.forClass).toEqual({ id: 'c1', name: '3º A' });
    expect(res.weakTopics).toEqual([{ name: 'Estatística', mastery: 40 }]);
    await expect(svc.generate('ana', { count: 5, basis: 'filters', classId: 'c1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não repete o que o aluno acertou recentemente', async () => {
    const svc = new ListGeneratorService(fakeDb(), access);
    const res = await svc.generate('ana', { count: 10, basis: 'filters', subjectId: 'mat', skipMastered: true });
    expect(res.questions.map((x) => x.id)).not.toContain('q1');
    expect(res.questions.map((x) => x.id)).not.toContain('q2');
  });
});
