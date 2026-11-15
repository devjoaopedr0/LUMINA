import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { enrichSignals } from './extra-signals';
import { manualTransition, planAlertSync, type StoredAlert } from './pedagogical-alerts';
import type { TeacherAnalyticsResult, TeacherAnalyticsSignal, TeacherAnalyticsStudent } from './teacher-analytics';
import { TeacherAnalyticsService } from './teacher-analytics.service';

const now = new Date('2026-11-15T12:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

function student(over: Partial<TeacherAnalyticsStudent>): TeacherAnalyticsStudent {
  return {
    id: 'a1', name: 'Ana', email: 'a@x', joinedAt: daysAgo(90).toISOString(), submissions: 2, answerCount: 10, correctCount: 4,
    accuracy: 40, studyMinutes: 0, lastActivityAt: null, errorStreak: 0, riskLevel: 'NONE', riskReasons: [], ...over,
  };
}

function result(students: TeacherAnalyticsStudent[], signals: TeacherAnalyticsSignal[] = []): TeacherAnalyticsResult {
  return {
    generatedAt: now.toISOString(),
    period: { days: 30, from: daysAgo(30).toISOString(), to: now.toISOString() },
    summary: {} as TeacherAnalyticsResult['summary'],
    classes: [{ id: 't1', name: 'Turma 1', students } as TeacherAnalyticsResult['classes'][number]],
    questions: [], subjects: [], evolution: [], signals,
  };
}

const inactivity: TeacherAnalyticsSignal = {
  id: 'student:t1:a1:STUDENT_INACTIVITY', kind: 'STUDENT_INACTIVITY', severity: 'MEDIUM', classId: 't1', className: 'Turma 1',
  studentId: 'a1', studentName: 'Ana', questionKey: null, subject: null, title: 'Ana não registrou atividade nesta turma',
  detail: 'Nenhuma entrega.', recommendation: 'r', metric: -10,
};

const ctx = (over: Partial<Parameters<typeof enrichSignals>[1]> = {}) => ({
  now, previous: new Map(), lastActivity: new Map(), overdueTasks: new Map(), ...over,
});

describe('sinais extras (item 41)', () => {
  it('queda de desempenho: compara com o período anterior, com amostra mínima nos dois', () => {
    const prev = new Map([['t1', new Map([['a1', { answers: 10, correct: 8 }]])]]);
    const signals = enrichSignals(result([student({ accuracy: 40, answerCount: 10 })]), ctx({ previous: prev }));
    expect(signals).toEqual([expect.objectContaining({ kind: 'STUDENT_PERFORMANCE_DROP', severity: 'HIGH', title: 'Ana: acerto caiu 40 pontos', metric: -40 })]);

    // queda de 10 pontos não alerta; amostra anterior pequena também não
    expect(enrichSignals(result([student({ accuracy: 70 })]), ctx({ previous: prev }))).toEqual([]);
    const small = new Map([['t1', new Map([['a1', { answers: 3, correct: 3 }]])]]);
    expect(enrichSignals(result([student({ accuracy: 40 })]), ctx({ previous: small }))).toEqual([]);
  });

  it('tarefas atrasadas do cronograma a partir de 3 (alta a partir de 8)', () => {
    const s = (n: number) => enrichSignals(result([student({ accuracy: 90 })]), ctx({ overdueTasks: new Map([['a1', n]]) }));
    expect(s(2)).toEqual([]);
    expect(s(3)[0]).toMatchObject({ kind: 'STUDENT_OVERDUE_TASKS', severity: 'MEDIUM' });
    expect(s(8)[0]).toMatchObject({ severity: 'HIGH' });
  });

  it('inatividade: alta quando não há atividade em lugar nenhum há 14+ dias; senão continua média com o detalhe', () => {
    const r = result([student({ accuracy: 90 })], [inactivity]);
    expect(enrichSignals(r, ctx({ lastActivity: new Map([['a1', daysAgo(20)]]) }))[0]).toMatchObject({ severity: 'HIGH', title: 'Ana está sem atividade na Lumina há 20 dias' });
    expect(enrichSignals(r, ctx())[0]).toMatchObject({ severity: 'HIGH', detail: 'Nenhuma atividade registrada na Lumina.' });
    const active = enrichSignals(r, ctx({ lastActivity: new Map([['a1', daysAgo(2)]]) }))[0];
    expect(active.severity).toBe('MEDIUM');
    expect(active.detail).toMatch(/Ativo em outros recursos da Lumina/);
  });
});

describe('ciclo de vida dos alertas', () => {
  const stored = (over: Partial<StoredAlert>): StoredAlert => ({ id: 'x', fingerprint: inactivity.id, severity: 'MEDIUM', status: 'OPEN', reopenCount: 0, history: [], ...over });

  it('cria alerta novo como OPEN com histórico', () => {
    const plan = planAlertSync([], [inactivity], now);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ fingerprint: inactivity.id, status: 'OPEN', history: [{ from: null, to: 'OPEN', by: null }] });
  });

  it('atualiza o que continua; resolve sozinho o que sumiu', () => {
    const plan = planAlertSync([stored({}), stored({ id: 'y', fingerprint: 'outro', status: 'ACKNOWLEDGED' })], [inactivity], now);
    expect(plan.update.find((u) => u.id === 'x')!.data).toMatchObject({ title: inactivity.title, lastSeenAt: now });
    expect(plan.update.find((u) => u.id === 'x')!.data.status).toBeUndefined();
    expect(plan.update.find((u) => u.id === 'y')!.data).toMatchObject({ status: 'RESOLVED', autoResolved: true, closedAt: now });
  });

  it('reabre resolvido que voltou e dispensado que piorou; dispensado igual continua dispensado', () => {
    const reopened = planAlertSync([stored({ status: 'RESOLVED', reopenCount: 1 })], [inactivity], now).update[0].data;
    expect(reopened).toMatchObject({ status: 'OPEN', reopenCount: 2, closedAt: null });
    const worse = planAlertSync([stored({ status: 'DISMISSED' })], [{ ...inactivity, severity: 'HIGH' }], now).update[0].data;
    expect(worse.status).toBe('OPEN');
    const same = planAlertSync([stored({ status: 'DISMISSED' })], [inactivity], now).update[0].data;
    expect(same.status).toBeUndefined();
    // dispensado que sumiu não vira "resolvido"
    expect(planAlertSync([stored({ status: 'DISMISSED' })], [], now).update).toEqual([]);
  });

  it('transição manual registra quem, quando e a anotação', () => {
    const t = manualTransition(stored({}), 'RESOLVED', 'prof-1', 'Conversei com a aluna', now);
    expect(t).toMatchObject({ status: 'RESOLVED', closedAt: now, note: 'Conversei com a aluna' });
    expect(t.history.at(-1)).toEqual({ at: now.toISOString(), by: 'prof-1', from: 'OPEN', to: 'RESOLVED', note: 'Conversei com a aluna' });
    expect(manualTransition(stored({ status: 'RESOLVED' }), 'ACKNOWLEDGED', 'prof-1', undefined, now).closedAt).toBeNull();
  });
});

describe('PATCH de alerta', () => {
  it('só o dono do alerta pode alterar (404 para outro professor)', async () => {
    const prisma = { pedagogicalAlert: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const service = new TeacherAnalyticsService(prisma as unknown as PrismaService);
    await expect(service.updateAlert('prof-2', 'x', 'RESOLVED', undefined)).rejects.toThrow('Alerta não encontrado.');
    expect(prisma.pedagogicalAlert.findFirst).toHaveBeenCalledWith({ where: { id: 'x', teacherId: 'prof-2' } });
    expect(prisma.pedagogicalAlert.update).not.toHaveBeenCalled();
  });
});
