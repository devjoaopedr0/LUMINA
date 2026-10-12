import { describe, expect, it } from 'vitest';
import {
  buildWeeklySummary,
  fallbackWeeklyComment,
  weeklySummaryContext,
  type WeeklySummaryInput,
} from './schedule-weekly-summary';

const task = (status: string, subjectId = 'math', scheduledMinutes = 30) =>
  ({ status, scheduledMinutes, subjectId, subjectName: subjectId === 'math' ? 'Matemática' : 'Física' }) as never;
const topic = (name: string, status: string, masteryScore: number, attempts = 5) =>
  ({ id: name, name, subject: 'Matemática', status, masteryScore, attempts }) as never;

const base: WeeklySummaryInput = {
  weekStart: '2026-10-11',
  weekEnd: '2026-10-17',
  tasks: [task('DONE'), task('DONE'), task('PENDING'), task('DONE', 'physics', 40), task('SKIPPED', 'physics')],
  studiedMinutes: 95,
  attempts: [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }],
  simulations: [{ correct: 6, total: 9 }],
  topics: [topic('Frações', 'DOMINADO', 92), topic('Porcentagem', 'APRENDENDO', 30), topic('Regra de três', 'PRATICANDO', 65)],
  previous: { tasksDone: 1, questionsAnswered: 4, studiedMinutes: 40 },
  target: { score: 731.3, course: 'MEDICINA', university: 'UFC', year: 2026 },
};

describe('resumo semanal', () => {
  it('conta tarefas, tempo, questões (com as dos simulados) e matérias', () => {
    const summary = buildWeeklySummary(base);
    // Tarefa pulada não entra no planejado.
    expect(summary.tasks).toEqual({ planned: 4, done: 3, skipped: 1, completionRate: 75 });
    expect(summary.minutes).toEqual({ planned: 130, studied: 95 });
    expect(summary.questions).toEqual({ answered: 12, correct: 8, accuracy: 67 });
    expect(summary.simulations).toEqual({ count: 1, correct: 6, total: 9 });
    expect(summary.subjects).toEqual([
      { subjectId: 'math', name: 'Matemática', plannedTasks: 3, doneTasks: 2, plannedMinutes: 90 },
      { subjectId: 'physics', name: 'Física', plannedTasks: 1, doneTasks: 1, plannedMinutes: 40 },
    ]);
  });

  it('nos tópicos, quem pede atenção vem primeiro', () => {
    const summary = buildWeeklySummary(base);
    expect(summary.topics).toMatchObject({ studied: 3, mastered: 1, needAttention: 1 });
    expect(summary.topics.items.map((item) => item.name)).toEqual(['Porcentagem', 'Regra de três', 'Frações']);
  });

  it('escreve os fatos da semana em frases, comparando com a anterior', () => {
    expect(buildWeeklySummary(base).highlights).toEqual([
      'Você concluiu 3 de 4 tarefas planejadas (75%).',
      'Registrou 1h35 de estudo no cronômetro, de 2h10 planejados.',
      'Respondeu 12 questões e acertou 8 (67%).',
      'Fez 1 simulado: 6 de 9 acertos.',
      'Mexeu em 3 tópicos, 1 já dominado.',
      'Pedem atenção: Porcentagem.',
      'Marcou 1 tarefa como "não vou fazer".',
      'Em relação à semana anterior, concluiu 2 tarefas a mais.',
    ]);
  });

  it('semana em andamento não vira porcentagem de cumprimento nem atraso', () => {
    const summary = buildWeeklySummary({ ...base, inProgress: true });
    expect(summary.inProgress).toBe(true);
    expect(summary.highlights[0]).toBe('Até agora você concluiu 3 de 4 tarefas planejadas para a semana, que ainda está em andamento.');
    expect(weeklySummaryContext(summary)).toContain('não trate as tarefas que faltam como atraso');
    expect(fallbackWeeklyComment(summary)).toContain('A semana ainda está em andamento.');
  });

  it('semana vazia não divide por zero nem inventa número', () => {
    const summary = buildWeeklySummary({
      ...base, tasks: [], studiedMinutes: 0, attempts: [], simulations: [], topics: [],
      previous: { tasksDone: 0, questionsAnswered: 0, studiedMinutes: 0 }, target: null,
    });
    expect(summary.tasks.completionRate).toBe(0);
    expect(summary.questions.accuracy).toBeNull();
    expect(summary.highlights).toEqual(['Não havia tarefas planejadas nesta semana.']);
    expect(fallbackWeeklyComment(summary)).toContain('sem tarefas nem questões');
  });

  it('o contexto da LuminIA leva os fatos e proíbe calcular distância para a meta', () => {
    const context = weeklySummaryContext(buildWeeklySummary(base));
    expect(context).toContain('- Você concluiu 3 de 4 tarefas planejadas (75%).');
    expect(context).toContain('média 731.3 para MEDICINA na UFC');
    expect(context).toContain('não diga quanto falta para a meta');
    expect(weeklySummaryContext(buildWeeklySummary({ ...base, target: null }))).not.toContain('Meta de nota');
  });

  it('sem IA, o comentário sai dos mesmos fatos', () => {
    const comment = fallbackWeeklyComment(buildWeeklySummary(base));
    expect(comment).toContain('Semana no caminho');
    expect(comment).toContain('Você concluiu 3 de 4 tarefas planejadas (75%).');
    expect(comment).toContain('comece pelos tópicos que pedem atenção');
  });
});
