import { Injectable } from '@nestjs/common';
import { Prisma, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
    if (!subjectId || !topicId) return;

    const existing = await db.topicMastery.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    const attempts = (existing?.attempts ?? 0) + 1;
    const correctAttempts = (existing?.correctAttempts ?? 0) + (isCorrect ? 1 : 0);
    const correctStreak = isCorrect ? (existing?.correctStreak ?? 0) + 1 : 0;

    const accuracy = correctAttempts / attempts;
    const streakFactor = Math.min(correctStreak / MASTERY_STREAK_TARGET, 1);
    const masteryScore = Math.round(100 * (0.7 * accuracy + 0.3 * streakFactor));

    const previousStatus = existing?.status ?? TopicMasteryStatus.NAO_ESTUDADO;
    let status: TopicMasteryStatus;
    if (previousStatus === TopicMasteryStatus.DOMINADO && !isCorrect) {
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
    const reviewIntervalDays = isCorrect
      ? existing
        ? Math.min(existing.reviewIntervalDays * 2, REVIEW_MAX_INTERVAL_DAYS)
        : REVIEW_INITIAL_INTERVAL_DAYS
      : REVIEW_RESET_INTERVAL_DAYS;
    const now = new Date();
    const nextReviewAt = new Date(now);
    nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + reviewIntervalDays);
    nextReviewAt.setUTCHours(0, 0, 0, 0);

    await db.topicMastery.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        subjectId,
        topicId,
        masteryScore,
        attempts,
        correctAttempts,
        correctStreak,
        status,
        lastStudiedAt: now,
        nextReviewAt,
        reviewIntervalDays,
      },
      update: {
        masteryScore,
        attempts,
        correctAttempts,
        correctStreak,
        status,
        lastStudiedAt: now,
        nextReviewAt,
        reviewIntervalDays,
      },
    });
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
      due: row.nextReviewAt ? row.nextReviewAt <= new Date() : false,
    }));
  }
}
