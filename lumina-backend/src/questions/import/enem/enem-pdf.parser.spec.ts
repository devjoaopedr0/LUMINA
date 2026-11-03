import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EnemImportService } from './enem-import.service';
import {
  areaLabelToSubject,
  classifyCienciasNaturezaSubject,
  parseAreaRanges,
  parseGabaritoText,
  parseOfficialGabarito,
  parseQuestionBody,
  resolveAreaLabel,
  splitQuestionBlocks,
} from './enem-pdf.parser';

const validBody = `Uma célula realiza fotossíntese e produz energia. Qual alternativa está correta?
  A A Primeira resposta
  B B Segunda resposta
  C C Terceira resposta
  D D Quarta resposta
  E E Quinta resposta`;

describe('parser de cadernos do ENEM', () => {
  it('extrai intervalos de áreas declarados nas instruções', () => {
    const ranges = parseAreaRanges(
      'Questões de número 1 a 45, relativas à área de Linguagens, Códigos e suas Tecnologias; ' +
      'questões de número 46 a 90, relativas à área de Ciências Humanas e suas Tecnologias.',
    );
    expect(ranges).toEqual([
      { from: 1, to: 45, areaLabel: 'Linguagens, Códigos e suas Tecnologias' },
      { from: 46, to: 90, areaLabel: 'Ciências Humanas e suas Tecnologias' },
    ]);
    expect(resolveAreaLabel(46, ranges)).toContain('Ciências Humanas');
    expect(resolveAreaLabel(91, ranges)).toBeNull();
  });

  it.each([
    ['Linguagens, Códigos e suas Tecnologias', 'Linguagens'],
    ['Ciências Humanas e suas Tecnologias', 'Ciências Humanas'],
    ['CIÊNCIAS DA NATUREZA', 'Ciências da Natureza'],
    ['Matemática e suas Tecnologias', 'Matemática'],
  ])('normaliza a área %s', (label, expected) => {
    expect(areaLabelToSubject(label)).toBe(expected);
  });

  it('separa questões e extrai cinco alternativas completas', () => {
    const blocks = splitQuestionBlocks(`INSTRUÇÕES QUESTÃO 91 ${validBody} QUESTÃO 92 ${validBody}`);
    expect(blocks.map((block) => block.number)).toEqual([91, 92]);
    expect(parseQuestionBody(blocks[0].body)).toMatchObject({
      alternatives: [
        { letter: 'A', text: 'Primeira resposta' },
        { letter: 'B', text: 'Segunda resposta' },
        { letter: 'C', text: 'Terceira resposta' },
        { letter: 'D', text: 'Quarta resposta' },
        { letter: 'E', text: 'Quinta resposta' },
      ],
    });
  });

  it('recusa alternativa incompleta em vez de inventar conteúdo', () => {
    expect(parseQuestionBody('Enunciado A A uma B B duas C C três D D quatro')).toBeNull();
  });

  it('reconstitui números e reconhece questões anuladas no gabarito', () => {
    expect([...parseGabaritoText('91A92Anulado121C').entries()]).toEqual([
      [91, 'A'], [92, 'Anulado'], [121, 'C'],
    ]);
  });

  it('classifica Natureza apenas quando existe um sinal sem empate', () => {
    expect(classifyCienciasNaturezaSubject('Uma célula realiza fotossíntese')).toBe('Biologia');
    expect(classifyCienciasNaturezaSubject('Texto sem termos classificáveis')).toBe('Ciências da Natureza');
  });

  it('monta questões importáveis e relata anuladas e blocos inválidos', async () => {
    const service = new EnemImportService();
    vi.spyOn(service as any, 'loadExamContent').mockResolvedValue([
      `QUESTÃO 91 ${validBody} QUESTÃO 92 ${validBody} QUESTÃO 93 texto sem alternativas`,
      'Questões de número 91 a 135, relativas à área de Ciências da Natureza e suas Tecnologias.',
      { year: 2025, day: 2, bookletColor: 'Azul', bookletNumber: 7, items: [{ number: 91, letter: 'C', language: '' }, { number: 92, letter: null, language: '' }] },
      new Map([[91, 4], [92, 5]]),
    ]);
    const result = await service.fetchExam({
      year: 2025, day: 2,
      provaUrl: 'https://download.inep.gov.br/prova.pdf',
      gabaritoUrl: 'https://download.inep.gov.br/gabarito.pdf',
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      sourceId: 'enem-2025-d2-q91', subject: 'Biologia', correctLetter: 'C', examNumber: 91,
      sourcePdf: { url: 'https://download.inep.gov.br/prova.pdf', page: 4 },
    });
    expect(result.skipped).toEqual([
      { questionNumber: 92, reason: expect.stringContaining('anulada') },
      { questionNumber: 93, reason: expect.stringContaining('alternativas') },
    ]);
  });

  it('1º dia: questões de 1 dígito e as duas línguas com gabarito e sourceId próprios', async () => {
    const service = new EnemImportService();
    vi.spyOn(service as any, 'loadExamContent').mockResolvedValue([
      `QUESTÃO 1 ${validBody} QUESTÃO 1 ${validBody} QUESTÃO 6 ${validBody}`,
      'Questões de número 1 a 45, relativas à área de Linguagens, Códigos e suas Tecnologias.',
      parseOfficialGabarito('CADERNO 1AzulGabarito 20231diaºQUESTÃOGABARITOINGLÊS ESPANHOL1 B A6 D'),
      new Map([[1, 2], [6, 3]]),
    ]);
    const result = await service.fetchExam({
      year: 2023, day: 1,
      provaUrl: 'https://download.inep.gov.br/prova.pdf',
      gabaritoUrl: 'https://download.inep.gov.br/gabarito.pdf',
    });
    expect(result.skipped).toEqual([]);
    expect(result.questions.map((q) => [q.sourceId, q.subject, q.correctLetter])).toEqual([
      ['enem-2023-d1-q1-ingles', 'Inglês', 'B'],
      ['enem-2023-d1-q1-espanhol', 'Espanhol', 'A'],
      ['enem-2023-d1-q6', expect.any(String), 'D'],
    ]);
  });

  it.each(['http://download.inep.gov.br/prova.pdf', 'https://example.com/prova.pdf', 'não-é-url'])
  ('bloqueia origem de PDF inválida: %s', async (url) => {
    const service = new EnemImportService();
    await expect((service as any).download(url)).rejects.toBeInstanceOf(BadRequestException);
  });
});
