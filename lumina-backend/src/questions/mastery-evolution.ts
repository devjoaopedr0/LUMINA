/**
 * Evolução do domínio por assunto (mapa de domínio, item 30).
 *
 * O histórico (`topic_mastery_history`) só ganha linha nos dias em que o aluno
 * estudou o tópico. Para cada ponto da série, o valor do tópico é o último
 * registro até aquele dia; antes do primeiro registro, o tópico não entra na
 * média (não é "zero": ele ainda não tinha sido estudado).
 */

export interface HistoryRow {
  topicId: string;
  day: Date;
  masteryScore: number;
}

export interface TopicRef {
  topicId: string;
  topic: string;
  subject: string;
}

export interface TopicChange {
  topicId: string;
  topic: string;
  subject: string;
  from: number;
  to: number;
  delta: number;
}

export interface MasteryEvolution {
  /** Datas dos pontos ("AAAA-MM-DD"), da mais antiga para hoje, a cada 7 dias. */
  points: string[];
  /** Média dos tópicos já estudados em cada ponto (null quando nenhum). */
  overall: (number | null)[];
  subjects: { subject: string; series: (number | null)[] }[];
  /** Comparação com 7 dias atrás. */
  week: { improved: TopicChange[]; declined: TopicChange[]; started: number };
}

const DAY_MS = 86_400_000;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const average = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

export function buildMasteryEvolution(rows: HistoryRow[], topics: TopicRef[], today: Date, weeks = 8): MasteryEvolution {
  const end = new Date(`${dayKey(today)}T00:00:00.000Z`);
  const points = Array.from({ length: weeks + 1 }, (_, i) => new Date(end.getTime() - (weeks - i) * 7 * DAY_MS));

  // Registros de cada tópico em ordem de data.
  const byTopic = new Map<string, HistoryRow[]>();
  for (const row of rows) byTopic.set(row.topicId, [...(byTopic.get(row.topicId) ?? []), row]);
  for (const list of byTopic.values()) list.sort((a, b) => a.day.getTime() - b.day.getTime());

  /** Último valor do tópico até o dia (inclusive). */
  const scoreAt = (topicId: string, at: Date): number | null => {
    let value: number | null = null;
    for (const row of byTopic.get(topicId) ?? []) {
      if (row.day.getTime() > at.getTime()) break;
      value = row.masteryScore;
    }
    return value;
  };

  const known = topics.filter((t) => byTopic.has(t.topicId));
  const overall = points.map((at) => average(known.map((t) => scoreAt(t.topicId, at)).filter((v): v is number => v !== null)));

  const subjectNames = [...new Set(known.map((t) => t.subject))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const subjects = subjectNames.map((subject) => ({
    subject,
    series: points.map((at) =>
      average(known.filter((t) => t.subject === subject).map((t) => scoreAt(t.topicId, at)).filter((v): v is number => v !== null)),
    ),
  }));

  const weekAgo = new Date(end.getTime() - 7 * DAY_MS);
  const changes: TopicChange[] = [];
  let started = 0;
  for (const t of known) {
    const to = scoreAt(t.topicId, end);
    const from = scoreAt(t.topicId, weekAgo);
    if (to === null) continue;
    if (from === null) {
      started++;
      continue;
    }
    if (to !== from) changes.push({ ...t, from, to, delta: to - from });
  }

  return {
    points: points.map(dayKey),
    overall,
    subjects,
    week: {
      improved: changes.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5),
      declined: changes.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
      started,
    },
  };
}
