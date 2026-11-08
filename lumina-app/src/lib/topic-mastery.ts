import type { TopicMasteryEntry, TopicMasteryStatus } from "./api";

/**
 * O mapa de domínio usa cinco faixas de leitura, mesmo que o banco tenha
 * cinco estados. "Aprendendo" e "praticando" são progresso; "precisa de
 * reforço" é o único estado que pede intervenção imediata. A tradução fica
 * aqui (e não no componente) para que a regra também seja testada sem
 * navegador.
 */
export type MasteryBand =
  | "DOMINADO"
  | "EM_PROGRESSO"
  | "ATENCAO"
  | "CRITICO"
  | "NAO_ESTUDADO";

export const MASTERY_BANDS: MasteryBand[] = [
  "DOMINADO",
  "EM_PROGRESSO",
  "ATENCAO",
  "CRITICO",
  "NAO_ESTUDADO",
];

export const MASTERY_STATUS_LABEL: Record<TopicMasteryStatus, string> = {
  NAO_ESTUDADO: "Não estudado",
  APRENDENDO: "Aprendendo",
  PRATICANDO: "Praticando",
  DOMINADO: "Dominado",
  PRECISA_REFORCO: "Precisa de reforço",
};

export const MASTERY_BAND_LABEL: Record<MasteryBand, string> = {
  DOMINADO: "Dominado",
  EM_PROGRESSO: "Em progresso",
  ATENCAO: "Atenção",
  CRITICO: "Crítico",
  NAO_ESTUDADO: "Não estudado",
};

export const MASTERY_BAND_HINT: Record<MasteryBand, string> = {
  DOMINADO: "Você já acerta com consistência.",
  EM_PROGRESSO: "Está evoluindo; mantenha a prática.",
  ATENCAO: "Ainda há lacunas para revisar.",
  CRITICO: "Prioridade de revisão na próxima sessão.",
  NAO_ESTUDADO: "Ainda não há tentativa registrada.",
};

export const MASTERY_BAND_CLASS: Record<MasteryBand, string> = {
  DOMINADO: "border-emerald-200 bg-emerald-50 text-emerald-950",
  EM_PROGRESSO: "border-sky-200 bg-sky-50 text-sky-950",
  ATENCAO: "border-amber-200 bg-amber-50 text-amber-950",
  CRITICO: "border-red-200 bg-red-50 text-red-950",
  NAO_ESTUDADO: "border-slate-200 bg-slate-50 text-slate-700",
};

export function masteryBand(status: TopicMasteryStatus): MasteryBand {
  switch (status) {
    case "DOMINADO":
      return "DOMINADO";
    case "PRATICANDO":
      return "EM_PROGRESSO";
    case "APRENDENDO":
      return "ATENCAO";
    case "PRECISA_REFORCO":
      return "CRITICO";
    case "NAO_ESTUDADO":
      return "NAO_ESTUDADO";
  }
}

/** 0–4, do cinza ao verde. A cor é só leitura rápida; o número continua visível. */
export function heatLevel(score: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (score < 25) return 1;
  if (score < 50) return 2;
  if (score < 75) return 3;
  return 4;
}

export const MASTERY_HEAT_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-slate-100 text-slate-700",
  1: "bg-orange-100 text-orange-950",
  2: "bg-amber-100 text-amber-950",
  3: "bg-lime-100 text-lime-950",
  4: "bg-emerald-100 text-emerald-950",
};

export function heatClass(score: number): string {
  return MASTERY_HEAT_CLASS[heatLevel(score)];
}

export function masteryAccuracy(entry: Pick<TopicMasteryEntry, "attempts" | "correctAttempts">): number | null {
  if (entry.attempts <= 0) return null;
  return Math.round((entry.correctAttempts / entry.attempts) * 100);
}

/** A revisão espaçada é gravada à meia-noite UTC; exibir em UTC evita pular
 *  um dia no fuso do navegador. */
export function formatMasteryDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function masteryReviewLabel(
  entry: Pick<TopicMasteryEntry, "nextReviewAt" | "due">
): string {
  if (!entry.nextReviewAt) return "Sem revisão agendada";
  if (entry.due) return "Revisão pendente";
  return `Revisar em ${formatMasteryDate(entry.nextReviewAt)}`;
}

export interface MasterySummary {
  total: number;
  byBand: Record<MasteryBand, number>;
  due: number;
  attempts: number;
  correctAttempts: number;
  accuracy: number | null;
  /** Média simples do domínio (0–100) dos tópicos do recorte. */
  averageScore: number | null;
}

export function summarizeMastery(entries: TopicMasteryEntry[]): MasterySummary {
  const byBand: Record<MasteryBand, number> = {
    DOMINADO: 0,
    EM_PROGRESSO: 0,
    ATENCAO: 0,
    CRITICO: 0,
    NAO_ESTUDADO: 0,
  };
  let due = 0;
  let attempts = 0;
  let correctAttempts = 0;
  let scoreTotal = 0;

  for (const entry of entries) {
    byBand[masteryBand(entry.status)] += 1;
    if (entry.due) due += 1;
    attempts += entry.attempts;
    correctAttempts += entry.correctAttempts;
    scoreTotal += entry.masteryScore;
  }

  return {
    total: entries.length,
    byBand,
    due,
    attempts,
    correctAttempts,
    accuracy: attempts > 0 ? Math.round((correctAttempts / attempts) * 100) : null,
    averageScore: entries.length > 0 ? Math.round(scoreTotal / entries.length) : null,
  };
}

export interface MasteryFilters {
  subjectId?: string;
  band?: MasteryBand;
  dueOnly?: boolean;
  search?: string;
}

/** Busca sem acento e sem caixa: "funcoes" encontra "Funções". */
function normalizeMasteryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function filterMastery(entries: TopicMasteryEntry[], filters: MasteryFilters): TopicMasteryEntry[] {
  const needle = normalizeMasteryText((filters.search ?? '').trim());
  return entries.filter((entry) => {
    if (filters.subjectId && entry.subjectId !== filters.subjectId) return false;
    if (filters.band && masteryBand(entry.status) !== filters.band) return false;
    if (filters.dueOnly && !entry.due) return false;
    if (needle) {
      const haystack = normalizeMasteryText(`${entry.subject} ${entry.topic}`);
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export interface MasterySubjectGroup {
  subjectId: string;
  subject: string;
  topics: TopicMasteryEntry[];
  summary: MasterySummary;
}

/** Agrupa por matéria preservando a ordem que veio da API (já por nome). */
export function groupMasteryBySubject(entries: TopicMasteryEntry[]): MasterySubjectGroup[] {
  const groups = new Map<string, TopicMasteryEntry[]>();
  for (const entry of entries) {
    const rows = groups.get(entry.subjectId) ?? [];
    rows.push(entry);
    groups.set(entry.subjectId, rows);
  }
  return Array.from(groups, ([subjectId, topics]) => ({
    subjectId,
    subject: topics[0]?.subject ?? "",
    topics,
    summary: summarizeMastery(topics),
  }));
}

export function hasMasteryFilters(filters: MasteryFilters): boolean {
  return Boolean(filters.subjectId || filters.band || filters.dueOnly || (filters.search ?? "").trim());
}

/** Faixa que mais aparece no recorte; empate mantém a primeira da ordem
 *  (dominado → em progresso → atenção → crítico → não estudado). */
export function dominantMasteryBand(counts: Record<MasteryBand, number>): MasteryBand {
  const total = MASTERY_BANDS.reduce((sum, band) => sum + counts[band], 0);
  if (total === 0) return "NAO_ESTUDADO";
  return MASTERY_BANDS.reduce(
    (best, band) => (counts[band] > counts[best] ? band : best),
    MASTERY_BANDS[0],
  );
}
