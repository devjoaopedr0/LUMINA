/**
 * Datas do cronograma no app. "Hoje" é o dia do relógio da máquina do aluno
 * (fuso local), no formato do <input type="date">. O servidor confere de novo
 * com a mesma regra (início a partir de hoje, fim até o prazo máximo da gama
 * de conteúdos).
 */
export interface ScheduleLimits {
  minStart: string;
  maxEnd: string;
  topics: number;
  contentMinutes: number;
  weeklyMinutes: number;
  contentDays: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-16" no fuso da máquina. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "16/11/2026" a partir de "2026-11-16". */
export function brDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Objetivo mostrado a partir do perfil (mesma regra do servidor). */
export function profileGoalText(course?: string | null, university?: string | null): string | null {
  const c = course?.trim();
  if (!c) return null;
  const u = university?.trim();
  return u ? `${c} na ${u}` : c;
}

/**
 * Erro das datas antes de enviar, ou null.
 * `keepStart`: na edição, manter o início antigo (mesmo já passado) é permitido.
 */
export function scheduleDateError(
  input: { startDate: string; endDate: string; keepStart?: string; limits?: ScheduleLimits | null },
  today: string = localToday(),
): string | null {
  const { startDate, endDate, keepStart, limits } = input;
  if (!startDate || !endDate) return "Preencha as datas de início e de término.";
  if (startDate < today && startDate !== keepStart) return `A data de início não pode ser antes de hoje (${brDate(today)}).`;
  if (endDate < today) return "A data de término não pode ser antes de hoje.";
  if (endDate < startDate) return "A data de término deve ser igual ou posterior à de início.";
  if (limits && endDate > limits.maxEnd) {
    const hours = Math.round(limits.weeklyMinutes / 6) / 10;
    return `Com ${hours} h por semana, o conteúdo das matérias escolhidas${limits.topics ? ` (${limits.topics} assuntos)` : ""} cabe até ${brDate(limits.maxEnd)}. Escolha uma data de término até lá.`;
  }
  return null;
}
