import { describe, expect, it, vi } from 'vitest';
vi.mock('../workspaces/class-membership-policy', () => ({ assertInstitutionClassMember: vi.fn().mockResolvedValue(undefined) }));
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

const classRow = { id: 'class-1', workspaceId: 'workspace-1', createdBy: 'creator-1', coordinatorId: null, maxStudents: null };

describe('SimulationsService — gestão de turma', () => {
  it('recusa novos vínculos em turma arquivada', async () => {
    const prisma = { class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, archived: true, teachers: [] }) } };
    const service = new SimulationsService(prisma as never, {} as never);
    await expect(service.addClassMember('creator-1', 'class-1', 'aluno@exemplo.com')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addClassTeacher('creator-1', 'class-1', 'professor@exemplo.com')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('updateClass', () => {
    it('recusa reduzir o limite abaixo das matrículas existentes', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }), update: vi.fn().mockResolvedValue(classRow) },
        classMember: { count: vi.fn().mockResolvedValue(3) },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);
      await expect(service.updateClass('creator-1', 'class-1', { maxStudents: 2 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.class.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ maxStudents: 2 }) }));
    });

    it('recusa quando o usuário não pode gerenciar a turma', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.updateClass('outsider', 'class-1', { name: 'Nova' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permite quem criou a turma e aplica as mudanças', async () => {
      const prisma = {
        class: {
          findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }),
          update: vi.fn().mockResolvedValue({ id: 'class-1', name: 'Nova' }),
        },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await service.updateClass('creator-1', 'class-1', { name: 'Nova' });

      expect(prisma.class.update).toHaveBeenCalledWith({ where: { id: 'class-1' }, data: { name: 'Nova' } });
    });

    it('permite quem tem CLASS_MANAGE no workspace mesmo sem ser professor/criador', async () => {
      const prisma = {
        class: {
          findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }),
          update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
        workspaceMember: {
          findFirst: vi.fn().mockResolvedValue({ role: { rolePermissions: [{ permission: { code: 'CLASS_MANAGE' } }] } }),
        },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.updateClass('coordinator-x', 'class-1', { description: 'Turma da tarde' })).resolves.toBeDefined();
    });

    it('recusa disciplina inexistente', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        subject: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.updateClass('creator-1', 'class-1', { subjectId: 'subject-x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa período letivo de outra instituição', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        academicPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.updateClass('creator-1', 'class-1', { academicPeriodId: 'period-de-outra-instituicao' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setClassArchived', () => {
    it('arquiva a turma quando o chamador pode gerenciá-la', async () => {
      const prisma = {
        class: {
          findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }),
          update: vi.fn().mockResolvedValue({ id: 'class-1', archived: true }),
        },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await service.setClassArchived('creator-1', 'class-1', true);

      expect(prisma.class.update).toHaveBeenCalledWith({ where: { id: 'class-1' }, data: { archived: true } });
    });
  });

  describe('addClassTeacher', () => {
    it('recusa e-mail sem conta cadastrada', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.addClassTeacher('creator-1', 'class-1', 'ninguem@exemplo.com')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa quando a conta não tem perfil de professor', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-2', teacherProfile: null }) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.addClassTeacher('creator-1', 'class-1', 'aluno@exemplo.com')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('vincula o professor à turma', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'teacher-2', teacherProfile: { subject: 'Física' } }) },
        classTeacher: { upsert: vi.fn().mockResolvedValue({}) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await service.addClassTeacher('creator-1', 'class-1', 'Professor2@Exemplo.com');

      expect(prisma.classTeacher.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { classId: 'class-1', userId: 'teacher-2' } }),
      );
    });
  });

  describe('removeClassTeacher', () => {
    it('recusa remover quem criou a turma', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [] }) },
        classTeacher: { deleteMany: vi.fn() },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.removeClassTeacher('creator-1', 'class-1', 'creator-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.classTeacher.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('addClassMember', () => {
    it('mantém matrícula existente mesmo quando a turma está lotada', async () => {
      const existing = { classId: 'class-1', userId: 'student-2' };
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, name: 'Turma A', archived: false }), update: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 1 }) },
        classMember: { findUnique: vi.fn().mockResolvedValue(existing), count: vi.fn(), upsert: vi.fn() },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);
      await expect(service.joinClass('student-2', 'ABC123')).resolves.toMatchObject({ id: 'class-1' });
      expect(prisma.classMember.count).not.toHaveBeenCalled();
      expect(prisma.classMember.upsert).not.toHaveBeenCalled();
    });

    it('aplica o limite também ao ingresso por código', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, archived: false }), update: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 1 }) },
        classMember: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), upsert: vi.fn() },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);
      await expect(service.joinClass('student-2', 'ABC123')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.classMember.upsert).not.toHaveBeenCalled();
    });

    it('recusa quando a turma já está com o número máximo de alunos', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 1, teachers: [] }), update: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 1 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'student-2' }) },
        classMember: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), upsert: vi.fn() },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.addClassMember('creator-1', 'class-1', 'aluno@exemplo.com')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.classMember.upsert).not.toHaveBeenCalled();
    });

    it('matricula o aluno quando há vaga', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 2, teachers: [] }), update: vi.fn().mockResolvedValue({ ...classRow, maxStudents: 2 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'student-2' }) },
        classMember: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), upsert: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await service.addClassMember('creator-1', 'class-1', 'aluno@exemplo.com');

      expect(prisma.classMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { classId: 'class-1', userId: 'student-2' } }),
      );
    });
  });

  describe('classDetail', () => {
    it('recusa quem não tem nenhum vínculo com a turma', async () => {
      const prisma = {
        class: { findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [], members: [] }) },
        workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      await expect(service.classDetail('outsider', 'class-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permite um membro comum ver o detalhe e monta o histórico corretamente', async () => {
      const fullClass = {
        ...classRow,
        name: 'Turma A', description: null, joinCode: 'ABC123', archived: false, gradeYear: 3,
        subject: { id: 'subject-1', name: 'Matemática' },
        academicPeriod: { id: 'period-1', name: '2026.2', startsAt: new Date(), endsAt: new Date(), active: true },
        coordinator: null,
        teachers: [{ user: { id: 'teacher-1', email: 'prof@exemplo.com', profile: { firstName: 'Paulo', lastName: null }, teacherProfile: { subject: 'Matemática' } } }],
        members: [{ joinedAt: new Date(), user: { id: 'student-1', email: 'aluno@exemplo.com', profile: null } }],
        simulations: [{ id: 'sim-1', title: 'Prova 1', assessmentType: 'TEST', dueAt: null, createdAt: new Date(), _count: { submissions: 3, items: 10 } }],
      };
      const prisma = {
        class: {
          findUnique: vi.fn().mockResolvedValue({ ...classRow, teachers: [], members: [{ id: 'membership-1' }] }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(fullClass),
        },
        workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const service = new SimulationsService(prisma as never, {} as never);

      const result = await service.classDetail('student-1', 'class-1');
      expect(result.canManage).toBe(false);
      expect(result.joinCode).toBeNull();

      expect(result.subject).toEqual({ id: 'subject-1', name: 'Matemática' });
      expect(result.teachers[0]).toEqual(expect.objectContaining({ name: 'Paulo', subject: 'Matemática' }));
      expect(result.members[0]).toEqual(expect.objectContaining({ email: 'aluno@exemplo.com' }));
      expect(result.timeline[0]).toEqual(expect.objectContaining({ title: 'Prova 1', submissionCount: 3, questionCount: 10 }));
    });
  });
});
