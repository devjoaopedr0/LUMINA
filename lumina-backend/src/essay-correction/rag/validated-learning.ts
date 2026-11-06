import { COMPETENCY_IDS, CompetencyId } from '../knowledge';
import type { ValidatedLearningExample } from '../grading/essay-grader';

/**
 * Registro mínimo necessário para recuperar um aprendizado validado. A
 * consulta ao banco já aplica os filtros de governança (nível, anonimização,
 * consentimento, arquivamento e exclusão da redação atual); esta camada só
 * ordena os candidatos por proximidade lexical com a redação em correção.
 */
export interface ValidatedLearningCandidate {
  id: string;
  competency: string;
  criterion: string | null;
  humanScore: number | null;
  aiScore: number | null;
  evidence: string | null;
  learning: string;
  divergenceReason: string | null;
  version: number;
  validatedAt: Date | null;
}

const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'entre', 'essa', 'esse',
  'esta', 'este', 'eu', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelo', 'por', 'que',
  'se', 'sem', 'ser', 'sua', 'suas', 'seu', 'seus', 'um', 'uma', 'nao', 'não', 'mais', 'menos', 'muito',
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  );
}

function overlapScore(query: Set<string>, candidate: Set<string>): number {
  let score = 0;
  for (const token of candidate) if (query.has(token)) score += 1;
  return score;
}

/**
 * Recupera, por competência, os exemplos validados mais próximos do texto e
 * do tema atuais. Não usa a nota humana da redação em correção e não mistura
 * competências: cada prompt recebe apenas os exemplos daquela competência.
 */
export function selectValidatedLearningExamples(
  records: ValidatedLearningCandidate[],
  essayText: string,
  theme: string,
  limitPerCompetency = 2,
): Partial<Record<CompetencyId, ValidatedLearningExample[]>> {
  const query = tokens(`${theme}\n${essayText}`);
  const selected: Partial<Record<CompetencyId, ValidatedLearningExample[]>> = {};

  for (const competency of COMPETENCY_IDS) {
    const candidates = records
      .filter((record) => record.competency === competency)
      .map((record) => {
        const haystack = tokens(
          [record.criterion, record.learning, record.evidence, record.divergenceReason].filter(Boolean).join(' '),
        );
        return { record, score: overlapScore(query, haystack) };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTime = a.record.validatedAt?.getTime() ?? 0;
        const bTime = b.record.validatedAt?.getTime() ?? 0;
        if (bTime !== aTime) return bTime - aTime;
        return a.record.id.localeCompare(b.record.id);
      })
      .slice(0, Math.max(0, limitPerCompetency));

    if (candidates.length) {
      selected[competency] = candidates.map(({ record }) => ({
        id: record.id,
        competency,
        criterion: record.criterion,
        humanScore: record.humanScore,
        aiScore: record.aiScore,
        evidence: record.evidence,
        learning: record.learning,
        divergenceReason: record.divergenceReason,
        version: record.version,
      }));
    }
  }

  return selected;
}
