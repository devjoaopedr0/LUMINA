import { ENEM_AREAS, ENEM_MATRIX, ENEM_MATRIX_SOURCE, type EnemArea, findSkill, skillCode } from './enem-matrix';

/** Uma resposta do aluno a uma questão já classificada por habilidade. */
export interface SkillAnswerEvent {
  code: string;
  correct: boolean;
  at: Date;
  /** A classificação ainda é uma sugestão da IA não validada. */
  provisional: boolean;
}

export interface SkillMasteryRow {
  code: string;
  n: number;
  text: string;
  attempts: number;
  correct: number;
  /** % de acerto; null sem resposta. Nunca é convertido em nota TRI. */
  accuracy: number | null;
  lastAt: string | null;
  /** Questões disponíveis no banco para praticar esta habilidade. */
  available: number;
  /** Parte das respostas veio de questões com classificação ainda não validada. */
  provisional: boolean;
}

export interface SkillMasteryReport {
  source: string;
  /** Mínimo de respostas para a habilidade receber cor no mapa. */
  minAttempts: number;
  classifiedQuestions: number;
  pendingValidation: number;
  areas: {
    area: EnemArea;
    name: string;
    attempts: number;
    correct: number;
    competencies: { n: number; text: string; attempts: number; correct: number; skills: SkillMasteryRow[] }[];
  }[];
}

export const SKILL_MIN_ATTEMPTS = 3;

const pct = (correct: number, attempts: number) => (attempts ? Math.round((correct / attempts) * 100) : null);

/** Agrega as respostas por habilidade, competência e área (função pura, testável). */
export function buildSkillMastery(
  events: SkillAnswerEvent[],
  available: Map<string, number>,
  counts: { classifiedQuestions: number; pendingValidation: number },
): SkillMasteryReport {
  const bySkill = new Map<string, { attempts: number; correct: number; lastAt: Date | null; provisional: boolean }>();
  for (const e of events) {
    const skill = findSkill(e.code);
    if (!skill) continue;
    const cur = bySkill.get(skill.code) ?? { attempts: 0, correct: 0, lastAt: null, provisional: false };
    cur.attempts += 1;
    if (e.correct) cur.correct += 1;
    if (!cur.lastAt || e.at > cur.lastAt) cur.lastAt = e.at;
    if (e.provisional) cur.provisional = true;
    bySkill.set(skill.code, cur);
  }

  return {
    source: ENEM_MATRIX_SOURCE,
    minAttempts: SKILL_MIN_ATTEMPTS,
    ...counts,
    areas: ENEM_AREAS.map((area) => {
      const matrix = ENEM_MATRIX[area];
      const competencies = matrix.competencies.map((c) => {
        const skills = matrix.skills
          .filter((s) => s.competency === c.n)
          .map((s): SkillMasteryRow => {
            const code = skillCode(area, s.n);
            const stat = bySkill.get(code);
            return {
              code,
              n: s.n,
              text: s.text,
              attempts: stat?.attempts ?? 0,
              correct: stat?.correct ?? 0,
              accuracy: pct(stat?.correct ?? 0, stat?.attempts ?? 0),
              lastAt: stat?.lastAt?.toISOString() ?? null,
              available: available.get(code) ?? 0,
              provisional: stat?.provisional ?? false,
            };
          });
        const attempts = skills.reduce((t, s) => t + s.attempts, 0);
        const correct = skills.reduce((t, s) => t + s.correct, 0);
        return { n: c.n, text: c.text, attempts, correct, skills };
      });
      return {
        area,
        name: matrix.name,
        attempts: competencies.reduce((t, c) => t + c.attempts, 0),
        correct: competencies.reduce((t, c) => t + c.correct, 0),
        competencies,
      };
    }),
  };
}
