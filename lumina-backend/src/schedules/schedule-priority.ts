import { TopicMasteryStatus, StudyActivityType } from '@prisma/client';
import type { SchedulePhase } from './schedule-phase';

/**
 * Prioridade de conteúdo (cronograma adaptativo, fase 2 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §4). Todo termo é normalizado pra
 * escala 0-100 antes de entrar na soma ponderada — o design original tinha
 * `diasDesdeUltimaRevisao / 30` sem escalar (contribuição máxima de 0.15 em
 * vez de 15), corrigido aqui.
 *
 * Os pesos são "chutes iniciais, calibráveis depois" (nota do próprio
 * design doc) — não há dado de uso real ainda para calibrar.
 */
export interface TopicPriorityInput {
  /** 0-100; null quando o tópico nunca foi estudado (NAO_ESTUDADO). */
  masteryScore: number | null;
  status: TopicMasteryStatus | null;
  lastStudiedAt: Date | null;
  /** Questões desse tópico no banco, sobre o máximo entre os tópicos da
   *  mesma matéria — aproximação de "incidência no ENEM" (ver design doc
   *  §4: "pode vir de contagem de questões existentes por tópico"). */
  questionCount: number;
  maxQuestionCountInSubject: number;
  /** Horas-alvo que o aluno deu a essa matéria no cronograma, sobre o
   *  máximo entre as matérias do cronograma — aproxima "importância para o
   *  objetivo do aluno" (§4 pesoObjetivo) até a fase 5 ter onboarding rico. */
  targetHours: number;
  maxTargetHoursInSchedule: number;
  /** A matéria é da área que o aluno marcou como prioritária no onboarding
   *  (fase 5, §11) — vale o peso de objetivo cheio. */
  inPriorityArea?: boolean;
  now?: Date;
}

const RECENCY_CAP_DAYS = 30;

/** Os termos da prioridade, cada um em 0-100, antes dos pesos. Separado da
 *  soma para a LuminIA poder explicar POR QUE um tópico entrou no dia (§10). */
export interface TopicPriorityTerms {
  baixoDominio: number;
  incidencia: number;
  naoEstudado: boolean;
  diasSemEstudar: number | null;
  recencia: number;
  pesoObjetivo: number;
}

export function topicPriorityTerms(input: TopicPriorityInput): TopicPriorityTerms {
  const now = input.now ?? new Date();
  const naoEstudado = input.status === null || input.status === TopicMasteryStatus.NAO_ESTUDADO;

  const incidencia = input.maxQuestionCountInSubject > 0
    ? (100 * input.questionCount) / input.maxQuestionCountInSubject
    : 0;

  const diasSemEstudar = input.lastStudiedAt
    ? Math.max(0, Math.floor((now.getTime() - input.lastStudiedAt.getTime()) / 86_400_000))
    : null;
  const recencia = (Math.min(RECENCY_CAP_DAYS, diasSemEstudar ?? RECENCY_CAP_DAYS) / RECENCY_CAP_DAYS) * 100;

  const pesoHoras = input.maxTargetHoursInSchedule > 0
    ? (100 * input.targetHours) / input.maxTargetHoursInSchedule
    : 0;

  return {
    baixoDominio: 100 - (input.masteryScore ?? 0),
    incidencia,
    naoEstudado,
    diasSemEstudar,
    recencia,
    pesoObjetivo: input.inPriorityArea ? 100 : pesoHoras,
  };
}

export function computeTopicPriority(input: TopicPriorityInput): number {
  const terms = topicPriorityTerms(input);
  return (
    0.35 * terms.baixoDominio +
    0.25 * terms.incidencia +
    0.15 * (terms.naoEstudado ? 100 : 0) +
    0.15 * terms.recencia +
    0.10 * terms.pesoObjetivo
  );
}

/** Tipo de atividade pelo status de domínio e pela fase da reta (§6). Onde a
 *  tabela do design dá dois tipos ("Teoria + Questões"), fica o segundo: o
 *  primeiro já aconteceu quando o tópico saiu do status anterior. */
export function pickActivityType(
  status: TopicMasteryStatus | null,
  phase: SchedulePhase = 'BASE',
): StudyActivityType {
  switch (status) {
    case TopicMasteryStatus.PRECISA_REFORCO:
      // Domínio que caiu: longe da prova dá tempo de reaprender; perto dela
      // só cabe revisão intensiva.
      if (phase === 'BASE') return StudyActivityType.TEORIA;
      if (phase === 'CONSOLIDACAO') return StudyActivityType.QUESTOES;
      return StudyActivityType.REVISAO;
    case TopicMasteryStatus.APRENDENDO:
      return StudyActivityType.QUESTOES;
    case TopicMasteryStatus.PRATICANDO:
      return phase === 'PREPARACAO' ? StudyActivityType.SIMULADO : StudyActivityType.QUESTOES;
    case TopicMasteryStatus.DOMINADO:
      // Não deveria aparecer na fila principal (só entra via revisão
      // vencida) — mantido por completude, caso chegue aqui mesmo assim.
      return StudyActivityType.REVISAO;
    case TopicMasteryStatus.NAO_ESTUDADO:
    default:
      // Na reta final não há mais tempo para teoria de assunto nunca visto:
      // vai direto para questões.
      return phase === 'PREPARACAO' ? StudyActivityType.QUESTOES : StudyActivityType.TEORIA;
  }
}

/** Duração padrão por tipo de atividade — ainda um chute fixo (não calibrado
 *  por dado de uso real); o design doc já marca os pesos da prioridade como
 *  calibráveis depois, isso aqui está na mesma categoria. */
export const ACTIVITY_DURATION_MINUTES: Record<StudyActivityType, number> = {
  TEORIA: 40,
  QUESTOES: 40,
  REVISAO: 20,
  SIMULADO: 60,
  REDACAO: 45,
};

export const ACTIVITY_LABEL: Record<StudyActivityType, string> = {
  TEORIA: 'Teoria',
  QUESTOES: 'Questões',
  REVISAO: 'Revisão',
  SIMULADO: 'Simulado',
  REDACAO: 'Redação',
};
