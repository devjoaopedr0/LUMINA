import { describe, expect, it } from 'vitest';
import { comparableAccuracy, delta, perActive, subjectEvolution, subjectMatrix, versusAverage } from './compare-rules';

describe('comparação: regras', () => {
  it('variação com tendência e tolerância', () => {
    expect(delta(72, 65)).toEqual({ current: 72, previous: 65, change: 7, trend: 'up' });
    expect(delta(60, 66.5)).toMatchObject({ change: -6.5, trend: 'down' });
    expect(delta(70.4, 70)).toMatchObject({ trend: 'same' });
    expect(delta(70, null)).toMatchObject({ change: null, trend: null });
  });

  it('acerto só com amostra suficiente', () => {
    expect(comparableAccuracy(90, 4)).toBeNull();
    expect(comparableAccuracy(90, 10)).toBe(90);
  });

  it('minutos por aluno ativo', () => {
    expect(perActive(600, 4)).toBe(150);
    expect(perActive(0, 0)).toBe(0);
  });

  it('matriz matéria × turma, por volume, sem amostra pequena', () => {
    const m = subjectMatrix([
      { classId: 'a', subjects: [{ subject: 'Matemática', attempts: 40, accuracy: 62 }, { subject: 'Biologia', attempts: 3, accuracy: 100 }] },
      { classId: 'b', subjects: [{ subject: 'Matemática', attempts: 30, accuracy: 70 }, { subject: 'Biologia', attempts: 12, accuracy: 55 }] },
    ]);
    expect(m.map((r) => r.subject)).toEqual(['Matemática', 'Biologia']);
    expect(m[1].byClass).toEqual({ a: null, b: 55 });
  });

  it('aluno × média da turma, sem ranking', () => {
    expect(versusAverage(68, 61.5)).toEqual({ mine: 68, average: 61.5, difference: 6.5 });
    expect(versusAverage(null, 61)).toMatchObject({ difference: null });
  });

  it('matérias do aluno: atual × anterior, só com amostra nos dois', () => {
    const rows = subjectEvolution(
      [{ subject: 'Matemática', attempts: 20, accuracy: 70 }, { subject: 'Física', attempts: 8, accuracy: 50 }, { subject: 'Química', attempts: 2, accuracy: 100 }],
      [{ subject: 'Matemática', attempts: 15, accuracy: 55 }, { subject: 'Física', attempts: 3, accuracy: 80 }],
    );
    expect(rows.map((r) => [r.subject, r.change])).toEqual([['Matemática', 15], ['Física', null]]);
  });
});
