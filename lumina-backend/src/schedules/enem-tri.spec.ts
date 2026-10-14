import { describe, expect, it } from 'vitest';
import { ENEM_SCALE, estimateTheta, thetaToScore, triScore, type TriItem } from './enem-tri';

const items = (correct: number, wrong: number, difficulty = 'MEDIA', alternatives = 5): TriItem[] => [
  ...Array.from({ length: correct }, () => ({ isCorrect: true, difficulty, alternatives }) as TriItem),
  ...Array.from({ length: wrong }, () => ({ isCorrect: false, difficulty, alternatives }) as TriItem),
];
/** Prova de 45 questões: 11 fáceis, 25 médias, 9 difíceis. */
const exam = (easy: number, medium: number, hard: number) => [
  ...items(easy, 11 - easy, 'FACIL'), ...items(medium, 25 - medium, 'MEDIA'), ...items(hard, 9 - hard, 'DIFICIL'),
];

describe('nota estilo TRI', () => {
  it('θ = 0 é a média da área; ±3 são o teto e o piso', () => {
    for (const area of ['LINGUAGENS', 'HUMANAS', 'NATUREZA', 'MATEMATICA'] as const) {
      expect(thetaToScore(area, 0)).toBe(ENEM_SCALE[area].mean);
      expect(thetaToScore(area, 3)).toBe(ENEM_SCALE[area].max);
      expect(thetaToScore(area, -3)).toBe(ENEM_SCALE[area].min);
      expect(thetaToScore(area, 9)).toBe(ENEM_SCALE[area].max);
    }
  });

  it('mais acertos, mais nota — mas não em proporção aos acertos', () => {
    const scores = [exam(0, 0, 0), exam(6, 4, 0), exam(11, 9, 0), exam(11, 17, 2), exam(11, 23, 6), exam(11, 25, 9)]
      .map((answers) => triScore('MATEMATICA', answers).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    // Zero acerto não é zero, e gabaritar chega perto do teto da área.
    expect(scores[0]).toBeGreaterThan(ENEM_SCALE.MATEMATICA.min);
    expect(scores[scores.length - 1]).toBeGreaterThan(900);
    expect(scores[scores.length - 1]).toBeLessThanOrEqual(ENEM_SCALE.MATEMATICA.max);
  });

  it('com o mesmo número de acertos, o padrão coerente vale mais', () => {
    // 20 acertos: as 11 fáceis e 9 médias, ou quase só médias e difíceis.
    const coherent = triScore('LINGUAGENS', exam(11, 9, 0)).score;
    const incoherent = triScore('LINGUAGENS', exam(2, 9, 9)).score;
    expect(coherent - incoherent).toBeGreaterThan(50);
  });

  it('a mesma prova rende mais nota em Matemática e Natureza do que em Linguagens', () => {
    const answers = exam(11, 17, 2);
    const score = (area: 'LINGUAGENS' | 'NATUREZA' | 'MATEMATICA') => triScore(area, answers).score;
    expect(score('MATEMATICA')).toBeGreaterThan(score('NATUREZA'));
    expect(score('NATUREZA')).toBeGreaterThan(score('LINGUAGENS'));
  });

  it('questão com menos alternativas é mais fácil de chutar, então o acerto vale menos', () => {
    expect(triScore('HUMANAS', items(6, 4, 'MEDIA', 4)).score).toBeLessThan(triScore('HUMANAS', items(6, 4, 'MEDIA', 5)).score);
  });

  it('a incerteza cai com mais questões, e tudo certo ou tudo errado ainda tem resposta', () => {
    expect(estimateTheta('HUMANAS', items(5, 5)).sd).toBeGreaterThan(estimateTheta('HUMANAS', items(45, 45)).sd);
    for (const answers of [items(10, 0), items(0, 10), []]) {
      const { score, low, high } = triScore('HUMANAS', answers);
      expect(Number.isFinite(score)).toBe(true);
      expect(low).toBeLessThanOrEqual(score);
      expect(high).toBeGreaterThanOrEqual(score);
    }
    // Sem resposta nenhuma, a melhor aposta é a média da área.
    expect(triScore('HUMANAS', []).score).toBe(ENEM_SCALE.HUMANAS.mean);
  });
});
