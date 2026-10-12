import { StudyTaskStatus, TopicMasteryStatus } from '@prisma/client';

/**
 * Resumo semanal do cronograma: o que o aluno planejou e cumpriu, quanto
 * praticou e em que tópicos mexeu na semana. Só leitura — tudo aqui sai de
 * dados que o sistema já grava; nada é estimado.
 *
 * O que NÃO entra, de propósito: "quanto falta para a meta de nota". O app
 * não tem uma estimativa da nota do ENEM do aluno (a prova usa TRI), então a
 * meta do Sisu aparece ao lado do percentual de acertos, sem conta de
 * distância inventada.
 */
export interface WeeklySummary {
  /** Domingo e sábado da semana, AAAA-MM-DD. */
  weekStart: string;
  weekEnd: string;
  /** A semana ainda não acabou: o planejado inclui dias que não chegaram. */
  inProgress: boolean;
  tasks: { planned: number; done: number; skipped: number; completionRate: number };
  minutes: { planned: number; studied: number };
  /** Questões avulsas/prática + questões de simulados enviados na semana. */
  questions: { answered: number; correct: number; accuracy: number | null };
  simulations: { count: number; correct: number; total: number };
  subjects: { subjectId: string; name: string; plannedTasks: number; doneTasks: number; plannedMinutes: number }[];
  /** Tópicos em que o aluno mexeu na semana, com a situação ATUAL de cada um
   *  (o sistema não guarda histórico de domínio para dizer quanto subiu). */
  topics: {
    studied: number;
    mastered: number;
    needAttention: number;
    items: { id: string; name: string; subject: string | null; status: TopicMasteryStatus; masteryScore: number; attempts: number }[];
  };
  /** A semana anterior, para comparar. */
  previous: { tasksDone: number; questionsAnswered: number; studiedMinutes: number };
  /** Meta de nota pela nota de corte do Sisu, quando o perfil permite calcular. */
  target: { score: number; course: string | null; university: string | null; year: number | null } | null;
  /** Frases prontas com os fatos da semana — a tela mostra e a LuminIA comenta em cima delas. */
  highlights: string[];
}

export interface WeeklySummaryInput {
  weekStart: string;
  weekEnd: string;
  inProgress?: boolean;
  tasks: { status: StudyTaskStatus; scheduledMinutes: number; subjectId: string | null; subjectName: string | null }[];
  studiedMinutes: number;
  attempts: { isCorrect: boolean }[];
  simulations: { correct: number; total: number }[];
  topics: { id: string; name: string; subject: string | null; status: TopicMasteryStatus; masteryScore: number; attempts: number }[];
  previous: { tasksDone: number; questionsAnswered: number; studiedMinutes: number };
  target: WeeklySummary['target'];
}

/** Abaixo disso, com questões respondidas, o tópico pede atenção. */
const ATTENTION_SCORE = 50;
const MAX_TOPIC_ITEMS = 8;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}

export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const active = input.tasks.filter((task) => task.status !== StudyTaskStatus.SKIPPED);
  const done = active.filter((task) => task.status === StudyTaskStatus.DONE);
  const skipped = input.tasks.length - active.length;
  const completionRate = active.length > 0 ? Math.round((100 * done.length) / active.length) : 0;
  const plannedMinutes = active.reduce((sum, task) => sum + task.scheduledMinutes, 0);

  const simulationTotals = input.simulations.reduce(
    (sum, simulation) => ({ correct: sum.correct + simulation.correct, total: sum.total + simulation.total }),
    { correct: 0, total: 0 },
  );
  const answered = input.attempts.length + simulationTotals.total;
  const correct = input.attempts.filter((attempt) => attempt.isCorrect).length + simulationTotals.correct;
  const accuracy = answered > 0 ? Math.round((100 * correct) / answered) : null;

  const subjects = new Map<string, WeeklySummary['subjects'][number]>();
  for (const task of active) {
    if (!task.subjectId) continue;
    const entry = subjects.get(task.subjectId) ?? {
      subjectId: task.subjectId, name: task.subjectName ?? 'Matéria', plannedTasks: 0, doneTasks: 0, plannedMinutes: 0,
    };
    entry.plannedTasks += 1;
    entry.plannedMinutes += task.scheduledMinutes;
    if (task.status === StudyTaskStatus.DONE) entry.doneTasks += 1;
    subjects.set(task.subjectId, entry);
  }

  const mastered = input.topics.filter((topic) => topic.status === TopicMasteryStatus.DOMINADO).length;
  const needsAttention = (topic: WeeklySummaryInput['topics'][number]) =>
    topic.status === TopicMasteryStatus.PRECISA_REFORCO || (topic.attempts > 0 && topic.masteryScore < ATTENTION_SCORE);
  const attentionTopics = input.topics.filter(needsAttention);
  // Na lista, quem pede atenção vem primeiro; depois, do menor domínio para o maior.
  const topicItems = [...input.topics]
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.masteryScore - b.masteryScore)
    .slice(0, MAX_TOPIC_ITEMS);

  const highlights: string[] = [];
  if (active.length === 0) {
    highlights.push('Não havia tarefas planejadas nesta semana.');
  } else {
    highlights.push(
      input.inProgress
        ? `Até agora você concluiu ${done.length} de ${plural(active.length, 'tarefa planejada', 'tarefas planejadas')} para a semana, que ainda está em andamento.`
        : `Você concluiu ${done.length} de ${plural(active.length, 'tarefa planejada', 'tarefas planejadas')} (${completionRate}%).`,
    );
  }
  if (input.studiedMinutes > 0) {
    highlights.push(`Registrou ${formatMinutes(input.studiedMinutes)} de estudo no cronômetro, de ${formatMinutes(plannedMinutes)} planejados.`);
  }
  if (answered > 0) {
    highlights.push(`Respondeu ${plural(answered, 'questão', 'questões')} e acertou ${correct} (${accuracy}%).`);
  } else if (active.length > 0) {
    highlights.push('Não respondeu nenhuma questão nesta semana.');
  }
  if (input.simulations.length > 0) {
    highlights.push(
      `Fez ${plural(input.simulations.length, 'simulado', 'simulados')}: ${simulationTotals.correct} de ${simulationTotals.total} acertos.`,
    );
  }
  if (input.topics.length > 0) {
    highlights.push(
      `Mexeu em ${plural(input.topics.length, 'tópico', 'tópicos')}` +
        (mastered > 0 ? `, ${mastered} já ${mastered === 1 ? 'dominado' : 'dominados'}` : '') +
        '.',
    );
  }
  if (attentionTopics.length > 0) {
    highlights.push(`Pedem atenção: ${attentionTopics.slice(0, 3).map((topic) => topic.name).join(', ')}.`);
  }
  if (skipped > 0) highlights.push(`Marcou ${plural(skipped, 'tarefa', 'tarefas')} como "não vou fazer".`);
  const taskDelta = done.length - input.previous.tasksDone;
  if (input.previous.tasksDone > 0 && taskDelta !== 0) {
    highlights.push(
      `Em relação à semana anterior, concluiu ${plural(Math.abs(taskDelta), 'tarefa', 'tarefas')} a ${taskDelta > 0 ? 'mais' : 'menos'}.`,
    );
  }

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    inProgress: input.inProgress ?? false,
    tasks: { planned: active.length, done: done.length, skipped, completionRate },
    minutes: { planned: plannedMinutes, studied: input.studiedMinutes },
    questions: { answered, correct, accuracy },
    simulations: { count: input.simulations.length, ...simulationTotals },
    subjects: [...subjects.values()].sort((a, b) => b.plannedMinutes - a.plannedMinutes),
    topics: { studied: input.topics.length, mastered, needAttention: attentionTopics.length, items: topicItems },
    previous: input.previous,
    target: input.target,
    highlights,
  };
}

/** Texto que vai para a LuminIA comentar a semana. `scoreEstimate` é a
 *  frase da estimativa de nota (score-estimate.ts), quando ela existe. */
export function weeklySummaryContext(summary: WeeklySummary, scoreEstimate?: string | null): string {
  return [
    `Resumo da semana de estudos do aluno, de ${summary.weekStart} a ${summary.weekEnd} (dados reais do sistema; use só estes números):`,
    ...summary.highlights.map((line) => `- ${line}`),
    summary.target
      ? `- Meta de nota pelo Sisu ${summary.target.year ?? ''}: média ${summary.target.score} para ${summary.target.course ?? 'o curso'} na ${summary.target.university ?? 'universidade'}.`
      : null,
    scoreEstimate
      ? `- Estimativa de nota (aproximada, pelo desempenho nas questões do app — não é previsão do ENEM): ${scoreEstimate} Se citar, deixe claro que é uma estimativa.`
      : summary.target
        ? '- Ainda não há estimativa da nota do aluno: não diga quanto falta para a meta.'
        : null,
    summary.inProgress
      ? '- A semana ainda não terminou: não trate as tarefas que faltam como atraso.'
      : null,
    'Como responder: comente a semana em um parágrafo curto, em tom de conversa. Reconheça o que foi feito, aponte UMA coisa para ajustar na próxima semana e termine com um incentivo. Não repita a lista nem todos os números.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Comentário sem IA (provedor desligado ou fora do ar): os mesmos fatos, em
 *  texto corrido. */
export function fallbackWeeklyComment(summary: WeeklySummary): string {
  if (summary.tasks.planned === 0 && summary.questions.answered === 0) {
    return 'Essa semana ficou sem tarefas nem questões registradas. Que tal abrir o cronograma e começar por uma tarefa curta?';
  }
  const opening = summary.inProgress
    ? 'A semana ainda está em andamento.'
    : summary.tasks.completionRate >= 80
      ? 'Semana muito bem cumprida.'
      : summary.tasks.completionRate >= 50
        ? 'Semana no caminho, com espaço para fechar mais tarefas.'
        : 'Semana mais difícil de cumprir — acontece, e dá para retomar.';
  const next =
    summary.topics.needAttention > 0
      ? 'Para a próxima, comece pelos tópicos que pedem atenção.'
      : summary.questions.answered === 0
        ? 'Para a próxima, tente fechar as tarefas pelo "Praticar": é o que mostra onde você está.'
        : 'Para a próxima, mantenha o ritmo e avance nos tópicos novos.';
  return [opening, ...summary.highlights.slice(0, 3), next].join(' ');
}
