import type { TeacherAnalyticsSignal } from './teacher-analytics';

/**
 * Ciclo de vida dos alertas pedagógicos persistidos (item 41).
 *
 * A cada leitura (janela fixa de 30 dias, todas as turmas do professor), os
 * sinais calculados são comparados com os alertas guardados:
 * - sinal novo → alerta OPEN;
 * - sinal que continua → atualiza texto, gravidade e `lastSeenAt`;
 * - alerta dispensado que piorou (gravidade subiu) → reabre;
 * - alerta resolvido cujo sinal voltou → reabre (`reopenCount` + 1);
 * - alerta aberto/em acompanhamento cujo sinal sumiu → RESOLVED automático.
 * Toda mudança de estado entra no histórico.
 */
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface AlertHistoryEntry {
  at: string;
  by: string | null;
  from: AlertStatus | null;
  to: AlertStatus;
  note?: string;
}

export interface StoredAlert {
  id: string;
  fingerprint: string;
  severity: string;
  status: AlertStatus;
  reopenCount: number;
  history: AlertHistoryEntry[];
}

export interface AlertWrite {
  kind: string;
  severity: string;
  classId: string | null;
  studentId: string | null;
  questionKey: string | null;
  title: string;
  detail: string;
  recommendation: string;
  metric: number | null;
  lastSeenAt: Date;
}

export interface AlertSyncPlan {
  create: (AlertWrite & { fingerprint: string; status: AlertStatus; firstSeenAt: Date; history: AlertHistoryEntry[] })[];
  update: { id: string; data: Partial<AlertWrite> & { status?: AlertStatus; autoResolved?: boolean; reopenCount?: number; closedAt?: Date | null; history?: AlertHistoryEntry[] } }[];
}

const SEVERITY_WEIGHT: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const OPEN_STATES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED'];

function toWrite(signal: TeacherAnalyticsSignal, now: Date): AlertWrite {
  return {
    kind: signal.kind,
    severity: signal.severity,
    classId: signal.classId,
    studentId: signal.studentId,
    questionKey: signal.questionKey,
    title: signal.title,
    detail: signal.detail,
    recommendation: signal.recommendation,
    metric: signal.metric,
    lastSeenAt: now,
  };
}

export function planAlertSync(stored: StoredAlert[], signals: TeacherAnalyticsSignal[], now: Date): AlertSyncPlan {
  const at = now.toISOString();
  const byFingerprint = new Map(stored.map((a) => [a.fingerprint, a]));
  const seen = new Set<string>();
  const plan: AlertSyncPlan = { create: [], update: [] };

  for (const signal of signals) {
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);
    const current = byFingerprint.get(signal.id);
    const write = toWrite(signal, now);
    if (!current) {
      plan.create.push({ ...write, fingerprint: signal.id, status: 'OPEN', firstSeenAt: now, history: [{ at, by: null, from: null, to: 'OPEN' }] });
      continue;
    }
    const worsened = (SEVERITY_WEIGHT[signal.severity] ?? 0) > (SEVERITY_WEIGHT[current.severity] ?? 0);
    const reopen = current.status === 'RESOLVED' || (current.status === 'DISMISSED' && worsened);
    if (reopen) {
      plan.update.push({
        id: current.id,
        data: {
          ...write,
          status: 'OPEN',
          autoResolved: false,
          closedAt: null,
          reopenCount: current.reopenCount + 1,
          history: [...current.history, { at, by: null, from: current.status, to: 'OPEN', note: current.status === 'DISMISSED' ? 'Reaberto: a gravidade aumentou.' : 'Reaberto: o sinal voltou a aparecer.' }],
        },
      });
    } else {
      plan.update.push({ id: current.id, data: write });
    }
  }

  for (const alert of stored) {
    if (seen.has(alert.fingerprint) || !OPEN_STATES.includes(alert.status)) continue;
    plan.update.push({
      id: alert.id,
      data: {
        status: 'RESOLVED',
        autoResolved: true,
        closedAt: now,
        history: [...alert.history, { at, by: null, from: alert.status, to: 'RESOLVED', note: 'Resolvido automaticamente: o sinal deixou de aparecer.' }],
      },
    });
  }
  return plan;
}

/** Mudança de estado feita pelo professor. */
export function manualTransition(
  alert: StoredAlert,
  to: AlertStatus,
  by: string,
  note: string | undefined,
  now: Date,
): { status: AlertStatus; autoResolved: boolean; closedAt: Date | null; note?: string; history: AlertHistoryEntry[] } {
  const entry: AlertHistoryEntry = { at: now.toISOString(), by, from: alert.status, to, ...(note ? { note } : {}) };
  return {
    status: to,
    autoResolved: false,
    closedAt: OPEN_STATES.includes(to) ? null : now,
    ...(note !== undefined ? { note } : {}),
    history: [...alert.history, entry],
  };
}
