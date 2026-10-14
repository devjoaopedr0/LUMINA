import { describe, expect, it } from 'vitest';
import { pickPracticeQuestions, summarizePractice } from './schedule-practice';

describe('prática da tarefa', () => {
  const question = (id: string, attempts = 0, correctAttempts = 0) => ({
    id,
    progress: attempts === 0 ? null : { attempts, correctAttempts, incorrectAttempts: attempts - correctAttempts },
  });

  it('vai primeiro o que nunca foi respondido, depois o que mais erra, por último o que já acerta', () => {
    const pool = [
      question('acerta', 4, 4),
      question('erra-pouco', 4, 2),
      question('nova-1'),
      question('erra-muito', 4, 0),
      question('nova-2'),
    ];
    expect(pickPracticeQuestions(pool).map((q) => q.id)).toEqual(['nova-1', 'nova-2', 'erra-muito', 'erra-pouco', 'acerta']);
  });

  it('corta no tamanho do bloco', () => {
    const pool = Array.from({ length: 25 }, (_, index) => question(`q${index}`));
    expect(pickPracticeQuestions(pool)).toHaveLength(10);
    expect(pickPracticeQuestions(pool, 3).map((q) => q.id)).toEqual(['q0', 'q1', 'q2']);
  });

  it('no resultado vale a última resposta de cada questão', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 10, minute));
    expect(summarizePractice([
      { questionId: 'a', isCorrect: false, createdAt: at(1) },
      { questionId: 'a', isCorrect: true, createdAt: at(5) },
      { questionId: 'b', isCorrect: true, createdAt: at(2) },
      { questionId: 'b', isCorrect: false, createdAt: at(6) },
      { questionId: 'c', isCorrect: true, createdAt: at(3) },
    ])).toEqual({ answered: 3, correct: 2 });
    expect(summarizePractice([])).toEqual({ answered: 0, correct: 0 });
  });
});
