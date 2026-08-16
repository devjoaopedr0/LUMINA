import { Injectable } from '@nestjs/common';
import { Prisma, Exam } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface FindOrCreateExamData {
  name: string;
  year: number | null;
  institution?: string | null;
  description?: string | null;
}

/** Acesso via Prisma a exams (provas/vestibulares). */
@Injectable()
export class ExamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(options: { skip: number; take: number }, db: Db = this.prisma): Promise<Exam[]> {
    return db.exam.findMany({
      skip: options.skip,
      take: options.take,
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
    });
  }

  count(db: Db = this.prisma): Promise<number> {
    return db.exam.count();
  }

  findById(id: string, db: Db = this.prisma): Promise<Exam | null> {
    return db.exam.findUnique({ where: { id } });
  }

  /** Busca por nome + ano (sem unique no banco por tolerância a dados
   * imperfeitos de fontes externas). Cria se não encontrar. */
  async findOrCreate(
    data: FindOrCreateExamData,
    db: Db = this.prisma,
  ): Promise<Exam> {
    const existing = await db.exam.findFirst({
      where: {
        name: data.name,
        ...(data.year !== null ? { year: data.year } : {}),
      },
    });
    if (existing) return existing;

    return db.exam.create({
      data: {
        name: data.name,
        year: data.year,
        institution: data.institution ?? null,
        description: data.description ?? null,
      },
    });
  }
}
