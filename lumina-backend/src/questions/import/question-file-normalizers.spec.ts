import { describe, expect, it } from 'vitest';
import { CsvQuestionNormalizer } from './csv-question.normalizer';
import { JsonQuestionNormalizer } from './json-question.normalizer';

describe('normalizadores de arquivos de questões', () => {
  it('lê CSV com cabeçalhos de alternativas e delimitador dentro de aspas', () => {
    const csv = [
      'disciplina;enunciado;A;B;C;D;resposta;fonte',
      'Matemática;"Quanto é 1,5 + 1,5?";2;2,5;3;3,5;C;INEP',
    ].join('\n');

    const [question] = new CsvQuestionNormalizer().normalize(csv);

    expect(question.stem).toBe('Quanto é 1,5 + 1,5?');
    expect(question.options.map((option) => option.text)).toEqual(['2', '2,5', '3', '3,5']);
    expect(question.correctLetter).toBe('C');
  });

  it('aceita alternativas JSON tanto como textos quanto como objetos', () => {
    const [question] = new JsonQuestionNormalizer().normalize([
      {
        disciplina: 'Biologia',
        enunciado: 'Qual estrutura contém o material genético?',
        alternativas: ['Ribossomo', { text: 'Núcleo' }, 'Lisossomo'],
        resposta: 'B',
      },
    ]);

    expect(question.options.map((option) => option.text)).toEqual([
      'Ribossomo',
      'Núcleo',
      'Lisossomo',
    ]);
    expect(question.correctLetter).toBe('B');
  });
});
