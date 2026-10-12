/**
 * Conteúdos programáticos por disciplina do ENEM, agrupados por matéria
 * (StudySubject.code). Vira linhas de Topic no seed e alimenta o gerador do
 * cronograma adaptativo. Os nomes aqui são os MESMOS que o banco de questões
 * usa (ex.: "Ecologia", não "Ecologia (muito cobrada)"): nome diferente cria
 * um segundo Topic para o mesmo assunto e divide o domínio do aluno entre os
 * dois — ver TOPIC_MERGES em topic-merges.ts para os que já existiam assim.
 */
export type StudySubjectTopicGroup = {
  /** Sub-área dentro da matéria (ex.: "Geometria" dentro de Matemática). */
  group: string;
  topics: string[];
};

export type StudySubjectTopics = {
  /** Deve bater com StudySubject.code (ver src/prisma/seed.ts). */
  subjectCode: string;
  groups: StudySubjectTopicGroup[];
};

export const STUDY_SUBJECT_TOPICS: StudySubjectTopics[] = [
  {
    subjectCode: "PORTUGUESE",
    groups: [
      {
        group: "Língua Portuguesa",
        topics: [
          "Interpretação de texto",
          "Gêneros textuais",
          "Funções da linguagem",
          "Figuras de linguagem",
          "Variação linguística",
          "Coesão e coerência",
          "Intertextualidade",
          "Denotação e conotação",
          "Ambiguidade",
          "Pontuação e efeitos de sentido",
          "Concordância e regência (aplicadas ao texto)",
        ],
      },
    ],
  },
  {
    subjectCode: "LITERATURE",
    groups: [
      {
        group: "Literatura",
        topics: [
          "Escolas literárias (Quinhentismo ao Modernismo e Pós-Modernismo)",
          "Vanguardas europeias",
          "Literatura contemporânea",
          "Análise de poemas",
          "Análise de narrativas",
        ],
      },
    ],
  },
  {
    subjectCode: "ARTS",
    groups: [
      {
        group: "Artes",
        topics: [
          "Movimentos artísticos",
          "Arte moderna e contemporânea",
          "Arte como forma de crítica social",
          "Patrimônio cultural",
        ],
      },
    ],
  },
  {
    subjectCode: "PHYSICS",
    groups: [
      {
        group: "Física",
        topics: [
          "Cinemática",
          "Leis de Newton",
          "Trabalho e energia",
          "Impulso e quantidade de movimento",
          "Hidrostática",
          "Termologia",
          "Ondas",
          "Óptica",
          "Eletrostática",
          "Eletrodinâmica",
          "Circuitos elétricos",
        ],
      },
    ],
  },
  {
    subjectCode: "CHEMISTRY",
    groups: [
      {
        group: "Química",
        topics: [
          "Estrutura atômica",
          "Ligações químicas",
          "Funções inorgânicas",
          "Estequiometria",
          "Soluções",
          "Termoquímica",
          "Cinética química",
          "Equilíbrio químico",
          "Eletroquímica",
          "Química orgânica",
          "Polímeros",
          "Química ambiental",
        ],
      },
    ],
  },
  {
    subjectCode: "BIOLOGY",
    groups: [
      {
        group: "Biologia",
        topics: [
          "Citologia",
          "Bioquímica",
          "Genética",
          "Evolução",
          "Ecologia",
          "Fisiologia humana",
          "Botânica",
          "Zoologia",
          "Biotecnologia",
          "Saúde pública",
          "Vacinação",
        ],
      },
    ],
  },
  {
    subjectCode: "MATH",
    groups: [
      {
        group: "Matemática básica",
        topics: [
          "Porcentagem",
          "Razão e proporção",
          "Regra de três",
          "Frações",
          "Potenciação e radiciação",
          "Equações do 1º e 2º grau",
        ],
      },
      {
        group: "Geometria",
        topics: [
          "Geometria plana",
          "Geometria espacial",
          "Teorema de Pitágoras",
          "Semelhança de triângulos",
          "Trigonometria",
        ],
      },
      {
        group: "Estatística e probabilidade",
        topics: [
          "Média, mediana e moda",
          "Desvio padrão",
          "Análise de gráficos e tabelas",
          "Probabilidade",
          "Análise combinatória",
        ],
      },
      {
        group: "Funções",
        topics: [
          "Função afim",
          "Função quadrática",
          "Função exponencial",
          "Função logarítmica",
        ],
      },
      {
        group: "Matemática financeira",
        topics: [
          "Juros simples",
          "Juros compostos",
          "Inflação",
          "Sistemas de amortização",
        ],
      },
    ],
  },
  {
    subjectCode: "HISTORY",
    groups: [
      {
        group: "História",
        topics: [
          "Brasil Colônia",
          "Brasil Império",
          "Brasil República",
          "Era Vargas",
          "Ditadura Militar",
          "Movimentos sociais",
          "Revolução Francesa",
          "Revolução Industrial",
          "Guerras Mundiais",
          "Guerra Fria",
          "Globalização",
        ],
      },
    ],
  },
  {
    subjectCode: "GEOGRAPHY",
    groups: [
      {
        group: "Geografia",
        topics: [
          "Geopolítica",
          "Globalização",
          "Conflitos internacionais",
          "Blocos econômicos",
          "Urbanização",
          "Industrialização",
          "Agricultura",
          "Questão ambiental",
          "Mudanças climáticas",
          "Demografia",
          "Migração",
          "Cartografia",
        ],
      },
    ],
  },
  {
    subjectCode: "PHILOSOPHY",
    groups: [
      {
        group: "Filosofia",
        topics: [
          "Filosofia antiga",
          "Filosofia moderna",
          "Filosofia contemporânea",
          "Ética",
          "Política",
          "Cidadania",
        ],
      },
    ],
  },
  {
    subjectCode: "SOCILOGY",
    groups: [
      {
        group: "Sociologia",
        topics: [
          "Cultura",
          "Cidadania",
          "Movimentos sociais",
          "Desigualdade",
          "Trabalho",
          "Indústria cultural",
          "Direitos Humanos",
          "Estado e poder",
        ],
      },
    ],
  },
];
