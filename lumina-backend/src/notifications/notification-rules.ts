/**
 * Regras das notificações automáticas (Fase 3, item 51). Funções puras.
 * Horários sempre no fuso de Brasília (UTC−3, sem horário de verão).
 */

const BRT_OFFSET_MS = 3 * 3600_000;

export const NOTIFICATION_RULES = {
  /** "Prova próxima": avisa quem ainda não entregou nas 24 h antes do prazo. */
  dueSoonHours: 24,
  /** Revisão pendente: um aviso por dia, a partir das 8h. */
  reviewHourBrt: 8,
  /** Avisos manuais de professor/coordenação por pessoa por dia. */
  broadcastsPerDay: 20,
  /** Varredura das notificações automáticas. */
  sweepEveryMinutes: 15,
} as const;

/** Início do dia (00h de Brasília) em UTC. */
export function brtDayStart(now: Date): Date {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT_OFFSET_MS);
}

/** Fim do dia (23h59 de Brasília) em UTC. */
export function brtDayEnd(now: Date): Date {
  return new Date(brtDayStart(now).getTime() + 24 * 3600_000 - 1);
}

export function brtHour(now: Date): number {
  return new Date(now.getTime() - BRT_OFFSET_MS).getUTCHours();
}

/** Já passou da hora do aviso diário de revisão? */
export function isReviewHour(now: Date): boolean {
  return brtHour(now) >= NOTIFICATION_RULES.reviewHourBrt;
}

const ASSESSMENT_LABEL: Record<string, string> = {
  SIMULATION: 'simulado',
  TEST: 'prova',
  LIST: 'lista de exercícios',
  ACTIVITY: 'atividade',
};

export function assessmentLabel(type: string): string {
  return ASSESSMENT_LABEL[type] ?? 'atividade';
}

/** "sexta, 21/11, às 19h30" no fuso de Brasília. */
export function formatDue(at: Date): string {
  const local = new Date(at.getTime() - BRT_OFFSET_MS);
  const weekday = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][local.getUTCDay()];
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const h = local.getUTCHours();
  const min = local.getUTCMinutes();
  return `${weekday}, ${dd}/${mm}, às ${h}h${min ? String(min).padStart(2, '0') : ''}`;
}

/** Texto da notificação de nova atividade na turma. */
export function newActivityNotice(input: { type: string; title: string; className: string; dueAt: Date | null }) {
  const label = assessmentLabel(input.type);
  const article = label === 'prova' || label === 'lista de exercícios' || label === 'atividade' ? 'Nova' : 'Novo';
  return {
    title: `${article} ${label} na turma ${input.className}`,
    body: input.dueAt ? `${input.title} · prazo: ${formatDue(input.dueAt)}.` : input.title,
  };
}

/** Texto do aviso diário de revisão. */
export function reviewNotice(count: number) {
  return {
    title: count === 1 ? 'Você tem 1 revisão para hoje' : `Você tem ${count} revisões para hoje`,
    body: 'Revisar no dia certo é o que fixa o conteúdo. Leva poucos minutos.',
  };
}
