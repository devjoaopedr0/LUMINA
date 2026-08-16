import { createHash } from 'node:crypto';
import { NormalizedQuestion } from '../domain/question-types';

/** Resultado da checagem de duplicata para uma questão. */
export interface DeduplicationResult {
  isDuplicate: boolean;
  existingQuestionId?: string;
  contentHash: string | null;
}

/**
 * Estratégia de deduplicação, aplicada ANTES da inserção definitiva:
 *
 * 1. Se a fonte tem identificador oficial (sourceId), casamos por ele —
 *    o mesmo dataset/API não pode cadastrar a questão duas vezes.
 * 2. Independente do sourceId, calculamos um hash sha256 do conteúdo
 *    normalizado (enunciado + alternativas + disciplina/ano) — pega questões
 *    equivalentes vindas de fontes diferentes, mesmo sem id oficial.
 *
 * A checagem real no banco (findByContentHash / findBySourceKey) fica por
 * conta do repositório; esta classe só gera o hash e decide a estratégia.
 */
export class QuestionDeduplicator {
  computeContentHash(question: NormalizedQuestion): string {
    const canonical = JSON.stringify({
      stem: question.stem.toLowerCase().replace(/\s+/g, ' ').trim(),
      alternatives: question.alternatives.map((a) =>
        a.text.toLowerCase().replace(/\s+/g, ' ').trim(),
      ),
      subject: question.subject.toLowerCase().replace(/\s+/g, ' ').trim(),
      topic: question.topic.toLowerCase().replace(/\s+/g, ' ').trim(),
      year: question.year,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  /** Define qual chave usar na busca por duplicata. */
  deduplicationKey(question: NormalizedQuestion): {
    bySource: { sourceType: string; sourceId: string } | null;
    byContent: { contentHash: string } | null;
  } {
    const bySource =
      question.sourceId && question.sourceType
        ? { sourceType: question.sourceType, sourceId: question.sourceId }
        : null;
    const byContent = { contentHash: this.computeContentHash(question) };
    return { bySource, byContent };
  }
}
