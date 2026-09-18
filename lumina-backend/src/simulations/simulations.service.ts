import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { SimulationAnswerDto } from './simulations.dto';

@Injectable()
export class SimulationsService {
  constructor(private readonly prisma: PrismaService, private readonly access: QuestionAccessService) {}

  async classes(userId: string) {
    const rows = await this.prisma.class.findMany({
      where: { archived: false, OR: [{ teachers: { some: { userId } } }, { members: { some: { userId } } }] },
      select: { id: true, name: true, joinCode: true, teachers: { where: { userId }, select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ teachers, ...row }) => ({ ...row, isTeacher: teachers.length > 0, joinCode: teachers.length ? row.joinCode : null }));
  }

  async createClass(userId: string, name: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { teacherProfile: true } });
    if (!user?.teacherProfile) throw new ForbiddenException('Apenas professores podem criar turmas.');
    const classRoom = await this.prisma.$transaction(async (tx) => {
      const email = `turmas+${userId}@lumina.internal`;
      let institution = await tx.institution.findUnique({ where: { email }, include: { workspace: true } });
      if (!institution) institution = await tx.institution.create({
        data: { name: `Turmas de ${user.email}`, email, status: 'ACTIVE', workspace: { create: { name: `Turmas de ${user.email}`, type: 'INSTITUTION' } } },
        include: { workspace: true },
      });
      return tx.class.create({
        data: { id: randomUUID(), workspaceId: institution.workspace!.id, name: name.trim(), joinCode: randomBytes(6).toString('hex').toUpperCase(), createdBy: userId, coordinatorId: userId, teachers: { create: { userId } } },
      });
    });
    return { id: classRoom.id, name: classRoom.name, joinCode: classRoom.joinCode, isTeacher: true };
  }

  async joinClass(userId: string, code: string) {
    const row = await this.prisma.class.findUnique({ where: { joinCode: code.trim().toUpperCase() } });
    if (!row || row.archived) throw new NotFoundException('Código de turma inválido.');
    await this.prisma.classMember.upsert({ where: { classId_userId: { classId: row.id, userId } }, update: {}, create: { classId: row.id, userId } });
    return { id: row.id, name: row.name, isTeacher: false };
  }

  async create(userId: string, title: string, questionIds: string[], classId?: string) {
    if (new Set(questionIds).size !== questionIds.length) throw new BadRequestException('O simulado não pode repetir questões.');
    let workspaceId: string;
    if (classId) {
      const [teacher, user] = await Promise.all([
        this.prisma.classTeacher.findUnique({ where: { classId_userId: { classId, userId } }, include: { class: true } }),
        this.prisma.user.findUnique({ where: { id: userId }, include: { teacherProfile: true } }),
      ]);
      if (!teacher || teacher.class.archived || !user?.teacherProfile) throw new ForbiddenException('Você não leciona nesta turma.');
      workspaceId = teacher.class.workspaceId;
    } else {
      workspaceId = (await this.access.getPersonalWorkspaceOrThrow(userId)).id;
    }
    const questions = await this.prisma.question.findMany({ where: { id: { in: questionIds } }, include: { alternatives: { orderBy: { position: 'asc' } } } });
    if (questions.length !== questionIds.length) throw new BadRequestException('Uma ou mais questões não estão disponíveis.');
    for (const q of questions) {
      await this.access.assertCanUse(userId, q.workspaceId);
      if (q.alternatives.length < 2 || q.alternatives.length > 5 || q.alternatives.filter(a => a.isCorrect).length !== 1 || q.alternatives.some((a, i) => a.position !== i + 1)) {
        throw new BadRequestException('Uma questão tem alternativas incompatíveis com o cartão-resposta.');
      }
    }
    const byId = new Map(questions.map(q => [q.id, q]));
    const row = await this.prisma.simulation.create({ data: {
      id: randomUUID(), title: title.trim(), createdBy: userId, classId: classId ?? null, workspaceId,
      items: { create: questionIds.map((id, i) => {
        const q = byId.get(id)!;
        return { id: randomUUID(), questionId: id, position: i + 1, stem: q.stem, subject: q.subject, correctPosition: q.alternatives.find(a => a.isCorrect)!.position, alternatives: q.alternatives.map(a => ({ position: a.position, text: a.text })) };
      }) },
    }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true } } } });
    return this.publicSimulation(row);
  }

  async list(userId: string) {
    const rows = await this.prisma.simulation.findMany({ where: { OR: [{ createdBy: userId }, { class: { members: { some: { userId } } } }, { class: { teachers: { some: { userId } } } }] }, select: { id: true, title: true, createdAt: true, class: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt, className: r.class?.name ?? null, questionCount: r._count.items }));
  }

  async get(userId: string, id: string, includeAnswers = false) {
    const row = await this.prisma.simulation.findUnique({ where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true, members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } } } });
    if (!row || (row.createdBy !== userId && !row.class?.members.length && !row.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (includeAnswers && row.createdBy !== userId && !row.class?.teachers.length) throw new ForbiddenException('O gabarito oficial é exclusivo do autor e dos professores da turma.');
    return this.publicSimulation(row, includeAnswers);
  }

  async submit(userId: string, id: string, answers: SimulationAnswerDto[]) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } } },
    });
    if (!simulation || (simulation.createdBy !== userId && !simulation.class?.members.length && !simulation.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (answers.length !== simulation.items.length || new Set(answers.map(a => a.position)).size !== answers.length) throw new BadRequestException('Responda cada questão uma única vez.');
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    for (const item of simulation.items) {
      const choice = byPosition.get(item.position);
      const alternatives = item.alternatives as { position: number }[];
      if (!choice || !alternatives.some(a => a.position === choice)) throw new BadRequestException(`Resposta inválida para a questão ${item.position}.`);
    }
    const correct = simulation.items.filter(item => byPosition.get(item.position) === item.correctPosition).length;
    try {
      await this.prisma.simulationSubmission.create({ data: { id: randomUUID(), simulationId: id, userId, answers: answers.map(a => ({ position: a.position, selectedPosition: a.selectedPosition })), correct, total: simulation.items.length } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Este simulado já foi enviado.');
      throw error;
    }
    return this.submission(userId, id);
  }

  async submission(userId: string, id: string) {
    const row = await this.prisma.simulationSubmission.findUnique({ where: { simulationId_userId: { simulationId: id, userId } }, include: { simulation: { include: { items: { orderBy: { position: 'asc' } } } } } });
    if (!row) throw new NotFoundException('Resultado não encontrado.');
    const answers = row.answers as { position: number; selectedPosition: number }[];
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    return { id: row.id, simulationId: id, correct: row.correct, total: row.total, submittedAt: row.submittedAt, items: row.simulation.items.map(item => ({ position: item.position, subject: item.subject, selectedPosition: byPosition.get(item.position), correctPosition: item.correctPosition, isCorrect: byPosition.get(item.position) === item.correctPosition })) };
  }

  private publicSimulation(row: { id: string; title: string; createdAt: Date; class?: { name: string } | null; items: { id: string; questionId: string | null; position: number; stem: string; subject: string; alternatives: unknown; correctPosition: number }[] }, includeAnswers = false) {
    return { id: row.id, title: row.title, createdAt: row.createdAt, className: row.class?.name ?? null, sheetVersion: 1, items: row.items.map(i => ({ id: i.id, questionId: i.questionId, position: i.position, stem: i.stem, subject: i.subject, alternatives: i.alternatives, ...(includeAnswers ? { correctPosition: i.correctPosition } : {}) })) };
  }
}
