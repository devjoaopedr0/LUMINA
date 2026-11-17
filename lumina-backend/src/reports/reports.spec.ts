import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import type { TeacherAnalyticsResult } from '../institutional-analytics/teacher-analytics';
import { TeacherAnalyticsService } from '../institutional-analytics/teacher-analytics.service';
import { SkillMasteryService } from '../questions/enem-skills/skill-mastery.service';
import { bySubject, periodName, planCounts, previousMonthWindow, rollingWindow, strengths, subjectRows } from './report-build';
import { ReportsService } from './reports.service';

describe('janelas de período', () => {
  it('mês anterior no horário de Brasília, inclusive na virada do ano', () => {
    const w = previousMonthWindow(new Date('2026-11-16T12:00:00Z'));
    expect(w).toMatchObject({ label: '2026-10', days: 31 });
    expect(w.from.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(w.now.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(previousMonthWindow(new Date('2027-01-10T12:00:00Z'))).toMatchObject({ label: '2026-12', days: 31 });
    // 01/11 às 02h UTC = 31/10 às 23h em Brasília: o mês anterior ainda é setembro.
    expect(previousMonthWindow(new Date('2026-11-01T02:00:00Z')).label).toBe('2026-09');
    expect(periodName('2026-10')).toBe('outubro de 2026');
  });

  it('janela móvel em dias', () => {
    const w = rollingWindow(30, new Date('2026-11-16T12:00:00Z'));
    expect(w.from.toISOString()).toBe('2026-10-17T12:00:00.000Z');
    expect(periodName(w.label)).toBe('últimos 30 dias');
  });
});

describe('montagem', () => {
  it('matéria por turma, ignorando acento e maiúscula; turma sem respostas fica nula', () => {
    const r = (id: string, subjects: TeacherAnalyticsResult['subjects']) => ({ classes: [{ id, name: `T${id}` }], subjects }) as unknown as TeacherAnalyticsResult;
    expect(subjectRows([r('1', [{ subject: 'Matemática', attempts: 10, correctCount: 6, accuracy: 60 }]), r('2', [])], 'matematica')).toEqual([
      { classId: '1', className: 'T1', attempts: 10, correctCount: 6, accuracy: 60 },
      { classId: '2', className: 'T2', attempts: 0, correctCount: 0, accuracy: null },
    ]);
  });

  it('matérias fortes e fracas só com amostra mínima', () => {
    const rows = bySubject([
      ...Array.from({ length: 6 }, (_, i) => ({ subject: 'Física', isCorrect: i < 5 })),
      ...Array.from({ length: 6 }, (_, i) => ({ subject: 'Química', isCorrect: i < 2 })),
      ...Array.from({ length: 2 }, () => ({ subject: 'História', isCorrect: false })),
    ]);
    expect(rows.map((r) => r.subject)).toEqual(['História', 'Química', 'Física']);
    expect(strengths(rows)).toEqual({ strong: ['Física'], weak: ['Química'] });
  });

  it('contagem de planos', () => {
    expect(planCounts([{ status: 'ACTIVE' }, { status: 'COMPLETED' }, { status: 'ACTIVE' }])).toEqual({ active: 2, completed: 1, cancelled: 0 });
  });
});

describe('permissões', () => {
  const service = (prisma: Record<string, unknown>) =>
    new ReportsService(prisma as unknown as PrismaService, {} as TeacherAnalyticsService, {} as SkillMasteryService);
  const base = (accountType: string, teaching: { id: string; name: string }[] = []) => ({
    user: { findUnique: vi.fn().mockResolvedValue({ accountType }) },
    class: { findMany: vi.fn().mockResolvedValue(teaching) },
    workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
    classMember: { count: vi.fn().mockResolvedValue(0) },
  });
  const w = rollingWindow(30, new Date('2026-11-16T12:00:00Z'));

  it('turma que não é do professor nem da escola não existe para ele', async () => {
    await expect(service(base('TEACHER', [{ id: 't1', name: 'A' }])).classReport('prof', 't2', w)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('institucional só para coordenação e direção', async () => {
    await expect(service(base('TEACHER')).institutionReport('prof', w)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aluno só vê o próprio relatório; professor, só alunos das suas turmas', async () => {
    const prisma = base('STUDENT_INDEPENDENT');
    await expect(service(prisma).studentReport('aluno', 'outro-aluno', w)).rejects.toBeInstanceOf(NotFoundException);
    const teacher = base('TEACHER', [{ id: 't1', name: 'A' }]);
    await expect(service(teacher).studentReport('prof', 'aluno-de-fora', w)).rejects.toBeInstanceOf(NotFoundException);
    expect(teacher.classMember.count).toHaveBeenCalledWith({ where: { userId: 'aluno-de-fora', classId: { in: ['t1'] } } });
  });

  it('matéria sem turma no escopo é recusada', async () => {
    await expect(service(base('STUDENT_INDEPENDENT')).subjectReport('aluno', 'Física', w)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
