/**
 * Plano de recuperação (item 42), regras puras.
 *
 * Etapas fixas, nesta ordem:
 *  1. VIDEO    — revisar o conteúdo (videoaula do assunto, no nível do aluno);
 *  2. EASY     — questões fáceis;
 *  3. MEDIUM   — questões médias (libera quando a etapa fácil atinge a meta);
 *  4. HARD     — questões difíceis (libera quando a média atinge a meta);
 *  5. REVIEW   — revisão agendada (3 dias depois): refaz as que errou;
 *  6. REASSESS — reavaliação: domínio do assunto agora x no começo do plano.
 *
 * O banco é esparso (metade dos assuntos tem até 2 questões), então as
 * questões vêm de um funil: assunto → habilidade do ENEM das questões do
 * assunto → matéria. A etapa sem questões daquele nível pega do nível
 * vizinho e avisa; a etapa sem nenhuma questão é pulada e o plano diz por quê.
 */
export type StepKind = 'VIDEO' | 'EASY' | 'MEDIUM' | 'HARD' | 'REVIEW' | 'REASSESS';
export type Difficulty = 'FACIL' | 'MEDIA' | 'DIFICIL';
export type PoolSource = 'TOPIC' | 'SKILL' | 'SUBJECT';

export interface StepDef {
  kind: StepKind;
  title: string;
  questionIds: string[];
  /** Acertos necessários (etapas de questões). */
  target: number;
  note?: string;
}

export interface PoolQuestion {
  id: string;
  difficulty: Difficulty;
  source: PoolSource;
  /** O aluno já acertou esta questão antes do plano. */
  alreadyCorrect: boolean;
  answeredBefore: boolean;
}

export const STEP_SIZE: Record<'EASY' | 'MEDIUM' | 'HARD', number> = { EASY: 4, MEDIUM: 4, HARD: 2 };
export const REVIEW_AFTER_DAYS = 3;
export const REVIEW_MIN = 3;
export const PASS_RATIO = 0.7;

const LEVEL: Record<'EASY' | 'MEDIUM' | 'HARD', Difficulty> = { EASY: 'FACIL', MEDIUM: 'MEDIA', HARD: 'DIFICIL' };
const NEIGHBORS: Record<Difficulty, Difficulty[]> = { FACIL: ['MEDIA', 'DIFICIL'], MEDIA: ['FACIL', 'DIFICIL'], DIFICIL: ['MEDIA', 'FACIL'] };
const SOURCE_RANK: Record<PoolSource, number> = { TOPIC: 0, SKILL: 1, SUBJECT: 2 };
const DIFF_LABEL: Record<Difficulty, string> = { FACIL: 'fáceis', MEDIA: 'médias', DIFICIL: 'difíceis' };

/** Acertos necessários: com até 2 questões, todas; acima disso, 70% arredondado (3→2, 4→3, 10→7). */
export const target = (n: number) => (n <= 2 ? Math.max(1, n) : Math.round(n * PASS_RATIO));

/** Ordem de preferência: assunto antes de habilidade antes de matéria; nunca respondida antes de errada antes de acertada. */
function rank(q: PoolQuestion): number {
  return SOURCE_RANK[q.source] * 10 + (q.answeredBefore ? (q.alreadyCorrect ? 2 : 1) : 0);
}

export function buildSteps(pool: PoolQuestion[], topicName: string): StepDef[] {
  const used = new Set<string>();
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b));
  const take = (difficulty: Difficulty, n: number) => {
    const picked = sorted.filter((q) => q.difficulty === difficulty && !used.has(q.id)).slice(0, n);
    picked.forEach((q) => used.add(q.id));
    return picked;
  };

  const steps: StepDef[] = [
    { kind: 'VIDEO', title: `Revisar ${topicName} em uma videoaula`, questionIds: [], target: 0 },
  ];
  for (const kind of ['EASY', 'MEDIUM', 'HARD'] as const) {
    const level = LEVEL[kind];
    let picked = take(level, STEP_SIZE[kind]);
    let note: string | undefined;
    if (picked.length < STEP_SIZE[kind]) {
      const missing = STEP_SIZE[kind] - picked.length;
      for (const other of NEIGHBORS[level]) {
        if (picked.length >= STEP_SIZE[kind]) break;
        const extra = take(other, STEP_SIZE[kind] - picked.length);
        if (extra.length) note = `O banco não tem questões ${DIFF_LABEL[level]} suficientes; ${extra.length} de outro nível completam a etapa.`;
        picked = [...picked, ...extra];
      }
      if (!picked.length) note = `O banco ainda não tem questões ${DIFF_LABEL[level]} para este assunto; a etapa foi pulada.`;
      else if (picked.length < STEP_SIZE[kind] && !note) note = `Só ${picked.length} de ${picked.length + missing} questões disponíveis.`;
    }
    const titles = { EASY: 'Começar pelas fáceis', MEDIUM: 'Subir para as médias', HARD: 'Desafio com as difíceis' } as const;
    steps.push({ kind, title: titles[kind], questionIds: picked.map((q) => q.id), target: picked.length ? target(picked.length) : 0, ...(note ? { note } : {}) });
  }
  steps.push({ kind: 'REVIEW', title: 'Revisão agendada', questionIds: [], target: 0, note: 'Refaça as questões que errou no plano.' });
  steps.push({ kind: 'REASSESS', title: 'Reavaliar o domínio', questionIds: [], target: 0 });
  return steps;
}

export interface AttemptLite {
  questionId: string;
  isCorrect: boolean;
  at: Date;
}

export type StepState = 'LOCKED' | 'AVAILABLE' | 'DONE' | 'SKIPPED' | 'WAITING';

export interface StepProgress extends StepDef {
  state: StepState;
  answered: number;
  correct: number;
  /** Resultado mais recente por questão (para a tela marcar certo/errado). */
  results: Record<string, boolean>;
}

export interface PlanProgress {
  steps: StepProgress[];
  /** O plano chegou ao fim (revisão feita). */
  finished: boolean;
  reviewQuestionIds: string[];
}

function latest(attempts: AttemptLite[], ids: string[], since: Date): Map<string, AttemptLite> {
  const set = new Set(ids);
  const out = new Map<string, AttemptLite>();
  for (const a of attempts) {
    if (!set.has(a.questionId) || a.at < since) continue;
    const cur = out.get(a.questionId);
    if (!cur || a.at > cur.at) out.set(a.questionId, a);
  }
  return out;
}

/** Quando a meta da etapa foi atingida pela primeira vez (a etapa fica concluída). */
function reachedAt(attempts: AttemptLite[], ids: string[], goal: number, since: Date): Date | null {
  const set = new Set(ids);
  const last = new Map<string, boolean>();
  for (const a of [...attempts].filter((x) => set.has(x.questionId) && x.at >= since).sort((x, y) => x.at.getTime() - y.at.getTime())) {
    last.set(a.questionId, a.isCorrect);
    if ([...last.values()].filter(Boolean).length >= goal) return a.at;
  }
  return null;
}

/**
 * Progresso calculado na leitura, a partir das respostas do aluno.
 * - Etapa de questões: conta a última resposta de cada questão (refazer
 *   corrige) e, uma vez atingida a meta, a etapa fica concluída: refazer
 *   depois, na revisão, não desfaz.
 * - Revisão: as questões que o aluno errou na primeira tentativa dentro do
 *   plano (sem erros, até 3 das praticadas). Vale a partir da data agendada
 *   e de quando as etapas de questões terminaram, o que vier depois.
 */
export function computeProgress(
  steps: StepDef[],
  attempts: AttemptLite[],
  plan: { createdAt: Date; reviewAt: Date; videoWatchedAt: Date | null },
  now: Date,
): PlanProgress {
  const out: StepProgress[] = [];
  let unlocked = true;
  let practiceDoneAt = plan.createdAt;
  const wrong: string[] = [];
  const practiced: string[] = [];
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstTry = new Map<string, boolean>();
  for (const a of sorted) if (a.at >= plan.createdAt && !firstTry.has(a.questionId)) firstTry.set(a.questionId, a.isCorrect);

  for (const step of steps) {
    if (step.kind === 'VIDEO') {
      out.push({ ...step, state: plan.videoWatchedAt ? 'DONE' : 'AVAILABLE', answered: 0, correct: 0, results: {} });
      continue; // a videoaula é recomendada, não bloqueia as questões
    }
    if (step.kind === 'EASY' || step.kind === 'MEDIUM' || step.kind === 'HARD') {
      if (!step.questionIds.length) {
        out.push({ ...step, state: 'SKIPPED', answered: 0, correct: 0, results: {} });
        continue;
      }
      const last = latest(sorted, step.questionIds, plan.createdAt);
      const results = Object.fromEntries([...last].map(([id, a]) => [id, a.isCorrect]));
      const correct = [...last.values()].filter((a) => a.isCorrect).length;
      const doneAt = reachedAt(sorted, step.questionIds, step.target, plan.createdAt);
      out.push({ ...step, state: !unlocked ? 'LOCKED' : doneAt ? 'DONE' : 'AVAILABLE', answered: last.size, correct, results });
      practiced.push(...step.questionIds);
      wrong.push(...step.questionIds.filter((id) => firstTry.get(id) === false));
      if (doneAt && doneAt > practiceDoneAt) practiceDoneAt = doneAt;
      unlocked = unlocked && !!doneAt;
      continue;
    }
    if (step.kind === 'REVIEW') {
      const ids = wrong.length ? wrong : practiced.slice(0, REVIEW_MIN);
      const opensAt = plan.reviewAt > practiceDoneAt ? plan.reviewAt : practiceDoneAt;
      const last = latest(sorted, ids, opensAt);
      const results = Object.fromEntries([...last].map(([id, a]) => [id, a.isCorrect]));
      const correct = [...last.values()].filter((a) => a.isCorrect).length;
      const reviewTarget = ids.length ? target(ids.length) : 0;
      const state: StepState = !unlocked ? 'LOCKED' : now < plan.reviewAt ? 'WAITING' : !ids.length || correct >= reviewTarget ? 'DONE' : 'AVAILABLE';
      out.push({ ...step, questionIds: ids, target: reviewTarget, state, answered: last.size, correct, results });
      unlocked = unlocked && state === 'DONE';
      continue;
    }
    out.push({ ...step, state: unlocked ? 'DONE' : 'LOCKED', answered: 0, correct: 0, results: {} });
  }
  const finished = out.find((s) => s.kind === 'REVIEW')?.state === 'DONE';
  return { steps: out, finished, reviewQuestionIds: out.find((s) => s.kind === 'REVIEW')?.questionIds ?? [] };
}

/** Assunto mais fraco do aluno (com tentativas), para o plano automático. */
export function weakestTopic<T extends { topicId: string; masteryScore: number; attempts: number }>(rows: T[], excluded: Set<string>): T | null {
  return [...rows].filter((r) => r.attempts > 0 && !excluded.has(r.topicId)).sort((a, b) => a.masteryScore - b.masteryScore || b.attempts - a.attempts)[0] ?? null;
}
