import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, type MentalMathSession } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { generateQuestion, recordAnswer, summarize, OPERATIONS, ROUND_SIZE, TIME_LIMIT, type State } from './mental-math.domain';

@Injectable()
export class MentalMathService {
  constructor(private readonly prisma: PrismaService) {}

  private view(row: MentalMathSession) {
    const state = row.state as unknown as State;
    const { answer: _, ...question } = state.question;
    return { id: row.id, mode: row.mode, completed: row.completed, version: row.version,
      level: state.level, streak: state.streak, bestStreak: state.bestStreak,
      totalQuestions: ROUND_SIZE, question: row.completed ? null : question,
      remainingMs: Math.max(0, TIME_LIMIT - (Date.now() - state.startedAt)),
      attempts: state.attempts, summary: summarize(state.attempts) };
  }

  async start(userId: string, mode: 'free' | 'daily') {
    // A data do desafio segue o horário de Brasília para todas as contas.
    const dailyKey = mode === 'daily' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) : null;
    const state: State = { level: 1, streak: 0, bestStreak: 0, question: generateQuestion(1, dailyKey ? `${dailyKey}:0:1` : undefined), startedAt: Date.now(), attempts: [] };
    const data = { userId, mode, dailyKey, state: state as unknown as Prisma.InputJsonValue };
    const row = dailyKey ? await this.prisma.mentalMathSession.upsert({
      where: { userId_dailyKey: { userId, dailyKey } }, create: data, update: {},
    }) : await this.prisma.mentalMathSession.create({ data });
    return this.view(row);
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.mentalMathSession.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Treino não encontrado.');
    return this.view(row);
  }

  async answer(userId: string, id: string, version: number, answer: number | null) {
    const row = await this.prisma.mentalMathSession.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Treino não encontrado.');
    // Repetir a requisição após uma falha de rede não registra outra resposta.
    if (row.completed || version < row.version) return this.view(row);
    if (version !== row.version) throw new ConflictException('Atualize o treino antes de responder.');
    const now = Date.now();
    const state = recordAnswer(row.state as unknown as State, answer, now);
    const completed = state.attempts.length >= ROUND_SIZE;
    if (!completed) {
      state.question = generateQuestion(state.level, row.dailyKey ? `${row.dailyKey}:${state.attempts.length}:${state.level}` : undefined);
      state.startedAt = now;
    }
    const updated = await this.prisma.mentalMathSession.updateMany({
      where: { id, userId, version },
      data: { state: state as unknown as Prisma.InputJsonValue, completed, version: { increment: 1 } },
    });
    // Outra aba pode ter enviado a mesma resposta durante a gravação.
    if (!updated.count) return this.get(userId, id);
    return this.view({ ...row, state: state as unknown as Prisma.JsonValue, completed, version: version + 1 });
  }

  async history(userId: string) {
    const rows = await this.prisma.mentalMathSession.findMany({ where: { userId, completed: true }, orderBy: { createdAt: 'desc' }, take: 30 });
    const attempts = rows.flatMap(row => (row.state as unknown as State).attempts);
    return { summary: summarize(attempts), operations: OPERATIONS.map(operation => ({ operation, ...summarize(attempts.filter(a => a.operation === operation)) })),
      sessions: rows.map(row => ({ id: row.id, mode: row.mode, createdAt: row.createdAt, ...summarize((row.state as unknown as State).attempts) })) };
  }
}
