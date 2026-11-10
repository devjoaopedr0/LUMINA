import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FlashcardRating, FlashcardSource, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import {
  CreateFlashcardDto,
  CreateFlashcardFromErrorDto,
  FlashcardHistoryDto,
  FlashcardResponseDto,
  FlashcardSummaryDto,
  GenerateFlashcardsDto,
  GenerateFlashcardsFromPdfDto,
  UpdateFlashcardDto,
} from './flashcards.dto';
import {
  buildFlashcardGenerationPrompt,
  FLASHCARD_GENERATION_SYSTEM,
  FLASHCARD_PROMPT_VERSION,
  MAX_FLASHCARDS_PER_GENERATION,
  parseGeneratedFlashcards,
} from './flashcard-generation';
import { extractPdfText } from './flashcard-pdf';
import { decideFlashcardReview } from './flashcard-review';
import {
  brasiliaDateKey,
  isReviewDayDue,
  reviewToday,
} from '../questions/review-day';

export interface FlashcardQuery {
  /** 'true' devolve só os cartões vencidos para hoje. */
  due?: string;
  source?: string;
  subjectId?: string;
  topicId?: string;
}

const FLASHCARD_INCLUDE = {
  subject: { select: { name: true } },
  topic: { select: { name: true } },
} as const;

const MAX_LIST = 500;
const MAX_HISTORY = 200;

type FlashcardRow = Prisma.FlashcardGetPayload<{ include: typeof FLASHCARD_INCLUDE }>;

/**
 * Flashcards pessoais (item 32). O cartão pertence ao aluno, não ao workspace;
 * por isso toda consulta filtra por `userId` antes de qualquer outra condição.
 */
@Injectable()
export class FlashcardsService {
  private readonly logger = new Logger(FlashcardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async list(userId: string, query: FlashcardQuery = {}): Promise<FlashcardResponseDto[]> {
    const where: Prisma.FlashcardWhereInput = { userId };

    if (query.due === 'true') {
      where.nextReviewAt = { lte: reviewToday() };
    }
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.source) where.source = parseSource(query.source);

    const rows = await this.prisma.flashcard.findMany({
      where,
      include: FLASHCARD_INCLUDE,
      orderBy: [{ nextReviewAt: 'asc' }, { createdAt: 'desc' }],
      take: MAX_LIST,
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(userId: string, id: string): Promise<FlashcardResponseDto> {
    return this.toDto(await this.findCard(userId, id));
  }

  async create(userId: string, dto: CreateFlashcardDto): Promise<FlashcardResponseDto> {
    const classification = await this.resolveClassification(dto.subjectId, dto.topicId);
    const row = await this.prisma.flashcard.create({
      data: {
        userId,
        front: dto.front,
        back: dto.back,
        source: FlashcardSource.MANUAL,
        ...classification,
        // Um cartão novo já é dívida de revisão: entra na fila de hoje em vez
        // de ficar invisível até alguém lembrar que ele existe.
        nextReviewAt: reviewToday(),
      },
      include: FLASHCARD_INCLUDE,
    });
    return this.toDto(row);
  }

  /**
   * Gera cartões com a LuminIA a partir de um conteúdo fornecido pelo aluno.
   * Sem provedor real, devolve 503 em vez de inventar cartões locais; o modelo
   * e a versão do prompt ficam nos metadados para auditoria.
   */
  async generate(
    userId: string,
    dto: GenerateFlashcardsDto,
    origin: 'CONTENT' | 'PDF' = 'CONTENT',
  ): Promise<FlashcardResponseDto[]> {
    const classification = await this.resolveClassification(dto.subjectId, dto.topicId);
    const count = Math.min(
      MAX_FLASHCARDS_PER_GENERATION,
      Math.max(1, Math.trunc(dto.count ?? 6)),
    );

    let result: Awaited<ReturnType<AiService['generateStructured']>>;
    try {
      result = await this.aiService.generateStructured({
        system: FLASHCARD_GENERATION_SYSTEM,
        prompt: buildFlashcardGenerationPrompt({
          content: dto.content,
          count,
          origin,
        }),
        maxTokens: 4000,
        timeoutMs: 90_000,
        temperature: 0.25,
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao gerar flashcards: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'A LuminIA não conseguiu gerar os flashcards agora. Tente novamente em instantes.',
      );
    }

    if (!result) {
      throw new ServiceUnavailableException(
        'A geração de flashcards precisa de um provedor de IA configurado.',
      );
    }

    let generated: ReturnType<typeof parseGeneratedFlashcards>;
    try {
      generated = parseGeneratedFlashcards(result.text, count);
    } catch (error) {
      this.logger.warn(
        `Resposta inválida ao gerar flashcards: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException(
        'A LuminIA devolveu flashcards inválidos. Tente gerar novamente.',
      );
    }

    const generatedAt = new Date().toISOString();
    const rows = await this.prisma.$transaction(
      generated.map((card) =>
        this.prisma.flashcard.create({
          data: {
            userId,
            front: card.front,
            back: card.back,
            source: FlashcardSource.AI,
            ...classification,
            nextReviewAt: reviewToday(),
            metadata: {
              generator: 'LUMINIA',
              promptVersion: FLASHCARD_PROMPT_VERSION,
              model: result.model,
              origin,
              generatedAt,
              reviewStatus: 'UNREVIEWED',
            },
          },
          include: FLASHCARD_INCLUDE,
        }),
      ),
    );
    return rows.map((row) => this.toDto(row));
  }

  /** Lê o PDF em memória e reutiliza a mesma geração de conteúdo. */
  async generateFromPdf(
    userId: string,
    dto: GenerateFlashcardsFromPdfDto,
  ): Promise<FlashcardResponseDto[]> {
    const content = await extractPdfText(dto.pdf);
    return this.generate(
      userId,
      { content, count: dto.count, subjectId: dto.subjectId, topicId: dto.topicId },
      'PDF',
    );
  }

  /**
   * Cria um cartão a partir de uma questão do caderno de erros. O cliente manda
   * só a questão; frente, verso e classificação são derivados no servidor para
   * o cartão não nascer com um gabarito inventado pelo navegador.
   */
  async createFromError(
    userId: string,
    questionId: string,
    dto: CreateFlashcardFromErrorDto = {},
  ): Promise<FlashcardResponseDto> {
    const entry = await this.prisma.errorNotebookEntry.findFirst({
      where: { userId, questionId },
      include: {
        question: {
          select: {
            id: true,
            subjectId: true,
            topicId: true,
            stem: true,
            explanation: true,
            alternatives: {
              where: { isCorrect: true },
              select: { text: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!entry) {
      throw new NotFoundException('Esta questão não está no seu caderno de erros.');
    }

    const existing = await this.prisma.flashcard.findFirst({
      where: { userId, sourceQuestionId: questionId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Você já criou um flashcard para esta questão.');
    }

    const question = entry.question;
    const correct = question.alternatives[0]?.text?.trim() ?? '';
    const explanation = question.explanation?.trim() ?? '';
    const derivedBack =
      [correct, explanation].filter(Boolean).join('\n\n') || (entry.notes?.trim() ?? '');

    if (!dto.back && !derivedBack) {
      throw new BadRequestException(
        'Esta questão não tem gabarito textual nem explicação. Escreva o verso do cartão.',
      );
    }

    const row = await this.prisma.flashcard.create({
      data: {
        userId,
        front: dto.front ?? question.stem,
        back: dto.back ?? derivedBack,
        source: FlashcardSource.ERROR_NOTEBOOK,
        sourceQuestionId: questionId,
        subjectId: question.subjectId,
        topicId: question.topicId,
        nextReviewAt: reviewToday(),
      },
      include: FLASHCARD_INCLUDE,
    });
    return this.toDto(row);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateFlashcardDto,
  ): Promise<FlashcardResponseDto> {
    const card = await this.findCard(userId, id);
    const changingClassification = dto.subjectId !== undefined || dto.topicId !== undefined;
    const classification = changingClassification
      ? await this.resolveClassification(
          dto.subjectId !== undefined ? dto.subjectId : card.subjectId,
          dto.topicId !== undefined ? dto.topicId : card.topicId,
        )
      : {};

    const row = await this.prisma.flashcard.update({
      where: { id: card.id },
      data: {
        ...(dto.front !== undefined ? { front: dto.front } : {}),
        ...(dto.back !== undefined ? { back: dto.back } : {}),
        ...classification,
      },
      include: FLASHCARD_INCLUDE,
    });
    return this.toDto(row);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true; id: string }> {
    const card = await this.findCard(userId, id);
    await this.prisma.flashcard.delete({ where: { id: card.id } });
    return { deleted: true, id: card.id };
  }

  /**
   * Registra a lembrança e recalcula o próximo dia. A transação usa a data de
   * atualização como versão: duas abas abertas não aplicam duas vezes a mesma
   * revisão e não corrompem o histórico.
   */
  async review(
    userId: string,
    id: string,
    rating: FlashcardRating,
    now = new Date(),
  ): Promise<FlashcardResponseDto> {
    const card = await this.findCard(userId, id);
    const decision = decideFlashcardReview(now, card, rating);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.flashcard.updateMany({
        where: { id: card.id, userId, updatedAt: card.updatedAt },
        data: {
          reviewCount: decision.reviewCount,
          correctCount: decision.correctCount,
          streak: decision.streak,
          intervalDays: decision.intervalDays,
          easeFactor: decision.easeFactor,
          nextReviewAt: decision.nextReviewAt,
          lastReviewedAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Este cartão foi atualizado em outra aba. Recarregue antes de revisar.',
        );
      }
      await tx.flashcardReview.create({
        data: {
          flashcardId: card.id,
          userId,
          rating,
          reviewedAt: now,
          intervalDays: decision.intervalDays,
          easeFactor: decision.easeFactor,
          nextReviewAt: decision.nextReviewAt,
        },
      });
      const row = await tx.flashcard.findUnique({
        where: { id: card.id },
        include: FLASHCARD_INCLUDE,
      });
      if (!row) throw new NotFoundException('Flashcard não encontrado.');
      return this.toDto(row);
    });
  }

  async history(userId: string, id: string): Promise<FlashcardHistoryDto> {
    const card = await this.findCard(userId, id);
    const reviews = await this.prisma.flashcardReview.findMany({
      where: { userId, flashcardId: card.id },
      orderBy: { reviewedAt: 'desc' },
      take: MAX_HISTORY,
    });
    return {
      flashcard: this.toDto(card),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        remembered: review.rating !== FlashcardRating.AGAIN,
        reviewedAt: review.reviewedAt.toISOString(),
        intervalDays: review.intervalDays,
        easeFactor: review.easeFactor,
        nextReviewAt: review.nextReviewAt?.toISOString() ?? null,
      })),
    };
  }

  async summary(userId: string): Promise<FlashcardSummaryDto> {
    const now = new Date();
    const today = reviewToday(now);
    // Meia-noite de Brasília em UTC (UTC-3, sem horário de verão).
    const startOfToday = new Date(`${brasiliaDateKey(now)}T03:00:00.000Z`);

    const [
      total,
      due,
      newCards,
      totalReviews,
      rememberedReviews,
      reviewedToday,
    ] = await Promise.all([
      this.prisma.flashcard.count({ where: { userId } }),
      this.prisma.flashcard.count({
        where: { userId, nextReviewAt: { lte: today } },
      }),
      this.prisma.flashcard.count({ where: { userId, reviewCount: 0 } }),
      this.prisma.flashcardReview.count({ where: { userId } }),
      this.prisma.flashcardReview.count({
        where: { userId, rating: { not: FlashcardRating.AGAIN } },
      }),
      this.prisma.flashcardReview.count({
        where: { userId, reviewedAt: { gte: startOfToday } },
      }),
    ]);

    return {
      total,
      due,
      newCards,
      totalReviews,
      rememberedReviews,
      accuracy:
        totalReviews > 0 ? Math.round((rememberedReviews / totalReviews) * 100) : null,
      reviewedToday,
    };
  }

  /** Garante o par (id, userId) em toda leitura/edição — 404 não revela que o
   * cartão de outra pessoa existe. */
  private async findCard(userId: string, id: string): Promise<FlashcardRow> {
    const card = await this.prisma.flashcard.findFirst({
      where: { id, userId },
      include: FLASHCARD_INCLUDE,
    });
    if (!card) throw new NotFoundException('Flashcard não encontrado.');
    return card;
  }

  /**
   * Valida a classificação e mantém matéria/assunto coerentes. Um assunto já
   * carrega a matéria; aceitar um par incompatível deixaria o cartão em um
   * filtro que nunca o encontraria.
   */
  private async resolveClassification(
    subjectId?: string | null,
    topicId?: string | null,
  ): Promise<{ subjectId: string | null; topicId: string | null }> {
    if (!topicId) {
      if (!subjectId) return { subjectId: null, topicId: null };
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true },
      });
      if (!subject) throw new BadRequestException('Matéria não encontrada.');
      return { subjectId, topicId: null };
    }

    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, subjectId: true },
    });
    if (!topic) throw new BadRequestException('Assunto não encontrado.');
    if (subjectId && subjectId !== topic.subjectId) {
      throw new BadRequestException('O assunto não pertence à matéria informada.');
    }
    return { subjectId: topic.subjectId, topicId: topic.id };
  }

  private toDto(row: FlashcardRow): FlashcardResponseDto {
    const now = new Date();
    return {
      id: row.id,
      source: row.source,
      front: row.front,
      back: row.back,
      subjectId: row.subjectId,
      subject: row.subject?.name ?? null,
      topicId: row.topicId,
      topic: row.topic?.name ?? null,
      sourceQuestionId: row.sourceQuestionId,
      reviewCount: row.reviewCount,
      correctCount: row.correctCount,
      accuracy:
        row.reviewCount > 0 ? Math.round((row.correctCount / row.reviewCount) * 100) : null,
      streak: row.streak,
      intervalDays: row.intervalDays,
      easeFactor: row.easeFactor,
      nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      due: row.nextReviewAt === null || isReviewDayDue(row.nextReviewAt, now),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function parseSource(value: string): FlashcardSource {
  const source = value.toUpperCase();
  if (source in FlashcardSource) return source as FlashcardSource;
  throw new BadRequestException(`Origem inválida: ${value}.`);
}
