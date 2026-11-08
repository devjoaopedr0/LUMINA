import { describe, expect, it } from 'vitest';
import {
  buildQuestionTutorContext,
  TutorQuestion,
  tutorPositionLetter,
} from './question-tutor-context';

const question: TutorQuestion = {
  subject: 'Matemática',
  topic: 'Funções exponenciais',
  exam: 'ENEM',
  year: 2023,
  difficulty: 'MEDIA',
  stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
  explanation: 'A alternativa correta é 8 porque 2^3 = 2 · 2 · 2.',
  alternatives: [
    { text: '4', position: 1, isCorrect: false, explanation: '2^2 = 4, não 2^3.' },
    { text: '6', position: 2, isCorrect: false, explanation: null },
    { text: '8', position: 3, isCorrect: true, explanation: '2^3 = 8.' },
    { text: '10', position: 4, isCorrect: false, explanation: null },
  ],
};

describe('buildQuestionTutorContext', () => {
  it('descreve a questão sem entregar o gabarito antes da resposta', () => {
    const context = buildQuestionTutorContext(question, null);

    expect(context).toContain(question.stem);
    expect(context).toContain('A) 4');
    expect(context).toContain('C) 8');
    expect(context).toContain('ainda não respondeu');
    expect(context).toContain('NÃO diga qual alternativa é a correta');
    expect(context).not.toContain('(correta)');
    expect(context).not.toContain('Alternativa correta:');
    expect(context).not.toContain('Comentário do gabarito');
    expect(context).not.toContain('2^3 = 8.');
  });

  it('depois de um erro, mostra a marcada, a correta e o comentário', () => {
    const context = buildQuestionTutorContext(question, {
      selectedPosition: 1,
      isCorrect: false,
    });

    expect(context).toContain('O aluno já respondeu esta questão.');
    expect(context).toContain('Alternativa correta: C) 8');
    expect(context).toContain('Alternativa marcada pelo aluno: A) 4');
    expect(context).toContain('Resultado: errou.');
    expect(context).toContain('Comentário do gabarito: A alternativa correta é 8');
    expect(context).toContain('A) 2^2 = 4, não 2^3.');
    expect(context).toContain('C) 2^3 = 8.');
    expect(context).toContain('onde o raciocínio do aluno tropeçou');
  });

  it('depois de um acerto, pede reforço do conceito', () => {
    const context = buildQuestionTutorContext(question, {
      selectedPosition: 3,
      isCorrect: true,
    });

    expect(context).toContain('Resultado: acertou.');
    expect(context).toContain('por que a resposta do aluno está correta');
  });

  it('avisa quando a questão depende de imagem que a IA não recebeu', () => {
    const context = buildQuestionTutorContext(
      { ...question, imageUrl: 'https://example.com/figura.png' },
      null,
    );

    expect(context).toContain('A questão tem uma imagem');
    expect(context).toContain('não invente detalhes visuais');
  });

  it('trata posição marcada desconhecida sem quebrar o contexto', () => {
    const context = buildQuestionTutorContext(question, {
      selectedPosition: 9,
      isCorrect: false,
    });

    expect(context).toContain('posição 9');
  });

  it('no modo socrático antes da resposta não entrega o gabarito e pede diagnóstico', () => {
    const context = buildQuestionTutorContext(question, null, 'SOCRATIC');

    expect(context).toContain('ainda não respondeu');
    expect(context).toContain('modo socrático');
    expect(context).toContain('pergunta de diagnóstico');
    expect(context).not.toContain('(correta)');
    expect(context).not.toContain('Alternativa correta:');
  });

  it('no modo socrático depois do erro não entrega a resolução pronta', () => {
    const context = buildQuestionTutorContext(question, {
      selectedPosition: 1,
      isCorrect: false,
    }, 'SOCRATIC');

    expect(context).toContain('Alternativa correta: C) 8');
    expect(context).toContain('Não entregue a resolução pronta');
    expect(context).toContain('pergunte em qual passo');
    expect(context).not.toContain('Mostre onde o raciocínio do aluno tropeçou');
  });

  it('no modo socrático depois do acerto pede que o aluno explique o porquê', () => {
    const context = buildQuestionTutorContext(question, {
      selectedPosition: 3,
      isCorrect: true,
    }, 'SOCRATIC');

    expect(context).toContain('peça que ele explique com as próprias palavras');
    expect(context).not.toContain('Explique por que a resposta do aluno está correta');
  });
});

describe('tutorPositionLetter', () => {
  it('converte posições em letras e protege posições fora da faixa', () => {
    expect([1, 2, 3, 4, 5].map(tutorPositionLetter)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(tutorPositionLetter(0)).toBe('?');
    expect(tutorPositionLetter(9)).toBe('?');
  });
});
