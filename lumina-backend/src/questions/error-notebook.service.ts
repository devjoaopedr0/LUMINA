import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorNotebookStatus, ErrorReason, QuestionDifficulty } from '@prisma/client';
import {
  ErrorNotebookDb,
  ErrorNotebookRepository,
  ErrorNotebookRow,
  ErrorNotebookSlice,
} from './error-notebook.repository';
import { QuestionAccessService } from './question-access.service';
import { QuestionsRepository } from './questions.repository';
import {
  ERROR_REASON_LABELS,
  ErrorNotebookEntryDto,
  ErrorNotebookFacetDto,
  ErrorNotebookSummaryDto,
  PaginatedErrorNotebookDto,
  UpdateErrorNotebookEntryDto,
} from './dto/error-notebook.dto';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const STEM_PREVIEW = 220;
const NOTES_PREVIEW = 2000;

/** Query de GET /users/me/error-notebook. O agrupamento/organização é por
 *  MATÉRIA e ASSUNTO (itens 12 e 13 do inventário ficam depois), e a lista
 *  padrão é a fila do que ainda precisa ser refeito. */
export interface ErrorNotebookQuery {
  page?: number;
  limit?: number;
  /** ABERTA (padrão), DOMINADA ou TODAS. */
  status?: string;
  subject?: string;
  topic?: string;
  reason?: string;
  difficulty?: string;
  /** 'true' restringe ao que tem revisão marcada para hoje ou antes. */
  due?: string;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Caderno de erros do aluno (item 12) e classificação do motivo (item 13).
 *
 * Duas metades, de propósito: o registro automático acontece dentro de
 * `registerAttempt` (chamado na mesma transação da tentativa, para que o erro
 * nunca exista sem a tentativa que o produziu) e o resto — leitura, recortes,
 * motivo, observação, revisão combinada, remoção — é ação do aluno.
 */
@Injectable()
export class ErrorNotebookService {
  constructor(
    private readonly repository: ErrorNotebookRepository,
    private readonly questionAccessService: QuestionAccessService,
    private readonly questionsRepository: QuestionsRepository,
  ) {}

  /**
   * Registra o desfecho de uma tentativa no caderno. Errar cria ou reabre a
   * entrada; acertar só evolui uma entrada existente. Devolve a entrada
   * atualizada para a interface já mostrar o novo estado sem recarregar.
   */
  async registerAttempt(
    userId: string,
    questionId: string,
    isCorrect: boolean,
    db?: ErrorNotebookDb,
  ): Promise<ErrorNotebookRow | null> {
    return isCorrect
      ? this.repository.registerCorrectAttempt(userId, questionId, db)
      : this.repository.registerWrongAttempt(userId, questionId, db);
  }

  async list(userId: string, query: ErrorNotebookQuery): Promise<PaginatedErrorNotebookDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.limit ?? DEFAULT_PAGE_SIZE)));
    const where = this.buildWhere(query);

    const [total, rows] = await Promise.all([
      this.repository.countByUser(userId, where),
      this.repository.findManyByUser(userId, { skip: (page - 1) * limit, take: limit, where }),
    ]);

    return {
      items: rows.map((row) => this.toEntryDto(row)),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      limit,
    };
  }

  /**
   * Resumo do caderno: quanto está aberto, quanto já foi dominado, quanto está
   * vencido para hoje e como o monte se distribui por matéria, assunto e
   * motivo. É o que permite organizar o estudo ("Matemática: 12, e equações:
   * 7") em vez de só listar.
   */
  async summary(userId: string): Promise<ErrorNotebookSummaryDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const slices = await this.repository.slices(userId);
    const now = new Date();

    const open = slices.filter((slice) => slice.status === 'ABERTA');
    const mastered = slices.filter((slice) => slice.status === 'DOMINADA');

    return {
      total: slices.length,
      open: open.length,
      mastered: mastered.length,
      dueToday: open.filter((slice) => isDue(slice.reviewScheduledAt, now)).length,
      withoutReason: open.filter((slice) => !slice.reason).length,
      bySubject: facets(slices, (slice) => slice.subject, (slice) => slice.subject),
      // Questão sem assunto entra no recorte da própria matéria: agrupar por
      // string vazia juntaria matérias diferentes numa linha sem nome.
      byTopic: facets(
        slices,
        (slice) => slice.topic || slice.subject,
        (slice) => slice.topic || slice.subject,
      ),
      byReason: facets(
        slices,
        (slice) => reasonLabel(slice.reason),
        (slice) => slice.reason ?? 'SEM_MOTIVO',
      ),
    };
  }

  /** Entrada manual: registra no caderno uma questão que o aluno quer refazer
   *  (errou em prova, na cabeça, ou errou antes de existir a plataforma). A
   *  questão precisa ser acessível ao aluno — o mesmo "uso" que permite
   *  respondê-la. */
  async add(userId: string, questionId: string): Promise<ErrorNotebookEntryDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const question = await this.questionsRepository.findById(questionId);
    if (!question) {
      throw new NotFoundException('Questão não encontrada.');
    }
    await this.questionAccessService.assertCanUse(userId, question.workspaceId);
    const existing = await this.repository.find(userId, question.id);
    if (existing) {
      throw new ConflictException('Esta questão já está no seu caderno de erros.');
    }
    return this.toEntryDto(await this.repository.create(userId, question.id));
  }

  /** Motivo do erro, observação pessoal e revisão combinada. */
  async update(
    userId: string,
    questionId: string,
    dto: UpdateErrorNotebookEntryDto,
  ): Promise<ErrorNotebookEntryDto> {
    const entry = await this.requireEntry(userId, questionId);
    const data: {
      reason?: ErrorReason | null;
      notes?: string | null;
      reviewScheduledAt?: Date | null;
    } = {};

    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.reviewScheduledOn !== undefined) {
      data.reviewScheduledAt = parseReviewDate(dto.reviewScheduledOn);
    }

    return this.toEntryDto(await this.repository.update(entry.id, data));
  }

  async remove(userId: string, questionId: string): Promise<void> {
    await this.requireEntry(userId, questionId);
    await this.repository.remove(userId, questionId);
  }

  private async requireEntry(userId: string, questionId: string): Promise<ErrorNotebookRow> {
    const entry = await this.repository.find(userId, questionId);
    if (!entry) {
      throw new NotFoundException('Esta questão não está no seu caderno de erros.');
    }
    return entry;
  }

  /** Traduz os filtros da query no `where` do Prisma. Valor inválido é
   *  recusado com 400 em vez de ser ignorado em silêncio — um filtro que não
   *  filtra é pior do que um filtro que avisa. */
  private buildWhere(query: ErrorNotebookQuery): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    // Sem filtro explícito, o caderno mostra a fila do que ainda precisa ser
    // refeito. As dominadas existem (a evolução delas é o que prova o
    // progresso), mas não ocupam o topo da lista.
    const status = (query.status ?? 'ABERTA').toUpperCase();
    if (status !== 'TODAS') {
      where.status = parseStatus(status);
    }
    if (query.subject) {
      where.question = { subject: { equals: query.subject, mode: 'insensitive' } };
    }
    if (query.topic) {
      where.question = {
        ...(where.question as object),
        topic: { equals: query.topic, mode: 'insensitive' },
      };
    }
    if (query.difficulty) {
      where.question = {
        ...(where.question as object),
        difficulty: parseDifficulty(query.difficulty),
      };
    }
    if (query.reason) {
      // `SEM_MOTIVO` é o valor do recorte "Sem motivo" do resumo: filtrar por
      // ele pergunta justamente pelas entradas ainda não classificadas. Sem
      // esta saída, a interface teria que adivinhar um filtro que a API recusa.
      where.reason =
        query.reason.toUpperCase() === 'SEM_MOTIVO' ? null : parseReason(query.reason);
    }
    if (query.due === 'true') {
      where.status = 'ABERTA';
      where.reviewScheduledAt = { not: null, lte: new Date() };
    }

    return where;
  }

  /** Entrada + resumo da questão no formato da API. Público porque
   *  `POST /questions/:id/attempt` devolve o caderno já atualizado junto com o
   *  resultado da tentativa. */
  toEntryDto(row: ErrorNotebookRow): ErrorNotebookEntryDto {
    const now = new Date();
    return {
      questionId: row.questionId,
      subject: row.question.subject,
      topic: row.question.topic,
      difficulty: row.question.difficulty as QuestionDifficulty,
      exam: row.question.exam,
      year: row.question.year,
      examNumber: row.question.examNumber,
      stem: truncate(row.question.stem, STEM_PREVIEW),
      reason: row.reason,
      notes: row.notes ? truncate(row.notes, NOTES_PREVIEW) : null,
      status: row.status,
      wrongAttempts: row.wrongAttempts,
      correctStreak: row.correctStreak,
      evolution: row.evolution,
      reviewScheduledAt: row.reviewScheduledAt ? row.reviewScheduledAt.toISOString() : null,
      due: isDue(row.reviewScheduledAt, now),
      firstWrongAt: row.firstWrongAt.toISOString(),
      lastWrongAt: row.lastWrongAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    };
  }
}

function isDue(scheduledAt: Date | null, now: Date): boolean {
  return scheduledAt !== null && scheduledAt.getTime() <= now.getTime();
}

/** Rótulo do motivo. Entrada sem classificação aparece como "Sem motivo" —
 *  que é informação, não ausência: o caderno mostra o que ainda falta
 *  classificar. */
function reasonLabel(reason: string | null): string {
  if (!reason) return 'Sem motivo';
  return ERROR_REASON_LABELS[reason as ErrorReason] ?? reason;
}

/** Data da revisão combinada. A string é o dia que o aluno digitou
 *  ("2026-09-27") e vale como dia, não como instante: é gravada à meia-noite
 *  UTC, então "hoje" já está vencido ao longo do dia e "amanhã" só vence
 *  amanhã. Uma data passada também vale — revisar o que já venceu é o caso
 *  mais comum. */
function parseReviewDate(value: string | null | undefined): Date | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException('Data da revisão inválida. Use o formato AAAA-MM-DD.');
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Data da revisão inválida. Use o formato AAAA-MM-DD.');
  }
  return date;
}

function parseStatus(value: string): ErrorNotebookStatus {
  const status = value.toUpperCase();
  if (status === 'ABERTA' || status === 'DOMINADA') {
    return status as ErrorNotebookStatus;
  }
  throw new BadRequestException(`Situação inválida: ${value}. Use ABERTA, DOMINADA ou TODAS.`);
}

function parseDifficulty(value: string): QuestionDifficulty {
  const difficulty = value.toUpperCase();
  if (difficulty in QuestionDifficulty) {
    return difficulty as QuestionDifficulty;
  }
  throw new BadRequestException(`Dificuldade inválida: ${value}.`);
}

function parseReason(value: string): ErrorReason {
  const reason = value.toUpperCase();
  if (reason in ErrorReason) {
    return reason as ErrorReason;
  }
  throw new BadRequestException(`Motivo do erro inválido: ${value}.`);
}

/** Contagem por rótulo, da maior para a menor, com abertos e dominados
 *  separados: o que o aluno decide estudar é o que está aberto. */
function facets(
  slices: ErrorNotebookSlice[],
  labelOf: (slice: ErrorNotebookSlice) => string,
  valueOf: (slice: ErrorNotebookSlice) => string = () => '',
): ErrorNotebookFacetDto[] {
  const groups = new Map<string, ErrorNotebookFacetDto>();
  for (const slice of slices) {
    const label = labelOf(slice);
    const value = valueOf(slice);
    const current = groups.get(label) ?? { label, value, open: 0, mastered: 0 };
    if (slice.status === 'DOMINADA') current.mastered += 1;
    else current.open += 1;
    groups.set(label, current);
  }
  return [...groups.values()].sort(
    (a, b) => b.open - a.open || b.mastered - a.mastered || a.label.localeCompare(b.label, 'pt-BR'),
  );
}
