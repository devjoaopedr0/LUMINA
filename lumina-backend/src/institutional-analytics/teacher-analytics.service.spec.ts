import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { TeacherAnalyticsService } from './teacher-analytics.service';

function serviceWith(prisma: {
  user?: { findUnique: ReturnType<typeof vi.fn> };
  class?: { findMany: ReturnType<typeof vi.fn> };
  studyTimeLog?: { findMany: ReturnType<typeof vi.fn> };
}) {
  const mock = {
    user: prisma.user ?? { findUnique: vi.fn() },
    class: prisma.class ?? { findMany: vi.fn() },
    studyTimeLog: prisma.studyTimeLog ?? { findMany: vi.fn() },
  };
  return {
    service: new TeacherAnalyticsService(mock as unknown as PrismaService),
    mock,
  };
}

describe('TeacherAnalyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloqueia quem não possui perfil de professor', async () => {
    const { service } = serviceWith({
      user: { findUnique: vi.fn().mockResolvedValue({ teacherProfile: null }) },
    });

    await expect(service.teacherAnalytics('aluno-1', { days: 30 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('retorna 404 quando o classId não pertence ao professor', async () => {
    const { service, mock } = serviceWith({
      user: { findUnique: vi.fn().mockResolvedValue({ teacherProfile: { subject: 'Matemática' } }) },
      class: { findMany: vi.fn().mockResolvedValue([]) },
    });

    await expect(
      service.teacherAnalytics('professor-1', {
        days: 30,
        classId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mock.studyTimeLog.findMany).not.toHaveBeenCalled();
  });

  it('consulta apenas turmas ativas do professor e devolve o painel consolidado', async () => {
    const classFindMany = vi.fn().mockResolvedValue([
      {
        id: 'turma-1',
        name: 'Turma 1',
        joinCode: 'ABC123',
        members: [
          {
            joinedAt: new Date('2026-09-01T12:00:00.000Z'),
            user: {
              id: 'aluno-1',
              email: 'aluno@lumina.test',
              profile: { firstName: 'Ana', lastName: 'Lima' },
            },
          },
        ],
        simulations: [
          {
            id: 'sim-1',
            title: 'Atividade 1',
            items: [
              {
                position: 1,
                questionId: 'q-1',
                stem: 'Questão 1',
                subject: 'Matemática',
                correctPosition: 1,
              },
            ],
            submissions: [
              {
                userId: 'aluno-1',
                correct: 1,
                total: 1,
                submittedAt: new Date('2026-11-08T12:00:00.000Z'),
                answers: [{ position: 1, selectedPosition: 1 }],
              },
            ],
          },
        ],
      },
    ]);
    const logFindMany = vi.fn().mockResolvedValue([
      { userId: 'aluno-1', durationMinutes: 25, startTime: new Date('2026-11-08T13:00:00.000Z') },
    ]);
    const { service, mock } = serviceWith({
      user: { findUnique: vi.fn().mockResolvedValue({ teacherProfile: { subject: 'Matemática' } }) },
      class: { findMany: classFindMany },
      studyTimeLog: { findMany: logFindMany },
    });

    const result = await service.teacherAnalytics('professor-1', { days: 30 });

    expect(classFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived: false,
          teachers: { some: { userId: 'professor-1' } },
        }),
      }),
    );
    expect(logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['aluno-1'] } }),
      }),
    );
    expect(mock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'professor-1' } }),
    );
    expect(result.summary).toMatchObject({
      classCount: 1,
      studentCount: 1,
      activeStudentCount: 1,
      participationRate: 100,
      submissionCount: 1,
      answerCount: 1,
      correctCount: 1,
      accuracy: 100,
      studyMinutes: 25,
      studentsAtRisk: 0,
    });
    expect(result.classes[0]).toMatchObject({
      id: 'turma-1',
      name: 'Turma 1',
      studentCount: 1,
    });
    expect(result.classes[0].students[0]).toMatchObject({
      id: 'aluno-1',
      name: 'Ana Lima',
      email: 'aluno@lumina.test',
      accuracy: 100,
      riskLevel: 'NONE',
    });
    expect(result.questions[0]).toMatchObject({
      key: 'q-1',
      attempts: 1,
      correctCount: 1,
      accuracy: 100,
    });
  });
});
