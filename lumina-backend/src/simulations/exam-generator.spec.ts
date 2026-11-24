import { describe, expect, it } from 'vitest';
import { buildVersions, difficultyQuotas, permuteAlternatives, versionLabel } from './exam-generator';

function seeded(seed = 11) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const item = (id: string, correct = 2) => ({
  questionId: id,
  stem: `Questão ${id}`,
  subject: 'Matemática',
  alternatives: ['A', 'B', 'C', 'D', 'E'].map((t, i) => ({ position: i + 1, text: `${id}-${t}` })),
  correctPosition: correct,
});

describe('gerador de provas', () => {
  it('cotas por dificuldade somam exatamente a quantidade', () => {
    expect(difficultyQuotas(10, { FACIL: 30, MEDIA: 50, DIFICIL: 20 })).toEqual({ FACIL: 3, MEDIA: 5, DIFICIL: 2 });
    const q = difficultyQuotas(7, { FACIL: 1, MEDIA: 1, DIFICIL: 1 });
    expect(q.FACIL + q.MEDIA + q.DIFICIL).toBe(7);
    expect(difficultyQuotas(5, { FACIL: 0, MEDIA: 100, DIFICIL: 0 })).toEqual({ FACIL: 0, MEDIA: 5, DIFICIL: 0 });
  });

  it('letras das versões', () => {
    expect([0, 1, 2, 3].map(versionLabel)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('embaralhar alternativas mantém a correta certa', () => {
    const original = item('q1', 3);
    const out = permuteAlternatives(original.alternatives, 3, seeded());
    expect(out.alternatives.map((a) => a.position)).toEqual([1, 2, 3, 4, 5]);
    expect(out.alternatives[out.correctPosition - 1].text).toBe('q1-C');
    expect(out.alternatives.map((a) => a.text).sort()).toEqual(original.alternatives.map((a) => a.text).sort());
  });

  it('versão A igual à prévia; outras embaralham, cada uma com o próprio gabarito correto', () => {
    const base = [item('q1', 1), item('q2', 2), item('q3', 3), item('q4', 4), item('q5', 5)];
    const versions = buildVersions(base, 3, true, seeded());
    expect(versions.map((v) => v.label)).toEqual(['A', 'B', 'C']);
    expect(versions[0].items.map((i) => i.questionId)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(versions[0].answerKey.map((k) => k.answer).join('')).toBe('ABCDE');
    for (const v of versions) {
      expect(v.items.map((i) => i.questionId).sort()).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
      for (const it of v.items) {
        // A alternativa marcada como correta continua sendo o mesmo texto da original.
        const original = base.find((b) => b.questionId === it.questionId)!;
        const correctText = original.alternatives[original.correctPosition - 1].text;
        expect(it.alternatives[it.correctPosition - 1].text).toBe(correctText);
      }
    }
    expect(versions[1].items.map((i) => i.questionId).join()).not.toBe(versions[0].items.map((i) => i.questionId).join());
  });

  it('sem embaralhar alternativas, só a ordem muda', () => {
    const versions = buildVersions([item('q1', 2), item('q2', 4)], 2, false, seeded(3));
    for (const it of versions[1].items) expect(it.alternatives[0].text.endsWith('-A')).toBe(true);
  });
});
