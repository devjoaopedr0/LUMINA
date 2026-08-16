import { Injectable } from '@nestjs/common';
import { Prisma, Subject, Topic } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Acesso via Prisma a subjects/topics. Usado para classificação estruturada
 * das questões e pelos endpoints de catálogo (GET /subjects, /topics). */
@Injectable()
export class SubjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(db: Db = this.prisma): Promise<Subject[]> {
    return db.subject.findMany({ orderBy: { name: 'asc' } });
  }

  findById(id: string, db: Db = this.prisma): Promise<Subject | null> {
    return db.subject.findUnique({ where: { id } });
  }

  findByName(name: string, db: Db = this.prisma): Promise<Subject | null> {
    return db.subject.findUnique({ where: { name } });
  }

  /** Cria a disciplina se ainda não existir (nome único) e devolve a existente. */
  async upsertByName(name: string, db: Db = this.prisma): Promise<Subject> {
    return db.subject.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  findTopicById(id: string, db: Db = this.prisma): Promise<Topic | null> {
    return db.topic.findUnique({ where: { id } });
  }

  findTopicByName(subjectId: string, name: string, db: Db = this.prisma): Promise<Topic | null> {
    return db.topic.findUnique({
      where: { subjectId_name: { subjectId, name } },
    });
  }

  /** Cria o assunto se ainda não existir dentro da disciplina. */
  async upsertTopic(subjectId: string, name: string, db: Db = this.prisma): Promise<Topic> {
    return db.topic.upsert({
      where: { subjectId_name: { subjectId, name } },
      update: {},
      create: { subjectId, name },
    });
  }

  findTopicsBySubjectId(subjectId: string, db: Db = this.prisma): Promise<Topic[]> {
    return db.topic.findMany({
      where: { subjectId },
      orderBy: { name: 'asc' },
    });
  }

  countTopicsForSubjects(subjectIds: string[], db: Db = this.prisma) {
    return db.topic.groupBy({
      by: ['subjectId'],
      where: { subjectId: { in: subjectIds } },
      _count: { _all: true },
    });
  }
}
