/**
 * Gerador de listas (Fase 1, item 37). Funções puras: compatibilidade com o
 * cartão-resposta e distribuição equilibrada entre assuntos.
 */

export const LIST_RULES = {
  minCount: 5,
  maxCount: 60,
  /** Assuntos mais fracos usados quando a lista se baseia nas dificuldades. */
  weakTopics: 5,
  /** Abaixo disso o assunto conta como dificuldade. */
  weakMastery: 70,
  /** "Não repetir o que já acertei" olha os últimos 90 dias. */
  recentDays: 90,
  /** Candidatas lidas do banco antes de sortear. */
  candidatePool: 800,
} as const;

/** Mesma regra da criação de simulado: 2 a 5 alternativas, uma correta, posições 1..n. */
export function isSheetCompatible(alternatives: Array<{ position: number; isCorrect: boolean }>): boolean {
  if (alternatives.length < 2 || alternatives.length > 5) return false;
  if (alternatives.filter((a) => a.isCorrect).length !== 1) return false;
  const positions = [...alternatives].map((a) => a.position).sort((a, b) => a - b);
  return positions.every((p, i) => p === i + 1);
}

/** Embaralhamento com gerador injetável (testes usam um fixo). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Candidate {
  id: string;
  /** Agrupador para equilibrar a lista (assunto, ou matéria quando falta). */
  bucket: string;
}

/**
 * Escolhe `count` questões alternando entre os grupos (assuntos), na ordem
 * de prioridade de `bucketOrder` (ex.: do assunto mais fraco para o menos
 * fraco); grupos fora da ordem entram depois, sorteados.
 */
export function pickBalanced(candidates: Candidate[], count: number, bucketOrder: string[] = [], random: () => number = Math.random): string[] {
  const byBucket = new Map<string, string[]>();
  for (const c of shuffle(candidates, random)) {
    const list = byBucket.get(c.bucket) ?? [];
    list.push(c.id);
    byBucket.set(c.bucket, list);
  }
  const known = bucketOrder.filter((b) => byBucket.has(b));
  const rest = shuffle([...byBucket.keys()].filter((b) => !bucketOrder.includes(b)), random);
  const order = [...known, ...rest];
  const picked: string[] = [];
  const seen = new Set<string>();
  while (picked.length < count) {
    let progressed = false;
    for (const bucket of order) {
      const list = byBucket.get(bucket)!;
      while (list.length && seen.has(list[0])) list.shift();
      const next = list.shift();
      if (!next) continue;
      picked.push(next);
      seen.add(next);
      progressed = true;
      if (picked.length >= count) break;
    }
    if (!progressed) break;
  }
  return picked;
}

/** Título sugerido para a lista. */
export function suggestedTitle(input: { basis: 'filters' | 'weaknesses'; subject?: string | null; topic?: string | null; forClass?: string | null; count: number }): string {
  const base = input.basis === 'weaknesses'
    ? input.forClass ? `Reforço da turma ${input.forClass}` : 'Lista das minhas dificuldades'
    : input.topic ? `Lista: ${input.topic}` : input.subject ? `Lista de ${input.subject}` : 'Lista de exercícios';
  return `${base} (${input.count} questões)`;
}
