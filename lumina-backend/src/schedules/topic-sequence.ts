/**
 * Trilha de cada matéria: a ordem em que os tópicos entram no cronograma, do
 * que serve de base para o que depende dele (ex.: Frações antes de Razão e
 * proporção, que vem antes de Regra de três). O gerador usa isso para
 * apresentar conteúdo NOVO nessa ordem — ver `orderNewTopicsBySequence`.
 *
 * A chave é o nome da matéria no banco de questões (Subject.name) e os nomes
 * dos tópicos são os de Topic.name. Tópico que não está aqui (criado depois
 * por uma questão importada) vai para o fim da trilha, em ordem alfabética,
 * sem nível — basta acrescentá-lo na posição certa.
 */
export type TopicLevel = 'BASE' | 'INTERMEDIARIO' | 'AVANCADO';

type SubjectTrack = Record<TopicLevel, string[]>;

const TRACKS: Record<string, SubjectTrack> = {
  Matemática: {
    BASE: [
      'Frações',
      'Potenciação e radiciação',
      'Razão e proporção',
      'Regra de três',
      'Porcentagem',
      'Conjuntos',
      'Equações do 1º e 2º grau',
      'Equação do 2º grau',
      'Análise de gráficos e tabelas',
      'Média, mediana e moda',
    ],
    INTERMEDIARIO: [
      'Inequações',
      'Sistemas lineares',
      'Função afim',
      'Função quadrática',
      'Juros simples',
      'Geometria plana',
      'Teorema de Pitágoras',
      'Semelhança de triângulos',
      'Estatística',
      'Desvio padrão',
      'Progressão aritmética',
      'Progressão geométrica',
      'Função exponencial',
      'Juros compostos',
      'Matemática financeira',
      'Inflação',
    ],
    AVANCADO: [
      'Logaritmos',
      'Função logarítmica',
      'Sistemas de amortização',
      'Trigonometria',
      'Geometria espacial',
      'Geometria analítica',
      'Análise combinatória',
      'Probabilidade',
      'Matrizes',
      'Números complexos',
    ],
  },
  Física: {
    BASE: [
      'Velocidade média',
      'Cinemática',
      'Movimento uniformemente variado',
      'Queda livre',
      'Leis de Newton',
      'Dinâmica',
      'Densidade',
      'Pressão',
    ],
    INTERMEDIARIO: [
      'Trabalho',
      'Energia cinética',
      'Energia',
      'Trabalho e energia',
      'Potência',
      'Impulso e quantidade de movimento',
      'Hidrostática',
      'Termologia',
      'Calorimetria',
      'Ondas',
      'Óptica',
    ],
    AVANCADO: [
      'Termodinâmica',
      'Eletrostática',
      'Lei de Ohm',
      'Eletrodinâmica',
      'Circuitos elétricos',
      'Física moderna',
    ],
  },
  Química: {
    BASE: [
      'Estados físicos da água',
      'Separação de misturas',
      'Estrutura atômica',
      'Tabela periódica',
      'Ligações químicas',
      'Funções inorgânicas',
    ],
    INTERMEDIARIO: [
      'Balanceamento de equações',
      'Massa molar',
      'Mol',
      'Estequiometria',
      'Soluções',
      'Gases',
      'Química orgânica',
      'Polímeros',
      'Química ambiental',
    ],
    AVANCADO: [
      'Termoquímica',
      'Cinética química',
      'Equilíbrio químico',
      'pH',
      'Oxirredução',
      'Eletroquímica',
    ],
  },
  Biologia: {
    BASE: ['Origem da vida', 'Bioquímica', 'Citologia', 'Histologia', 'Ecologia'],
    INTERMEDIARIO: [
      'Microbiologia',
      'Parasitologia',
      'Saúde pública',
      'Vacinação',
      'Anatomia',
      'Fisiologia humana',
      'Botânica',
      'Fisiologia vegetal',
      'Zoologia',
    ],
    AVANCADO: ['Genética', 'Evolução', 'Biotecnologia'],
  },
  'Língua Portuguesa': {
    BASE: [
      'Interpretação de texto',
      'Gêneros textuais',
      'Funções da linguagem',
      'Variação linguística',
      'Denotação e conotação',
    ],
    INTERMEDIARIO: [
      'Figuras de linguagem',
      'Semântica',
      'Ambiguidade',
      'Coesão e coerência',
      'Intertextualidade',
      'Fonologia',
      'Morfologia',
    ],
    AVANCADO: [
      'Sintaxe',
      'Pontuação e efeitos de sentido',
      'Concordância verbal',
      'Regência verbal',
      'Concordância e regência (aplicadas ao texto)',
    ],
  },
  // Literatura segue a linha do tempo: cada escola responde à anterior.
  Literatura: {
    BASE: [
      'Análise de poemas',
      'Análise de narrativas',
      'Escolas literárias (Quinhentismo ao Modernismo e Pós-Modernismo)',
      'Trovadorismo',
      'Quinhentismo',
    ],
    INTERMEDIARIO: ['Barroco', 'Arcadismo', 'Romantismo', 'Realismo'],
    AVANCADO: ['Pré-modernismo', 'Vanguardas europeias', 'Modernismo', 'Literatura contemporânea'],
  },
  Artes: {
    BASE: ['Movimentos artísticos', 'Patrimônio cultural'],
    INTERMEDIARIO: ['Arte moderna e contemporânea'],
    AVANCADO: ['Arte como forma de crítica social'],
  },
  Inglês: {
    BASE: ['Vocabulário', 'Compreensão textual', 'Conectivos', 'Comparativos'],
    INTERMEDIARIO: ['Present perfect', 'Present perfect continuous', 'Modal verbs', 'Voz passiva'],
    AVANCADO: ['Conditionals', 'Reported speech', 'Phrasal verbs', 'Expressões idiomáticas'],
  },
  Espanhol: {
    BASE: ['Vocabulário', 'Falsos cognatos', 'Compreensão textual'],
    INTERMEDIARIO: ['Conectivos', 'Tempos verbais', 'Gêneros textuais'],
    AVANCADO: ['Variação linguística do espanhol'],
  },
  'Educação Física': {
    BASE: ['Práticas corporais e cultura', 'Jogos, lutas e danças'],
    INTERMEDIARIO: ['Saúde e qualidade de vida', 'Esporte e sociedade'],
    AVANCADO: ['Lazer e inclusão', 'Corpo, mídia e padrões de beleza'],
  },
  // História também é cronológica, com o Brasil depois do contexto mundial
  // que o explica.
  História: {
    BASE: ['Antiguidade', 'Idade Média', 'Brasil Colônia', 'Iluminismo', 'Revolução Francesa', 'Revolução Industrial'],
    INTERMEDIARIO: [
      'Inconfidência Mineira',
      'Brasil Império',
      'Brasil República',
      'Guerras Mundiais',
      'Segunda Guerra Mundial',
      'Era Vargas',
    ],
    AVANCADO: ['Guerra Fria', 'Ditadura Militar', 'Movimentos sociais', 'Globalização'],
  },
  Geografia: {
    BASE: ['Cartografia', 'Relevo', 'Climatologia', 'Hidrografia', 'Biomas', 'Demografia'],
    INTERMEDIARIO: [
      'Migração',
      'Urbanização',
      'Industrialização',
      'Agricultura',
      'Agropecuária',
      'Energia',
      'Questão ambiental',
      'Mudanças climáticas',
    ],
    AVANCADO: ['Globalização', 'Blocos econômicos', 'Geopolítica', 'Conflitos internacionais'],
  },
  Filosofia: {
    BASE: ['Filosofia antiga', 'Ética'],
    INTERMEDIARIO: ['Teoria do conhecimento', 'Filosofia moderna', 'Política'],
    AVANCADO: ['Filosofia contemporânea', 'Cidadania'],
  },
  Sociologia: {
    BASE: ['Cultura', 'Instituições sociais', 'Sociologia clássica'],
    INTERMEDIARIO: ['Trabalho', 'Estratificação social', 'Desigualdade', 'Estado e poder', 'Cidadania'],
    AVANCADO: ['Direitos Humanos', 'Movimentos sociais', 'Indústria cultural', 'Cultura de massa'],
  },
};

const LEVELS: TopicLevel[] = ['BASE', 'INTERMEDIARIO', 'AVANCADO'];

interface TrackPosition {
  index: number;
  level: TopicLevel;
}

const POSITIONS = new Map<string, Map<string, TrackPosition>>(
  Object.entries(TRACKS).map(([subjectName, track]) => {
    const positions = new Map<string, TrackPosition>();
    for (const level of LEVELS) {
      for (const topicName of track[level]) {
        positions.set(topicName, { index: positions.size, level });
      }
    }
    return [subjectName, positions];
  }),
);

/** Nível do tópico na trilha da matéria; null quando ele não está na trilha. */
export function topicLevel(subjectName: string, topicName: string): TopicLevel | null {
  return POSITIONS.get(subjectName)?.get(topicName)?.level ?? null;
}

/** Compara dois tópicos da MESMA matéria pela trilha: quem vem antes estuda
 *  antes. Fora da trilha vai para o fim, em ordem alfabética. */
export function compareByTrack(subjectName: string, a: string, b: string): number {
  const positions = POSITIONS.get(subjectName);
  const indexA = positions?.get(a)?.index ?? Number.MAX_SAFE_INTEGER;
  const indexB = positions?.get(b)?.index ?? Number.MAX_SAFE_INTEGER;
  return indexA - indexB || a.localeCompare(b, 'pt-BR');
}

/**
 * Faz o conteúdo novo de cada matéria entrar na ordem da trilha, sem mexer no
 * resto da fila: as prioridades que os tópicos ainda não vistos da matéria já
 * tinham são redistribuídas entre eles, a maior para o primeiro da trilha.
 * Assim a matéria continua disputando espaço com as outras como antes (e com
 * os tópicos já começados dela, que ficam com a prioridade que tinham) — só
 * muda QUAL tópico novo vem primeiro.
 */
export function orderNewTopicsBySequence<T extends { priority: number }>(
  candidates: T[],
  describe: (candidate: T) => { subjectName: string; topicName: string; isNew: boolean },
): T[] {
  const newBySubject = new Map<string, { candidate: T; topicName: string }[]>();
  for (const candidate of candidates) {
    const { subjectName, topicName, isNew } = describe(candidate);
    if (!isNew) continue;
    const list = newBySubject.get(subjectName) ?? [];
    list.push({ candidate, topicName });
    newBySubject.set(subjectName, list);
  }

  // Além da prioridade, os tópicos novos trocam de LUGAR na lista entre si,
  // ficando na ordem da trilha: com prioridades empatadas (comum, a maioria
  // dos tópicos novos empata), uma ordenação estável mantém a trilha.
  const replacement = new Map<T, T>();
  for (const [subjectName, list] of newBySubject) {
    const priorities = list.map((item) => item.candidate.priority).sort((a, b) => b - a);
    [...list]
      .sort((a, b) => compareByTrack(subjectName, a.topicName, b.topicName))
      .forEach((item, position) =>
        replacement.set(list[position].candidate, { ...item.candidate, priority: priorities[position] }),
      );
  }
  return candidates.map((candidate) => replacement.get(candidate) ?? candidate);
}
