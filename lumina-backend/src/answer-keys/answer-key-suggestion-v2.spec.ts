import { describe, expect, it } from 'vitest';
import { looksUnsure, parseSuggestedAnswerOutcome, SUGGESTION_GENERATION, SUGGESTION_SYSTEM_PROMPT } from './answer-key.questions';
import { compareMeasurements } from './eval/compare';

const alternatives = [1, 2, 3, 4, 5].map((position) => ({ position, text: `Alternativa ${position}` }));

describe('trava de justificativa inconsistente', () => {
  it('justificativas reais da medição de 12/11 viram pendência', () => {
    // Trechos da Q145 e da Q155 (Gemini, prompt v1).
    expect(looksUnsure('R ≈ 5,77 km, o que está incorreto; aguarde, o raio de um triângulo equilátero inscrito é...')).toBe(true);
    expect(looksUnsure('Aguarde, há um erro na minha conta rápida. Vamos verificar o tipo III.')).toBe(true);
    expect(looksUnsure('a alternativa correta ajustada ao gabarito padrão desta questão clássica é 9,00 segundos')).toBe(true);
    expect(looksUnsure('o resultado não está entre as alternativas, então escolho a mais próxima')).toBe(true);
  });

  it('não pega justificativas normais, nem "mais próximo" quando o comando pede aproximação', () => {
    expect(looksUnsure('O enunciado pede o valor mais próximo: 4,2 m², alternativa C.')).toBe(false);
    expect(looksUnsure('A reação libera energia, como afirma o enunciado no segundo parágrafo.')).toBe(false);
    expect(looksUnsure('Somando as semirreações e igualando os elétrons, obtém-se a equação da alternativa A.')).toBe(false);
  });

  it('a leitura transforma a escolha inconsistente em pendência com o motivo', () => {
    const outcome = parseSuggestedAnswerOutcome('{"answer":"C","justification":"Calculei 48 m², aguarde, recalculando o tipo V dá 75 m²."}', alternatives);
    expect(outcome).toMatchObject({ position: null });
    expect(outcome?.justification).toMatch(/^A IA não chegou a um raciocínio consistente/);
  });

  it('prompt v2: aceita o campo "resolucao" e lê a escolha normalmente', () => {
    const outcome = parseSuggestedAnswerOutcome(
      '{"resolucao":"Dados: v = 50 m/min; t = d/v = 100/50 = 2 min.","answer":"B","justification":"O tempo por trecho é 2 min, o que dá a alternativa B."}',
      alternatives,
    );
    expect(outcome).toEqual({ position: 2, justification: 'O tempo por trecho é 2 min, o que dá a alternativa B.' });
  });
});

describe('prompt v2', () => {
  it('manda resolver antes de escolher e não forçar alternativa', () => {
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('"resolucao"');
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('Nunca ajuste a conta para chegar a uma alternativa');
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('não use gabarito que você lembre de outra fonte');
  });

  it('tem espaço para a resolução', () => {
    expect(SUGGESTION_GENERATION.maxTokens).toBeGreaterThanOrEqual(1000);
  });
});

describe('comparação entre medições', () => {
  const item = (number: number, status: string) => ({ number, language: '', outcome: { status } });

  it('classifica o que corrigiu, piorou e virou pendência; ignora erros de cota', () => {
    const before = [item(1, 'wrong'), item(2, 'correct'), item(3, 'wrong'), item(4, 'pending'), item(5, 'wrong'), item(6, 'correct'), item(7, 'error')];
    const after = [item(1, 'correct'), item(2, 'wrong'), item(3, 'pending'), item(4, 'correct'), item(5, 'wrong'), item(6, 'correct'), item(7, 'correct')];
    const { rows, summary } = compareMeasurements(before, after);
    expect(summary).toEqual({ fixed: 1, broke: 1, nowPending: 1, nowAnswered: 1, stillWrong: 1 });
    expect(rows.map((row) => row.key)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  });
});
