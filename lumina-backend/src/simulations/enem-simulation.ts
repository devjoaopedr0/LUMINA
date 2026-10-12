import { StudyArea } from '@prisma/client';

/**
 * Simulado modelo ENEM: um dia de prova, 90 questões — 45 de cada uma das
 * duas áreas do dia, com o tempo oficial. (A redação do 1º dia não entra
 * aqui: ela tem fluxo próprio no app.)
 */
export const ENEM_QUESTIONS_PER_AREA = 45;

export const ENEM_DAYS: Record<1 | 2, { areas: [StudyArea, StudyArea]; minutes: number; title: string }> = {
  1: { areas: [StudyArea.LINGUAGENS, StudyArea.HUMANAS], minutes: 330, title: 'Simulado ENEM — 1º dia (Linguagens e Ciências Humanas)' },
  2: { areas: [StudyArea.NATUREZA, StudyArea.MATEMATICA], minutes: 300, title: 'Simulado ENEM — 2º dia (Ciências da Natureza e Matemática)' },
};

/** Nome oficial de cada área na prova (vai para SimulationItem.area). */
export const ENEM_AREA_NAME: Record<StudyArea, string> = {
  LINGUAGENS: 'Linguagens, Códigos e suas Tecnologias',
  HUMANAS: 'Ciências Humanas e suas Tecnologias',
  NATUREZA: 'Ciências da Natureza e suas Tecnologias',
  MATEMATICA: 'Matemática e suas Tecnologias',
};

const AREA_BY_ENEM_NAME = new Map(Object.entries(ENEM_AREA_NAME).map(([area, name]) => [name, area as StudyArea]));

export function areaOfEnemName(name: string | null | undefined): StudyArea | undefined {
  return name ? AREA_BY_ENEM_NAME.get(name) : undefined;
}

export interface EnemCandidate {
  id: string;
  subject: string;
  /** O aluno já respondeu esta questão alguma vez. */
  answered: boolean;
}

/**
 * Escolhe as questões de uma área: as matérias se revezam (ninguém toma a
 * prova inteira) e, dentro de cada uma, vêm primeiro as que o aluno nunca
 * respondeu, em ordem sorteada — dois simulados não saem iguais enquanto o
 * banco tiver questão sobrando. Devolve agrupado por matéria, como na prova.
 */
export function pickEnemQuestions(
  pool: EnemCandidate[],
  count = ENEM_QUESTIONS_PER_AREA,
  random: () => number = Math.random,
): EnemCandidate[] {
  const bySubject = new Map<string, { candidate: EnemCandidate; order: number }[]>();
  for (const candidate of pool) {
    const list = bySubject.get(candidate.subject) ?? [];
    list.push({ candidate, order: random() });
    bySubject.set(candidate.subject, list);
  }
  const queues = [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([, list]) =>
      list
        .sort((a, b) => Number(a.candidate.answered) - Number(b.candidate.answered) || a.order - b.order)
        .map((entry) => entry.candidate),
    );

  const picked: EnemCandidate[] = [];
  for (let round = 0; picked.length < count; round++) {
    const fromRound = queues.map((queue) => queue[round]).filter((candidate): candidate is EnemCandidate => Boolean(candidate));
    if (fromRound.length === 0) break;
    picked.push(...fromRound.slice(0, count - picked.length));
  }
  return picked.sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
}
