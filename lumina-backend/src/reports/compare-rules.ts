/**
 * Comparação de desempenho (Fase 3, item 43). Funções puras.
 *
 * Regra de ouro: compara agregados — turma com turma, aluno consigo mesmo e
 * aluno com a MÉDIA da turma. Nunca expõe a nota individual de outro aluno.
 */

/** Abaixo disso a porcentagem não é comparável (amostra pequena). */
export const MIN_ANSWERS_FOR_ACCURACY = 10;
export const MAX_CLASSES_COMPARED = 6;

export interface Delta {
  current: number | null;
  previous: number | null;
  /** current − previous; null se faltar um dos dois. */
  change: number | null;
  trend: 'up' | 'down' | 'same' | null;
}

/** Variação entre dois períodos. `tolerance` evita chamar 0,4 p.p. de melhora. */
export function delta(current: number | null, previous: number | null, tolerance = 1): Delta {
  if (current === null || previous === null) return { current, previous, change: null, trend: null };
  const change = Math.round((current - previous) * 10) / 10;
  return { current, previous, change, trend: Math.abs(change) < tolerance ? 'same' : change > 0 ? 'up' : 'down' };
}

/** Acerto só quando a amostra permite comparar. */
export function comparableAccuracy(accuracy: number | null, answers: number): number | null {
  return answers >= MIN_ANSWERS_FOR_ACCURACY ? accuracy : null;
}

/** Minutos por aluno ativo (quem fez algo no período); turma vazia = 0. */
export function perActive(total: number, active: number): number {
  return active > 0 ? Math.round(total / active) : 0;
}

export interface ClassSubjectInput {
  classId: string;
  subjects: Array<{ subject: string; attempts: number; accuracy: number | null }>;
}

/** Matriz matéria × turma, só com acerto comparável; matérias ordenadas por volume. */
export function subjectMatrix(classes: ClassSubjectInput[]) {
  const volume = new Map<string, number>();
  for (const c of classes) for (const s of c.subjects) volume.set(s.subject, (volume.get(s.subject) ?? 0) + s.attempts);
  const subjects = [...volume.entries()].sort((a, b) => b[1] - a[1]).map(([subject]) => subject);
  return subjects.map((subject) => ({
    subject,
    byClass: Object.fromEntries(
      classes.map((c) => {
        const row = c.subjects.find((s) => s.subject === subject);
        return [c.classId, row ? comparableAccuracy(row.accuracy, row.attempts) : null];
      }),
    ) as Record<string, number | null>,
  }));
}

/** Aluno × média da turma: diferença em pontos, sem posição nem ranking. */
export function versusAverage(mine: number | null, average: number | null) {
  if (mine === null || average === null) return { mine, average, difference: null as number | null };
  return { mine, average, difference: Math.round((mine - average) * 10) / 10 };
}

/** Matérias do aluno: atual × período anterior, só com amostra suficiente nos dois. */
export function subjectEvolution(
  current: Array<{ subject: string; attempts: number; accuracy: number | null }>,
  previous: Array<{ subject: string; attempts: number; accuracy: number | null }>,
  minAttempts = 5,
) {
  const prev = new Map(previous.map((s) => [s.subject, s]));
  return current
    .filter((s) => s.attempts >= minAttempts)
    .map((s) => {
      const p = prev.get(s.subject);
      return { subject: s.subject, attempts: s.attempts, ...delta(s.accuracy, p && p.attempts >= minAttempts ? p.accuracy : null) };
    })
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
}
