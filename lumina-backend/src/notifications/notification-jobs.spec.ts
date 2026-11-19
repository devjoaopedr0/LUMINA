import { describe, expect, it } from 'vitest';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationBroadcastService } from './notification-broadcast.service';

const NOW = new Date('2026-11-18T15:00:00Z'); // 12h em Brasília

function fakeDb(overrides: Record<string, unknown> = {}) {
  const sent: any[] = [];
  const db: any = {
    sent,
    notification: {
      createMany: async ({ data }: any) => { sent.push(...data); return { count: data.length }; },
      findMany: async ({ where }: any) => sent.filter((n) =>
        n.kind === where.kind &&
        (!where.link || n.link === where.link) &&
        (!where.userId?.in || where.userId.in.includes(n.userId))),
      groupBy: async () => [],
    },
    ...overrides,
  };
  return db;
}

describe('notificações automáticas', () => {
  it('prazo chegando: só quem não entregou, e uma vez só', async () => {
    const db = fakeDb({
      simulation: {
        findMany: async () => [{
          id: 'sim-1', title: 'Simulado 3', assessmentType: 'SIMULATION', dueAt: new Date('2026-11-19T12:00:00Z'),
          class: { name: '3º A', archived: false, members: [{ userId: 'ana' }, { userId: 'bia' }, { userId: 'caio' }] },
          submissions: [{ userId: 'bia' }],
        }],
      },
    });
    const svc = new NotificationSchedulerService(db as PrismaService, new NotificationsService(db as PrismaService));
    expect(await svc.dueSoon(NOW)).toBe(2);
    expect(db.sent.map((n: any) => n.userId).sort()).toEqual(['ana', 'caio']);
    expect(db.sent[0].title).toBe('Prazo chegando: simulado da turma 3º A');
    expect(await svc.dueSoon(NOW)).toBe(0);
  });

  it('revisão do dia: soma assuntos e flashcards, um aviso por dia, só depois das 8h', async () => {
    const db = fakeDb({
      topicMastery: { groupBy: async () => [{ userId: 'ana', _count: { _all: 2 } }] },
      flashcard: { groupBy: async () => [{ userId: 'ana', _count: { _all: 3 } }, { userId: 'bia', _count: { _all: 1 } }] },
      simulation: { findMany: async () => [] },
    });
    db.notification.findMany = async ({ where }: any) => db.sent.filter((n: any) => n.kind === where.kind && where.userId.in.includes(n.userId));
    const svc = new NotificationSchedulerService(db as PrismaService, new NotificationsService(db as PrismaService));
    expect((await svc.run(new Date('2026-11-18T10:00:00Z'))).reviews).toBe(0); // 07h
    expect((await svc.run(NOW)).reviews).toBe(2);
    expect(db.sent.find((n: any) => n.userId === 'ana').title).toBe('Você tem 5 revisões para hoje');
    expect((await svc.run(NOW)).reviews).toBe(0);
  });
});

describe('avisos do professor e da coordenação', () => {
  function broadcastDb(accountType: string, teaches: boolean, staff: boolean) {
    return fakeDb({
      user: { findUnique: async () => ({ accountType }) },
      class: {
        findMany: async ({ where }: any) => (where.teachers ? (teaches ? [{ id: 'c1', name: '3º A' }] : []) : staff ? [{ id: 'c2', name: '3º B' }] : []),
      },
      workspaceMember: {
        findFirst: async () => (staff ? { workspace: { id: 'w1', name: 'Colégio Teste' } } : null),
        findMany: async () => [{ userId: 'prof' }, { userId: 'ana' }, { userId: 'bia' }],
      },
      classMember: { findMany: async ({ where }: any) => (where.classId === 'c1' ? [{ userId: 'ana' }] : [{ userId: 'bia' }]) },
    });
  }

  it('professor avisa a própria turma; não avisa turma alheia nem a escola', async () => {
    const db = broadcastDb('TEACHER', true, false);
    const svc = new NotificationBroadcastService(db as PrismaService, new NotificationsService(db as PrismaService));
    expect(await svc.send('prof', { scope: 'class', classId: 'c1', title: 'Simulado no sábado' }, NOW)).toEqual({ sent: 1, audience: 'turma 3º A' });
    await expect(svc.send('prof', { scope: 'class', classId: 'c2', title: 'Oi turma' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.send('prof', { scope: 'institution', title: 'Aviso geral' }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('coordenação avisa a instituição inteira (sem mandar para si mesma)', async () => {
    const db = broadcastDb('COORDINATOR', false, true);
    const svc = new NotificationBroadcastService(db as PrismaService, new NotificationsService(db as PrismaService));
    const res = await svc.send('prof', { scope: 'institution', title: 'Reunião de pais sexta' }, NOW);
    expect(res).toEqual({ sent: 2, audience: 'Colégio Teste' });
  });

  it('aviso passa pelo filtro de conteúdo', async () => {
    const db = broadcastDb('TEACHER', true, false);
    const svc = new NotificationBroadcastService(db as PrismaService, new NotificationsService(db as PrismaService));
    await expect(svc.send('prof', { scope: 'class', classId: 'c1', title: 'Liguem no (85) 99876-5432' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });
});
