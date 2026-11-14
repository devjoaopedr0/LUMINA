import { buildMasteryEvolution } from './mastery-evolution';
import { Injectable } from '@nestjs/common';
import { Prisma, TopicMasteryStatus, type TopicMastery } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { isReviewDayDue, reviewDay } from './review-day';

type Db = PrismaService | Prisma.TransactionClient;

/** Acertos seguidos para considerar o tópico dominado — mesmo número que o
 *  caderno de erros usa para "questão dominada" (ERROR_NOTEBOOK_MASTERED_STREAK). */
const MASTERY_DOMINADO_STREAK = 2;
/** Streak-alvo usado só no cálculo do score (não é o mesmo número acima: aqui
 *  é "quantos acertos seguidos valem o peso máximo do fator streak"). */
const MASTERY_STREAK_TARGET = 3;
const MASTERY_DOMINADO_THRESHOLD = 75;
const MASTERY_PRATICANDO_THRESHOLD = 40;

const REVIEW_INITIAL_INTERVAL_DAYS = 3;
const REVIEW_MAX_INTERVAL_DAYS = 30;
const REVIEW_RESET_INTERVAL_DAYS = 1;

/**
 * Cronograma adaptativo, fase 1 (docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §2-3,
 * §8). Mantém o domínio do aluno por tópico, atualizado a cada tentativa de
 * questão (avulsa ou dentro de um simulado). Ainda não é consumido por
 * nenhum gerador de cronograma — isso é fase 2 — mas já fica disponível para
 * leitura (painel de domínio por tópico).
 *
 * O `masteryScore` pondera taxa de acerto (peso maior) e sequência de
 * acertos recente; a recência de estudo (quanto tempo faz que o tópico foi
 * tocado) fica de fora do score em si — ela importa para PRIORIZAR o que
 * revisar (fase 2, no gerador), não para medir o domínio atual.
 */
/** Dia do histórico para um instante: a data em Brasília, como meia-noite UTC
 *  (é assim que o Prisma lê e grava uma coluna DATE). */
export function masteryHistoryDay(instant: Date): Date {
  return reviewDay(instant);
}

@Injectable()
export class TopicMasteryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Atualiza (ou cria) o domínio do tópico a partir de uma tentativa. Não
   *  faz nada se a questão não tem classificação estruturada (subjectId/
   *  topicId nulos) — texto livre não tem o que registrar aqui. */
  async registerAttempt(
    userId: string,
    subjectId: string | null | undefined,
    topicId: string | null | undefined,
    isCorrect: boolean,
    db: Db = this.prisma,
  ): Promise<void> {
    await this.registerAttempts(userId, subjectId, topicId, [isCorrect], db);
  }

  /**
   * Várias tentativas do MESMO tópico de uma vez, na ordem em que foram
   * respondidas — é o que um simulado manda. O resultado é idêntico a chamar
   * registerAttempt uma a uma, mas com uma leitura e uma gravação por tópico:
   * um simulado de 90 questões fazia 270 idas ao banco numa transação só e
   * estourava o tempo dela.
   */
  async registerAttempts(
    userId: string,
    subjectId: string | null | undefined,
    topicId: string | null | undefined,
    results: boolean[],
    db: Db = this.prisma,
  ): Promise<void> {
    if (!subjectId || !topicId || results.length === 0) return;

    const existing = await db.topicMastery.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    let attempts = existing?.attempts ?? 0;
    let correctAttempts = existing?.correctAttempts ?? 0;
    let correctStreak = existing?.correctStreak ?? 0;
    let masteryScore = existing?.masteryScore ?? 0;
    let status: TopicMasteryStatus = existing?.status ?? TopicMasteryStatus.NAO_ESTUDADO;
    // null = o tópico ainda não tem intervalo de revisão (primeira tentativa).
    let reviewIntervalDays: number | null = existing?.reviewIntervalDays ?? null;

    for (const isCorrect of results) {
      attempts += 1;
      correctAttempts += isCorrect ? 1 : 0;
      correctStreak = isCorrect ? correctStreak + 1 : 0;

      const accuracy = correctAttempts / attempts;
      const streakFactor = Math.min(correctStreak / MASTERY_STREAK_TARGET, 1);
      masteryScore = Math.round(100 * (0.7 * accuracy + 0.3 * streakFactor));

      if (status === TopicMasteryStatus.DOMINADO && !isCorrect) {
        // Domínio que caiu por erro novo — volta pra fila de reforço, não
        // simplesmente "praticando" (o aluno já tinha dominado isso antes).
        status = TopicMasteryStatus.PRECISA_REFORCO;
      } else if (masteryScore >= MASTERY_DOMINADO_THRESHOLD && correctStreak >= MASTERY_DOMINADO_STREAK) {
        status = TopicMasteryStatus.DOMINADO;
      } else if (masteryScore >= MASTERY_PRATICANDO_THRESHOLD) {
        status = TopicMasteryStatus.PRATICANDO;
      } else {
        status = TopicMasteryStatus.APRENDENDO;
      }

      // Revisão espaçada: acerto estica o intervalo (dobra, até o teto); erro
      // reseta pro mínimo — mesma ideia do caderno de erros, aplicada ao
      // domínio do tópico em vez de à questão específica.
      reviewIntervalDays = isCorrect
        ? reviewIntervalDays !== null
          ? Math.min(reviewIntervalDays * 2, REVIEW_MAX_INTERVAL_DAYS)
          : REVIEW_INITIAL_INTERVAL_DAYS
        : REVIEW_RESET_INTERVAL_DAYS;
    }

    const now = new Date();
    const nextReviewAt = reviewDay(now, reviewIntervalDays!);

    const values = {
      masteryScore,
      attempts,
      correctAttempts,
      correctStreak,
      status,
      lastStudiedAt: now,
      nextReviewAt,
      reviewIntervalDays: reviewIntervalDays!,
    };
    const saved = await db.topicMastery.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: { userId, subjectId, topicId, ...values },
      update: values,
    });
    await this.recordHistory(saved, now, db);
  }

  /**
   * Guarda o domínio do tópico no histórico do dia (em horário de Brasília):
   * várias mudanças no mesmo dia viram uma linha só, com o valor mais recente.
   */
  private async recordHistory(
    mastery: Pick<TopicMastery, 'userId' | 'topicId' | 'masteryScore' | 'status' | 'attempts' | 'correctAttempts'>,
    now: Date,
    db: Db,
  ): Promise<void> {
    const day = masteryHistoryDay(now);
    const values = {
      masteryScore: mastery.masteryScore,
      status: mastery.status,
      attempts: mastery.attempts,
      correctAttempts: mastery.correctAttempts,
    };
    await db.topicMasteryHistory.upsert({
      where: { userId_topicId_day: { userId: mastery.userId, topicId: mastery.topicId, day } },
      create: { userId: mastery.userId, topicId: mastery.topicId, day, ...values },
      update: values,
    });
  }

  /** Registra que o aluno estudou o tópico sem responder questão (tarefa do
   *  cronograma concluída). Não mexe em score nem em acertos — só tira o
   *  tópico de NAO_ESTUDADO, marca a recência e empurra a revisão vencida
   *  pra frente; sem isso o gerador devolvia a mesma tarefa no dia seguinte. */
  async registerStudy(userId: string, topicId: string, db: Db = this.prisma): Promise<void> {
    const topic = await db.topic.findUnique({ where: { id: topicId } });
    if (!topic) return;

    const existing = await db.topicMastery.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });
    const now = new Date();
    const reviewIntervalDays = existing?.reviewIntervalDays ?? REVIEW_INITIAL_INTERVAL_DAYS;
    const reviewIsDue = !existing?.nextReviewAt || isReviewDayDue(existing.nextReviewAt, now);
    const nextReviewAt = reviewDay(now, reviewIntervalDays);

    const saved = await db.topicMastery.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        subjectId: topic.subjectId,
        topicId,
        status: TopicMasteryStatus.APRENDENDO,
        lastStudiedAt: now,
        nextReviewAt,
        reviewIntervalDays,
      },
      update: {
        lastStudiedAt: now,
        ...(existing?.status === TopicMasteryStatus.NAO_ESTUDADO ? { status: TopicMasteryStatus.APRENDENDO } : {}),
        ...(reviewIsDue ? { nextReviewAt } : {}),
      },
    });
    await this.recordHistory(saved, now, db);
  }

  /** Domínio por tópico do aluno — base do futuro painel "o que você já sabe"
   *  (fase 1 é só isso: dado disponível para leitura, sem gerador ainda). */
  async listForUser(userId: string) {
    const rows = await this.prisma.topicMastery.findMany({
      where: { userId },
      include: {
        subject: { select: { name: true } },
        topic: { select: { name: true } },
      },
      orderBy: [{ subject: { name: 'asc' } }, { topic: { name: 'asc' } }],
    });
    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      subject: row.subject.name,
      topicId: row.topicId,
      topic: row.topic.name,
      masteryScore: row.masteryScore,
      attempts: row.attempts,
      correctAttempts: row.correctAttempts,
      correctStreak: row.correctStreak,
      status: row.status,
      lastStudiedAt: row.lastStudiedAt,
      nextReviewAt: row.nextReviewAt,
      due: isReviewDayDue(row.nextReviewAt),
    }));
  }

  /** Evolução do domínio nas últimas semanas (geral, por matéria e o que mudou na semana). */
  async evolutionForUser(userId: string, weeks = 8, today: Date = new Date()) {
    const span = Math.min(26, Math.max(2, Math.round(weeks)));
    const since = new Date(today.getTime() - (span * 7 + 1) * 86_400_000);
    const [topics, recent, before] = await Promise.all([
      this.prisma.topicMastery.findMany({
        where: { userId },
        select: { topicId: true, topic: { select: { name: true } }, subject: { select: { name: true } } },
      }),
      this.prisma.topicMasteryHistory.findMany({
        where: { userId, day: { gte: since } },
        select: { topicId: true, day: true, masteryScore: true },
      }),
      // Último valor anterior à janela, para o começo da série não ficar vazio.
      this.prisma.topicMasteryHistory.findMany({
        where: { userId, day: { lt: since } },
        orderBy: { day: 'desc' },
        distinct: ['topicId'],
        select: { topicId: true, day: true, masteryScore: true },
      }),
    ]);
    return buildMasteryEvolution(
      [...before, ...recent],
      topics.map((t) => ({ topicId: t.topicId, topic: t.topic.name, subject: t.subject.name })),
      today,
      span,
    );
  }
}
