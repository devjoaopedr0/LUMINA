import { Injectable, Logger } from '@nestjs/common';
import { Prisma, QuestionSourceType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ExternalQuestion,
  ImportIssue,
  ImportReport,
  NormalizedQuestion,
} from '../domain/question-types';
import { ExamsRepository } from '../exams.repository';
import { ImportQuestionDto } from '../dto/import-questions.dto';
import { QuestionDeduplicator } from './question-deduplicator';
import { QuestionNormalizer, toNormalizedQuestion } from './question-normalizer';
import { JsonQuestionNormalizer } from './json-question.normalizer';
import { CsvQuestionNormalizer } from './csv-question.normalizer';
import { QuestionValidator } from './question-validator';
import { QuestionsRepository } from '../questions.repository';
import { SubjectsRepository } from '../subjects.repository';

/**
 * Orquestra o pipeline de importação de questões:
 *
 *   ExternalQuestion → normalização → validação → deduplicação → PostgreSQL
 *
 * A API de importação aceita o formato neutro (ExternalQuestion); arquivos
 * (JSON/CSV) passam antes por um QuestionNormalizer que converte o formato
 * da fonte. Questões inválidas e duplicadas NUNCA entram silenciosamente —
 * tudo é contabilizado no ImportReport devolvido ao chamador.
 */
@Injectable()
export class QuestionImportService {
  private readonly logger = new Logger(QuestionImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsRepository: QuestionsRepository,
    private readonly subjectsRepository: SubjectsRepository,
    private readonly examsRepository: ExamsRepository,
    private readonly validator: QuestionValidator,
    private readonly deduplicator: QuestionDeduplicator,
    private readonly jsonNormalizer: JsonQuestionNormalizer,
    private readonly csvNormalizer: CsvQuestionNormalizer,
  ) {}

  importFromJson(raw: unknown, workspaceId: string, createdBy: string | null = null) {
    return this.importMany(this.jsonNormalizer.normalize(raw), workspaceId, createdBy);
  }

  importFromCsv(raw: string, workspaceId: string, createdBy: string | null = null) {
    return this.importMany(this.csvNormalizer.normalize(raw), workspaceId, createdBy);
  }

  /** Converte os DTOs da API (POST /questions/import) para o formato neutro
   * e executa o pipeline. */
  async importFromDtos(
    dtos: ImportQuestionDto[],
    workspaceId: string,
    createdBy: string | null = null,
  ): Promise<ImportReport> {
    return this.importMany(dtos.map(toExternalQuestion), workspaceId, createdBy);
  }

  /** Pipeline completo: cada questão é validada, deduplicada e persistida em
   * sua própria transação (falhas isoladas não derrubam o lote). */
  async importMany(
    questions: ExternalQuestion[],
    workspaceId: string,
    createdBy: string | null = null,
  ): Promise<ImportReport> {
    const report: ImportReport = {
      total: questions.length,
      imported: 0,
      duplicates: 0,
      invalid: 0,
      errors: 0,
      details: [],
    };

    for (let index = 0; index < questions.length; index++) {
      const external = questions[index];
      const normalized = toNormalizedQuestion(external);

      const validationErrors = this.validator.validate(normalized);
      if (validationErrors.length > 0) {
        report.invalid += 1;
        report.details.push(this.issue(index, external, 'invalid', validationErrors.join(' ')));
        continue;
      }

      try {
        const duplicate = await this.importOne(normalized, workspaceId, createdBy);
        if (duplicate) {
          report.duplicates += 1;
          report.details.push(
            this.issue(index, external, 'duplicate', 'Questão já cadastrada neste workspace.'),
          );
        } else {
          report.imported += 1;
        }
      } catch (error) {
        this.logger.warn(`Falha ao importar questão #${index}: ${errorMessage(error)}`);
        report.errors += 1;
        report.details.push(this.issue(index, external, 'error', errorMessage(error)));
      }
    }

    return report;
  }

  /** Executa deduplicação + persistência de UMA questão dentro de uma
   * transação própria. Retorna a questão existente quando é duplicata. */
  private async importOne(
    normalized: NormalizedQuestion,
    workspaceId: string,
    createdBy: string | null,
  ): Promise<{ id: string } | null> {
    const { bySource, byContent } = this.deduplicator.deduplicationKey(normalized);
    const contentHash = byContent?.contentHash ?? null;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDuplicate(tx, workspaceId, bySource, byContent);
      if (existing) return { id: existing.id };

      await this.persist(tx, workspaceId, createdBy, normalized, contentHash);
      return null;
    });
  }

  /** Deduplicação ANTES da inserção: primeiro pelo identificador oficial da
   * fonte (sourceType+sourceId), depois pelo hash de conteúdo normalizado. */
  private async findDuplicate(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    bySource: { sourceType: string; sourceId: string } | null,
    byContent: { contentHash: string } | null,
  ) {
    if (bySource) {
      const bySourceKey = await this.questionsRepository.findBySourceKey(
        workspaceId,
        bySource.sourceType as QuestionSourceType,
        bySource.sourceId,
        tx,
      );
      if (bySourceKey) return bySourceKey;
    }
    if (byContent) {
      return this.questionsRepository.findByContentHash(workspaceId, byContent.contentHash, tx);
    }
    return null;
  }

  private async persist(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    createdBy: string | null,
    normalized: NormalizedQuestion,
    contentHash: string | null,
  ): Promise<void> {
    const subject = await this.subjectsRepository.upsertByName(normalized.subject, tx);
    let topicId: string | null = null;
    let examId: string | null = null;

    if (normalized.topic) {
      const topic = await this.subjectsRepository.upsertTopic(subject.id, normalized.topic, tx);
      topicId = topic.id;
    }
    if (normalized.exam) {
      const exam = await this.examsRepository.findOrCreate(
        { name: normalized.exam, year: normalized.year },
        tx,
      );
      examId = exam.id;
    }

    await this.questionsRepository.create(
      {
        workspaceId,
        createdBy,
        sourceType: normalized.sourceType,
        sourceName: normalized.sourceName,
        sourceId: normalized.sourceId,
        contentHash,
        subject: normalized.subject,
        topic: normalized.topic,
        difficulty: normalized.difficulty,
        exam: normalized.exam,
        year: normalized.year,
        examNumber: normalized.examNumber,
        stem: normalized.stem,
        explanation: normalized.explanation,
        imageUrl: normalized.imageUrl,
        subjectId: subject.id,
        topicId,
        examId,
        alternatives: normalized.alternatives.map((alternative, index) => ({
          text: alternative.text,
          position: index + 1,
          isCorrect: alternative.isCorrect,
        })),
      },
      tx,
    );
  }

  private issue(
    index: number,
    external: ExternalQuestion,
    type: ImportIssue['type'],
    message: string,
  ): ImportIssue {
    return { index, sourceId: external.sourceId ?? null, type, message };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido na importação.';
}

/** Converte um DTO da API de importação para o formato neutro da fonte. */
function toExternalQuestion(dto: ImportQuestionDto): ExternalQuestion {
  return {
    sourceType: dto.sourceType,
    sourceName: dto.sourceName,
    sourceId: dto.sourceId,
    exam: dto.exam,
    year: dto.year,
    examNumber: dto.examNumber,
    subject: dto.subject,
    topic: dto.topic,
    difficulty: dto.difficulty,
    stem: dto.stem,
    options: dto.options.map((option) => ({
      text: option.text,
      correct: option.correct,
    })),
    correctLetter: dto.correctLetter,
    correctOptionIndex: dto.correctOptionIndex,
    explanation: dto.explanation,
    imageUrl: dto.imageUrl,
  };
}
