import { describe, expect, it } from 'vitest';
import { ClassifierCatalog, classifyWebHit, normalizeTokens, relevanceToQuery } from './web-hit-classifier';

const catalog: ClassifierCatalog = {
  subjects: [
    {
      id: 'mat',
      name: 'Matemática',
      topics: [
        { id: 't-afim', name: 'Função afim' },
        { id: 't-quad', name: 'Função quadrática' },
        { id: 't-eq2', name: 'Equação do 2º grau' },
        { id: 't-conj', name: 'Conjuntos' },
        { id: 't-geral', name: 'Geral' },
        { id: 't-geo', name: 'Geometria plana' },
      ],
    },
    { id: 'bio', name: 'Biologia', topics: [{ id: 't-evo', name: 'Evolução' }, { id: 't-gen', name: 'Genética' }] },
    { id: 'his', name: 'História', topics: [{ id: 't-2gm', name: 'Segunda Guerra Mundial' }, { id: 't-vargas', name: 'Era Vargas' }] },
    { id: 'por', name: 'Língua Portuguesa', topics: [{ id: 't-fig', name: 'Figuras de linguagem' }] },
  ],
  exams: [
    { id: 'enem-2021', name: 'ENEM', year: 2021 },
    { id: 'enem-2023', name: 'ENEM', year: 2023 },
    { id: 'fuvest-2020', name: 'FUVEST', year: 2020 },
    { id: 'debug', name: 'DEBUG12', year: 2020 },
  ],
};

const NOW = new Date('2026-11-17T12:00:00Z');
const hit = (title: string, snippet = '', link = 'https://exemplo.com.br/pagina') => ({ title, snippet, link });

describe('normalizeTokens', () => {
  it('tira acentos, plural e unifica ordinais', () => {
    expect(normalizeTokens('Funções do 2º Grau')).toEqual(['funcao', 'do', '2', 'grau']);
    expect(normalizeTokens('função de segundo grau')).toEqual(['funcao', 'de', '2', 'grau']);
    expect(normalizeTokens('Funções afins')).toEqual(['funcao', 'afim']);
  });
});

describe('classifyWebHit', () => {
  it('acha assunto, disciplina, prova e ano num título típico', () => {
    const c = classifyWebHit(hit('[LAZUEDU] Função Afim no ENEM 2021'), { q: 'função afim' }, catalog, NOW);
    expect(c).toMatchObject({
      subject: 'Matemática',
      subjectId: 'mat',
      topic: 'Função afim',
      topicId: 't-afim',
      exam: 'ENEM',
      examId: 'enem-2021',
      year: 2021,
    });
  });

  it('reconhece sinônimos e plurais do assunto', () => {
    expect(classifyWebHit(hit('Lista: funções do 1º grau'), { q: 'x' }, catalog, NOW)?.topic).toBe('Função afim');
    expect(classifyWebHit(hit('Exercícios de função de segundo grau'), { q: 'x' }, catalog, NOW)?.topic).toBe('Função quadrática');
    expect(classifyWebHit(hit('Questões sobre a II Guerra Mundial'), { q: 'x' }, catalog, NOW)?.topic).toBe('Segunda Guerra Mundial');
    expect(classifyWebHit(hit('Exercícios sobre a primeira lei de Mendel'), { q: 'x' }, catalog, NOW)?.topic).toBe('Genética');
  });

  it('lê o assunto também no endereço da página', () => {
    const c = classifyWebHit(hit('Lista 08', '', 'https://site.com/enem/funcao-afim-exercicios'), { q: 'x' }, catalog, NOW);
    expect(c?.topic).toBe('Função afim');
    expect(c?.exam).toBe('ENEM');
  });

  it('usa a disciplina do filtro e só procura assuntos dela', () => {
    const c = classifyWebHit(hit('Evolução das funções afins'), { q: 'x', subject: 'Biologia' }, catalog, NOW);
    expect(c?.subject).toBe('Biologia');
    expect(c?.topic).toBe('Evolução');
  });

  it('assunto de uma palavra só conta com disciplina definida ou contexto de questão', () => {
    expect(classifyWebHit(hit('Conjuntos habitacionais crescem'), { q: 'x' }, catalog, NOW)?.topic ?? null).toBeNull();
    expect(classifyWebHit(hit('Conjuntos: aula de matemática'), { q: 'x' }, catalog, NOW)?.topic).toBe('Conjuntos');
    expect(classifyWebHit(hit('Questões de genética mendeliana'), { q: 'x' }, catalog, NOW)).toMatchObject({
      topic: 'Genética',
      subject: 'Biologia',
    });
  });

  it('ignora o assunto genérico "Geral"', () => {
    expect(classifyWebHit(hit('Matemática geral para o vestibular'), { q: 'x' }, catalog, NOW)?.topic ?? null).toBeNull();
  });

  it('detecta a disciplina mais citada quando não há assunto', () => {
    const c = classifyWebHit(hit('Biologia para o vestibular', 'questões de biologia comentadas'), { q: 'x' }, catalog, NOW);
    expect(c?.subject).toBe('Biologia');
    expect(c?.topic ?? null).toBeNull();
  });

  it('ano: aceita parênteses e ignora anos fora da faixa', () => {
    expect(classifyWebHit(hit('Questão (ENEM 2023) resolvida'), { q: 'x' }, catalog, NOW)?.year).toBe(2023);
    expect(classifyWebHit(hit('ENEM 1850 curiosidades'), { q: 'x' }, catalog, NOW)?.year ?? null).toBeNull();
    expect(classifyWebHit(hit('ENEM 2031 previsões'), { q: 'x' }, catalog, NOW)?.year ?? null).toBeNull();
  });

  it('sem ano conhecido não inventa examId', () => {
    const c = classifyWebHit(hit('Fuvest 2019 primeira fase'), { q: 'x' }, catalog, NOW);
    expect(c).toMatchObject({ exam: 'FUVEST', year: 2019, examId: null });
  });

  it('não usa nomes de prova de teste com dígitos', () => {
    expect(classifyWebHit(hit('debug12 log'), { q: 'x' }, catalog, NOW)?.exam ?? null).toBeNull();
  });

  it('prova e dificuldade do filtro valem quando o texto não diz', () => {
    const c = classifyWebHit(hit('Exercícios de genética'), { q: 'x', exam: 'FUVEST', difficulty: 'DIFICIL' }, catalog, NOW);
    expect(c).toMatchObject({ topic: 'Genética', subject: 'Biologia', exam: 'FUVEST', difficulty: 'DIFICIL' });
  });

  it('devolve null quando nada foi reconhecido', () => {
    expect(classifyWebHit(hit('Receita de bolo'), { q: 'bolo' }, catalog, NOW)).toBeNull();
  });
});

describe('relevanceToQuery', () => {
  it('pontua mais quem bate com o assunto e a prova pedidos', () => {
    const query = { q: 'x', topic: 'Função afim', exam: 'ENEM' };
    const full = relevanceToQuery({ topic: 'Função afim', exam: 'ENEM', year: 2021 }, query);
    const partial = relevanceToQuery({ topic: 'Função quadrática' }, query);
    expect(full).toBeGreaterThan(partial);
    expect(relevanceToQuery(null, query)).toBe(0);
  });
});
