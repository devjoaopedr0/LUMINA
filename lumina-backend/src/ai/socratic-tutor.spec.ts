import { describe, expect, it } from 'vitest';
import {
  SOCRATIC_GENERAL_CONTEXT,
  SOCRATIC_PROMPT_VERSION,
  socraticSystemPrompt,
  socraticTurnContext,
} from './socratic-tutor';

describe('prompt do modo socrático', () => {
  it('mantém a persona e acrescenta as regras de condução', () => {
    const prompt = socraticSystemPrompt('Ana');

    expect(prompt).toContain('Você é a LuminIA');
    expect(prompt).toContain('O aluno se chama Ana.');
    expect(prompt).toContain('MODO SOCRÁTICO');
    expect(prompt).toContain('Faça uma pergunta por mensagem');
    expect(prompt).toContain('Nunca pule direto para a resolução completa');
    expect(prompt).toContain(SOCRATIC_PROMPT_VERSION);
  });

  it('começa com diagnóstico e avança uma etapa por turno do aluno', () => {
    const first = socraticTurnContext([]);
    expect(first).toContain('O aluno já enviou 0 mensagens');
    expect(first).toContain('Etapa de diagnóstico');

    const second = socraticTurnContext([
      { role: 'assistant', content: 'O que o enunciado pede?' },
      { role: 'user', content: 'Acho que é para calcular o valor de f(3).' },
    ]);
    expect(second).toContain('O aluno já enviou 1 mensagem');
    expect(second).toContain('Etapa de conceito');

    const third = socraticTurnContext([
      { role: 'user', content: 'Não sei por onde começar.' },
      { role: 'assistant', content: 'O que significa 2^3?' },
      { role: 'user', content: 'Multiplicar 2 por ele mesmo três vezes?' },
    ]);
    expect(third).toContain('Etapa de estratégia');

    const last = socraticTurnContext([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ]);
    expect(last).toContain('Etapa de acompanhamento');
    expect(last).toContain('Não entregue a resolução completa');
  });

  it('sem questão vinculada não presume matéria nem inventa exemplo', () => {
    expect(SOCRATIC_GENERAL_CONTEXT).toContain('não há questão vinculada');
    expect(SOCRATIC_GENERAL_CONTEXT).toContain('Não presuma a matéria');
    expect(SOCRATIC_GENERAL_CONTEXT).toContain('pergunte antes');
  });
});
