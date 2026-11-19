import { describe, expect, it } from 'vitest';
import { isSheetCompatible, pickBalanced, shuffle, suggestedTitle } from './list-generator';

/** Gerador pseudoaleatório fixo para os testes serem estáveis. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('gerador de listas', () => {
  it('compatibilidade com o cartão-resposta', () => {
    const alt = (n: number, correct = 1) => Array.from({ length: n }, (_, i) => ({ position: i + 1, isCorrect: i + 1 === correct }));
    expect(isSheetCompatible(alt(5))).toBe(true);
    expect(isSheetCompatible(alt(1))).toBe(false);
    expect(isSheetCompatible(alt(6))).toBe(false);
    expect(isSheetCompatible(alt(4, 0))).toBe(false);
    expect(isSheetCompatible([{ position: 1, isCorrect: true }, { position: 3, isCorrect: false }])).toBe(false);
  });

  it('embaralha sem perder nem repetir', () => {
    const out = shuffle([1, 2, 3, 4, 5], seeded());
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('alterna entre assuntos, começando pelos mais fracos', () => {
    const candidates = [
      ...['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, bucket: 'Funções' })),
      ...['b1', 'b2'].map((id) => ({ id, bucket: 'Geometria' })),
      ...['c1', 'c2', 'c3'].map((id) => ({ id, bucket: 'Estatística' })),
    ];
    const picked = pickBalanced(candidates, 6, ['Geometria', 'Funções'], seeded());
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
    // As duas primeiras rodadas passam por todos os grupos, o mais fraco primeiro.
    expect(picked[0].startsWith('b')).toBe(true);
    expect(picked[1].startsWith('a')).toBe(true);
    const buckets = (ids: string[]) => ids.map((id) => id[0]);
    expect(buckets(picked).filter((b) => b === 'b')).toHaveLength(2);
  });

  it('devolve menos quando não há questões suficientes', () => {
    expect(pickBalanced([{ id: 'x', bucket: 'A' }, { id: 'y', bucket: 'B' }], 10)).toHaveLength(2);
  });

  it('título sugerido', () => {
    expect(suggestedTitle({ basis: 'filters', subject: 'Matemática', topic: 'Função afim', count: 10 })).toBe('Lista: Função afim (10 questões)');
    expect(suggestedTitle({ basis: 'weaknesses', forClass: '3º A', count: 20 })).toBe('Reforço da turma 3º A (20 questões)');
    expect(suggestedTitle({ basis: 'weaknesses', count: 15 })).toBe('Lista das minhas dificuldades (15 questões)');
  });
});
