import { describe, expect, it } from 'vitest';
import { selectValidatedLearningExamples, ValidatedLearningCandidate } from './validated-learning';

function candidate(overrides: Partial<ValidatedLearningCandidate>): ValidatedLearningCandidate {
  return {
    id: 'learning-1',
    competency: 'C3',
    criterion: 'projeto de texto',
    humanScore: 160,
    aiScore: 120,
    evidence: 'argumento sem desenvolvimento',
    learning: 'O avaliador exigiu desenvolvimento do argumento com autoria.',
    divergenceReason: 'nota diferente da IA',
    version: 1,
    validatedAt: new Date('2026-11-01T10:00:00Z'),
    ...overrides,
  };
}

describe('RAG do aprendizado validado na correção', () => {
  it('separa os exemplos por competência e prioriza maior proximidade lexical', () => {
    const selected = selectValidatedLearningExamples(
      [
        candidate({
          id: 'c3-distante',
          competency: 'C3',
          criterion: 'coesão',
          evidence: 'conectivos variados',
          learning: 'Uso de conectivos variados.',
        }),
        candidate({ id: 'c3-proximo', competency: 'C3', learning: 'Projeto de texto e desenvolvimento do argumento.' }),
        candidate({ id: 'c4', competency: 'C4', learning: 'Retomada pronominal.' }),
      ],
      'A redação apresenta projeto de texto, mas o argumento não foi desenvolvido.',
      'Desafios da educação',
    );

    expect(selected.C3?.map((item) => item.id)).toEqual(['c3-proximo', 'c3-distante']);
    expect(selected.C4?.map((item) => item.id)).toEqual(['c4']);
    expect(selected.C1).toBeUndefined();
  });

  it('respeita o limite por competência e mantém os campos auditáveis', () => {
    const selected = selectValidatedLearningExamples(
      [candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })],
      'projeto de texto e argumento',
      'tema',
      2,
    );
    expect(selected.C3).toHaveLength(2);
    expect(selected.C3?.[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        competency: 'C3',
        humanScore: 160,
        aiScore: 120,
        version: 1,
      }),
    );
  });
});
