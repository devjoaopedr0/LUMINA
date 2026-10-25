import { describe, expect, it } from 'vitest';
import { calibrateQuestions, MIN_REFERENCE_RESPONSES, MIN_RESPONDENTS, type QuestionResponseStats } from './question-calibration';

const question = (questionId: string, respondents: number, correct: number, difficulty = 'MEDIA'): QuestionResponseStats => ({
  questionId, area: 'HUMANAS', difficulty: difficulty as QuestionResponseStats['difficulty'], alternatives: 4, respondents, correct,
});
/** Outras médias de Humanas, com 50% de acerto: a referência do nível. */
const peers = Array.from({ length: 20 }, (_, i) => question(`peer${i}`, 50, 25));

describe('calibração da dificuldade pelo acerto real', () => {
  it('questão que acertam bem menos que as outras do nível fica mais difícil, e vice-versa', () => {
    const result = calibrateQuestions([...peers, question('dura', 40, 8), question('facil', 40, 38)]);
    expect(result.get('dura')!.offset).toBeGreaterThan(0.3);
    expect(result.get('facil')!.offset).toBeLessThan(-0.3);
    // A que acerta como as outras quase não mexe.
    expect(Math.abs(result.get('peer0')!.offset)).toBeLessThan(0.05);
  });

  it('com poucos alunos a questão fica com o nível cadastrado — um aluno só não calibra nada', () => {
    const few = calibrateQuestions([...peers, question('nova', MIN_RESPONDENTS - 1, 0)]);
    expect(few.get('nova')).toMatchObject({ offset: 0, suggestedDifficulty: null, respondents: MIN_RESPONDENTS - 1 });

    // Sem referência no nível (poucas respostas nas outras questões), também não.
    const noReference = calibrateQuestions([question('a', 10, 1), question('b', MIN_REFERENCE_RESPONSES - 1, 9)]);
    expect(noReference.get('a')!.offset).toBe(0);
  });

  it('mais respostas, mais o ajuste se aproxima do observado; nunca passa de um nível', () => {
    const offsetWith = (respondents: number) =>
      calibrateQuestions([...peers, question('q', respondents, Math.round(respondents * 0.3))]).get('q')!.offset;
    expect(offsetWith(10)).toBeLessThan(offsetWith(40));
    expect(offsetWith(40)).toBeLessThan(offsetWith(400));

    const extreme = calibrateQuestions([...peers, question('q', 1000, 0)]).get('q')!;
    expect(extreme.offset).toBe(1);
  });

  it('sugere outro nível quando o acerto contradiz o cadastrado', () => {
    const result = calibrateQuestions([...peers, question('mal-classificada', 200, 3), question('ok', 200, 100)]);
    expect(result.get('mal-classificada')).toMatchObject({ suggestedDifficulty: 'DIFICIL', accuracy: 2 });
    expect(result.get('ok')!.suggestedDifficulty).toBeNull();
  });
});
