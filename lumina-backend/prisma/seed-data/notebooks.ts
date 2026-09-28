export type SeedFormula = {
  name: string;
  discipline: 'MATEMATICA' | 'FISICA' | 'QUIMICA' | 'BIOLOGIA' | 'OUTRA';
  topic: string;
  latex: string;
  description: string;
  isFavorite?: boolean;
};

/** Item 21 do inventário. Fórmulas criadas para o projeto, para o caderno do
 * aluno não abrir vazio na primeira demonstração. */
export const FORMULAS: SeedFormula[] = [
  {
    name: 'Bhaskara',
    discipline: 'MATEMATICA',
    topic: 'Funções quadráticas',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    description: 'Raízes de ax² + bx + c = 0. Discriminante negativo: nenhuma raiz real.',
    isFavorite: true,
  },
  {
    name: 'Cinemática - distância',
    discipline: 'FISICA',
    topic: 'Movimento uniforme',
    latex: 'd = v \\cdot t',
    description: 'Movimento uniforme retilíneo. Para movimento acelerado, usar d = v₀t + at²/2.',
  },
  {
    name: 'Lei de Boyle',
    discipline: 'QUIMICA',
    topic: 'Gases',
    latex: 'P_1 V_1 = P_2 V_2',
    description: 'Temperatura constante. Só vale com o mesmo gás, em mol.',
  },
  {
    name: 'Lei de Hardy-Weinberg',
    discipline: 'BIOLOGIA',
    topic: 'Genética',
    latex: 'p^2 + 2pq + q^2 = 1',
    description: 'Equilíbrio só com seleção natural ausente, mutação ausente e panmixia.',
  },
];

export type SeedRepertoire = {
  title: string;
  summary: string;
  source: string;
  year: number;
  theme:
    | 'TECNOLOGIA'
    | 'MEIO_AMBIENTE'
    | 'SAUDE'
    | 'POLITICA'
    | 'EDUCACAO'
    | 'ECONOMIA'
    | 'CULTURA'
    | 'CIENCIA'
    | 'DIREITOS_HUMANOS'
    | 'OUTRO';
  keywords: string[];
  isStudied?: boolean;
};

/** Item 22 do inventário. Repertóriossocioculturais com fonte e ano para o
 * aluno citar com precisão na redação. */
export const REPERTORIOS: SeedRepertoire[] = [
  {
    title: 'George Orwell — 1984',
    summary:
      'A vigilância sobre a linguagem controla o pensamento. O Estado substitui a história por uma versão única, e o "dishwasher" é a metáfora do pensamento curto e automático.',
    source: 'Romance',
    year: 1949,
    theme: 'POLITICA',
    keywords: ['vigilancia', 'liberdade', 'autoritarismo'],
  },
  {
    title: 'Aldous Huxley — Admirável Mundo Novo',
    summary:
      'O condicionamento da reprodução como base da ordem social. Aqui a vigilância é aceita voluntariamente, porque a estabilidade do prazer substitui a coerção.',
    source: 'Romance',
    year: 1932,
    theme: 'TECNOLOGIA',
    keywords: ['condicionamento', 'consumo', 'liberdade'],
  },
  {
    title: 'Convenção de Rotterdam',
    summary:
      'Acordo internacional que limita o uso de agrotóxicos e elimina subsídios que distorcem o comércio. Citar o país signatário mostra domínio do tema.',
    source: 'Tratado internacional',
    year: 2001,
    theme: 'MEIO_AMBIENTE',
    keywords: ['agrotoxico', 'comercio', 'sustentabilidade'],
    isStudied: true,
  },
  {
    title: 'Lei Maria da Penha',
    summary:
      'Lei 11.343/2006. Tipifica a violência doméstica como crime e cria medidas de proteção contra a mulher.',
    source: 'Lei federal',
    year: 2006,
    theme: 'DIREITOS_HUMANOS',
    keywords: ['violencia', 'mulher', 'seguranca'],
  },
  {
    title: 'Hans Rosling — Factfulness',
    summary:
      'Mostra que a Humanidade só se dividiu em mundo pobre e rico ao longo dos últimos 200 anos, o que desmonta a ideia de que a desigualdade é natural.',
    source: 'Livro',
    year: 2018,
    theme: 'CIENCIA',
    keywords: ['dados', 'desigualdade', 'pobreza'],
  },
];
