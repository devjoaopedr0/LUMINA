import { TopicMasteryStatus, StudyActivityType } from '@prisma/client';

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
  now?: Date;
}

const RECENCY_CAP_DAYS = 30;

export function computeTopicPriority(input: TopicPriorityInput): number {
  const now = input.now ?? new Date();
  const masteryScore = input.masteryScore ?? 0;
  const naoEstudado = input.status === null || input.status === TopicMasteryStatus.NAO_ESTUDADO;

  const incidencia = input.maxQuestionCountInSubject > 0
    ? (100 * input.questionCount) / input.maxQuestionCountInSubject
    : 0;

  const diasDesdeUltimaRevisao = input.lastStudiedAt
    ? Math.min(RECENCY_CAP_DAYS, Math.floor((now.getTime() - input.lastStudiedAt.getTime()) / 86_400_000))
    : RECENCY_CAP_DAYS;
  const recencia = (diasDesdeUltimaRevisao / RECENCY_CAP_DAYS) * 100;

  const pesoObjetivo = input.maxTargetHoursInSchedule > 0
    ? (100 * input.targetHours) / input.maxTargetHoursInSchedule
    : 0;

  return (
    0.35 * (100 - masteryScore) +
    0.25 * incidencia +
    0.15 * (naoEstudado ? 100 : 0) +
    0.15 * recencia +
    0.10 * pesoObjetivo
  );
}

/** Tipo de atividade pelo status de domínio (§6) — sem distinção por fase
 *  ainda (fases por proximidade da prova são fase 3); um único mix por ora. */
export function pickActivityType(status: TopicMasteryStatus | null): StudyActivityType {
  switch (status) {
    case TopicMasteryStatus.PRECISA_REFORCO:
      return StudyActivityType.REVISAO;
    case TopicMasteryStatus.APRENDENDO:
    case TopicMasteryStatus.PRATICANDO:
      return StudyActivityType.QUESTOES;
    case TopicMasteryStatus.DOMINADO:
      // Não deveria aparecer na fila principal (só entra via revisão
      // vencida) — mantido por completude, caso chegue aqui mesmo assim.
      return StudyActivityType.REVISAO;
    case TopicMasteryStatus.NAO_ESTUDADO:
    default:
      return StudyActivityType.TEORIA;
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
