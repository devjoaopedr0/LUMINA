/**
 * Conteúdos programáticos por disciplina do ENEM, agrupados por matéria
 * (StudySubject.code). Ainda não está ligado a nenhuma feature — guardado
 * como referência para o próximo passo do cronograma (priorização por
 * incidência/dificuldade).
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
          "Interpretação de texto (principal foco da prova)",
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
          "Ondulatória",
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
          "Ecologia (muito cobrada)",
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
          "Geometria plana (área e perímetro)",
          "Geometria espacial (volume)",
          "Teorema de Pitágoras",
          "Semelhança de triângulos",
          "Trigonometria básica",
        ],
      },
      {
        group: "Estatística e probabilidade",
        topics: [
          "Média, mediana e moda",
          "Desvio padrão",
          "Análise de gráficos e tabelas",
          "Probabilidade simples",
          "Análise combinatória básica",
        ],
      },
      {
        group: "Funções",
        topics: [
          "Função do 1º grau",
          "Função do 2º grau",
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
          "República",
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
          "Questões ambientais",
          "Mudanças climáticas",
          "Demografia",
          "Migrações",
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
          "Filosofia Antiga (Sócrates, Platão, Aristóteles)",
          "Filosofia Moderna (Descartes, Locke, Rousseau)",
          "Filosofia Contemporânea",
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
          "Desigualdade social",
          "Trabalho",
          "Indústria cultural",
          "Direitos Humanos",
          "Estado e poder",
        ],
      },
    ],
  },
];
