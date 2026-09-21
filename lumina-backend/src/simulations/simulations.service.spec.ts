import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildCoordinatorDashboard, buildDirectorDashboard, buildTeacherDashboard, SimulationsService } from './simulations.service';

const userId = 'user-1';
const simulationId = 'simulation-1';
const sample = {
  id: simulationId, createdBy: 'teacher-1',
  class: { members: [{ id: 'member-1' }], teachers: [] },
  items: [
    { position: 1, correctPosition: 2, alternatives: [{ position: 1 }, { position: 2 }] },
    { position: 2, correctPosition: 1, alternatives: [{ position: 1 }, { position: 2 }] },
  ],
};

function setup(row: typeof sample | null = sample) {
  const prisma = {
    simulation: { findUnique: vi.fn().mockResolvedValue(row) },
    simulationSubmission: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ id: 'result-1', correct: 1, total: 2, submittedAt: new Date(), answers: [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 2 }], simulation: { items: sample.items } }),
    },
  };
  const service = new SimulationsService(prisma as never, {} as never);
  return { service, prisma };
}

describe('SimulationsService.createClass', () => {
  it('recusa quando o usuário não tem perfil de professor', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ teacherProfile: null }) } };
    const service = new SimulationsService(prisma as never, {} as never);

    await expect(service.createClass(userId, 'Turma A')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cria a turma no workspace da instituição quando o professor tem vínculo institucional ativo', async () => {
    const tx = { class: { create: vi.fn().mockResolvedValue({ id: 'class-1', name: 'Turma A', joinCode: 'ABC123' }) } };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ email: 'prof@exemplo.com', teacherProfile: { subject: 'Matemática' } }) },
      workspaceMember: {
        findFirst: vi.fn().mockResolvedValue({ workspace: { id: 'institution-workspace-1' } }),
      },
      institution: { findUnique: vi.fn(), create: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const service = new SimulationsService(prisma as never, {} as never);

    await service.createClass(userId, 'Turma A');

    expect(tx.class.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'institution-workspace-1' }) }),
    );
    // Não deve nem tentar criar/buscar o pseudo-workspace por professor.
    expect(prisma.institution.findUnique).not.toHaveBeenCalled();
  });

  it('usa (ou cria) o pseudo-workspace pessoal quando o professor não tem instituição', async () => {
    const tx = {
      institution: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ workspace: { id: 'shadow-workspace-1' } }),
      },
      class: { create: vi.fn().mockResolvedValue({ id: 'class-1', name: 'Turma A', joinCode: 'ABC123' }) },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ email: 'prof@exemplo.com', teacherProfile: { subject: 'Matemática' } }) },
      workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const service = new SimulationsService(prisma as never, {} as never);

    await service.createClass(userId, 'Turma A');

    expect(tx.institution.create).toHaveBeenCalled();
    expect(tx.class.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'shadow-workspace-1' }) }),
    );
  });
});

describe('SimulationsService.list', () => {
  it('inclui somente a nota do usuário autenticado na listagem', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: simulationId, title: 'ENEM', createdAt: new Date(), class: null, submissions: [{ correct: 8, total: 10, submittedAt: new Date() }], _count: { items: 10 } }]);
    const service = new SimulationsService({ simulation: { findMany } } as never, {} as never);
    const result = await service.list(userId);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ submissions: expect.objectContaining({ where: { userId } }) }) }));
    expect(result[0]).toEqual(expect.objectContaining({ questionCount: 10, result: expect.objectContaining({ correct: 8, total: 10 }) }));
  });
});

describe('SimulationsService.submit', () => {
  it('corrige pelo gabarito congelado e retorna resultado do próprio aluno', async () => {
    const { service, prisma } = setup();
    const result = await service.submit(userId, simulationId, [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 2 }]);
    expect(prisma.simulationSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ correct: 1, total: 2, userId }) }));
    expect(result.items.map(item => item.isCorrect)).toEqual([true, false]);
  });

  it('recusa respostas duplicadas ou fora das alternativas', async () => {
    const { service, prisma } = setup();
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 1, selectedPosition: 2 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 3 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.simulationSubmission.create).not.toHaveBeenCalled();
  });

  it('recusa usuário sem acesso e segundo envio', async () => {
    const { service } = setup({ ...sample, class: { members: [], teachers: [] } });
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(NotFoundException);
    const other = setup();
    other.prisma.simulationSubmission.create.mockRejectedValue({ code: 'P2002' });
    await expect(other.service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(ConflictException);
  });
});
describe('buildTeacherDashboard', () => {
  it('agrega desempenho, alertas e conteúdos frágeis por turma', () => {
    const result = buildTeacherDashboard([{
      id: 'class-1', name: '3º A', joinCode: 'ABC123',
      members: [
        { joinedAt: new Date(), user: { id: 'student-1', email: 'ana@example.com', profile: { firstName: 'Ana', lastName: 'Silva' } } },
        { joinedAt: new Date(), user: { id: 'student-2', email: 'bia@example.com', profile: { firstName: 'Bia', lastName: null } } },
      ],
      simulations: [{
        id: 'sim-1', title: 'Diagnóstico',
        items: [{ position: 1, subject: 'Matemática', correctPosition: 2 }, { position: 2, subject: 'Português', correctPosition: 1 }],
        submissions: [
          { userId: 'student-1', correct: 1, total: 2, submittedAt: new Date(), answers: [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 1 }] },
          { userId: 'student-2', correct: 2, total: 2, submittedAt: new Date(), answers: [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 1 }] },
        ],
      }],
    }]);
    expect(result.summary).toEqual({ classCount: 1, studentCount: 2, submissionCount: 2, averageAccuracy: 75, studentsAtRisk: 1 });
    expect(result.classes[0].students[0]).toEqual(expect.objectContaining({ name: 'Ana Silva', accuracy: 50, alert: true }));
    expect(result.classes[0].weakSubjects[0]).toEqual({ subject: 'Matemática', attempts: 2, accuracy: 50 });
  });
});
describe('buildCoordinatorDashboard', () => {
  it('consolida professores, turmas e desempenho por disciplina', () => {
    const classes = [{
      id: 'class-1', name: '3º A', joinCode: 'ABC',
      members: [{ joinedAt: new Date(), user: { id: 'student-1', email: 'ana@example.com', profile: { firstName: 'Ana', lastName: null } } }],
      teachers: [{ user: { id: 'teacher-1', email: 'prof@example.com', profile: { firstName: 'Paulo', lastName: 'Lima' }, teacherProfile: { subject: 'Matemática' } } }],
      simulations: [{ id: 'sim-1', title: 'Prova', items: [{ position: 1, subject: 'Matemática', correctPosition: 2 }], submissions: [{ userId: 'student-1', correct: 0, total: 1, submittedAt: new Date(), answers: [{ position: 1, selectedPosition: 1 }] }] }],
    }];
    const teacherDashboard = buildTeacherDashboard(classes);
    const result = buildCoordinatorDashboard(teacherDashboard, classes);
    expect(result.summary).toEqual(expect.objectContaining({ classCount: 1, studentCount: 1, teacherCount: 1 }));
    expect(result.teachers[0]).toEqual(expect.objectContaining({ name: 'Paulo Lima', subject: 'Matemática', classes: ['3º A'] }));
    expect(result.bySubject[0]).toEqual({ subject: 'Matemática', attempts: 1, accuracy: 0 });
  });
});


describe('gestão de períodos letivos da coordenação', () => {
  it('recusa acesso de usuário que não é coordenador', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ accountType: 'TEACHER' }) }, academicPeriod: { findMany: vi.fn() } };
    const service = new SimulationsService(prisma as never, {} as never);
    await expect(service.coordinatorPeriods(userId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.academicPeriod.findMany).not.toHaveBeenCalled();
  });

  it('recusa período cuja data final antecede a inicial', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ accountType: 'COORDINATOR' }) },
      workspaceMember: { findFirst: vi.fn().mockResolvedValue({ workspace: { id: 'workspace-1', name: 'Escola' } }) },
    };
    const service = new SimulationsService(prisma as never, {} as never);
    await expect(service.createCoordinatorPeriod(userId, { name: '2026.2', startsAt: '2026-12-01', endsAt: '2026-08-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
describe('buildDirectorDashboard', () => {
  it('consolida membros e evolução acadêmica mensal da instituição', () => {
    const classes = [{
      id: 'class-1', name: '3º A', joinCode: 'ABC',
      members: [{ joinedAt: new Date(), user: { id: 'student-1', email: 'ana@example.com', profile: { firstName: 'Ana', lastName: null } } }],
      teachers: [{ user: { id: 'teacher-1', email: 'prof@example.com', profile: { firstName: 'Paulo', lastName: null }, teacherProfile: { subject: 'Matemática' } } }],
      simulations: [
        { id: 'sim-1', title: 'Prova 1', items: [{ position: 1, subject: 'Matemática', correctPosition: 1 }], submissions: [{ userId: 'student-1', correct: 1, total: 1, submittedAt: new Date('2026-08-10T12:00:00Z'), answers: [{ position: 1, selectedPosition: 1 }] }] },
        { id: 'sim-2', title: 'Prova 2', items: [{ position: 1, subject: 'Matemática', correctPosition: 1 }], submissions: [{ userId: 'student-1', correct: 0, total: 1, submittedAt: new Date('2026-09-10T12:00:00Z'), answers: [{ position: 1, selectedPosition: 2 }] }] },
      ],
    }];
    const coordinator = buildCoordinatorDashboard(buildTeacherDashboard(classes), classes);
    const members = [
      { id: 'member-1', status: 'ACTIVE', joinedAt: new Date(), role: { name: 'Direção' }, user: { id: 'director-1', email: 'diretor@example.com', accountType: 'DIRECTOR', profile: { firstName: 'Dora', lastName: 'Silva' }, teacherProfile: null } },
      { id: 'member-2', status: 'SUSPENDED', joinedAt: new Date(), role: { name: 'Docente' }, user: { id: 'teacher-1', email: 'prof@example.com', accountType: 'TEACHER', profile: { firstName: 'Paulo', lastName: null }, teacherProfile: { subject: 'Matemática' } } },
    ];
    const result = buildDirectorDashboard(coordinator, classes, members, 'Colégio Lumina');
    expect(result.institutionName).toBe('Colégio Lumina');
    expect(result.summary).toEqual(expect.objectContaining({ memberCount: 2, activeMemberCount: 1, averageAccuracy: 50 }));
    expect(result.evolution).toEqual([
      { month: '2026-08', accuracy: 100, submissions: 1 },
      { month: '2026-09', accuracy: 0, submissions: 1 },
    ]);
    expect(result.members[0]).toEqual(expect.objectContaining({ name: 'Dora Silva', accountType: 'DIRECTOR', status: 'ACTIVE' }));
  });
});
