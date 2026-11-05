/**
 * Base de conhecimento ARQUIVADA da cartilha de 2025 (RAG).
 *
 * Fonte: "A redação no Enem 2025 — Cartilha do Participante" (Inep/MEC,
 * publicada em 03/10/2025). As páginas citadas são as numeradas no rodapé da
 * cartilha (não as do arquivo PDF, que tem duas páginas de capa a mais).
 *
 * Esta versão NÃO é a base padrão: a edição vigente é a de 2026. O arquivo
 * permanece para auditoria e para consulta explícita por versão. A base
 * corrente e o catálogo de documentos ficam em `knowledge/index.ts`.
 *
 * Trechos com `source: 'lumina'` NÃO estão na cartilha: são critérios
 * operacionais da Lumina para tornar a avaliação reprodutível (ex.: contagem
 * dos elementos da proposta de intervenção) e estão marcados como tal para a
 * IA e para o aluno nunca os confundirem com texto do Inep.
 */
import { attachDocument, COMPETENCY_IDS, CompetencyId, KnowledgeChunk, KnowledgeChunkSeed } from './types';
import { CARTILHA_2025 } from './documents';

export type { CompetencyId, KnowledgeChunk, KnowledgeScope } from './types';

export const CARTILHA_REFERENCE = {
  title: 'A redação no Enem 2025 — Cartilha do Participante',
  publisher: 'Inep/MEC',
  publishedAt: '2025-10-03',
  url: 'https://www.gov.br/inep/pt-br/centrais-de-conteudo/publicacoes',
} as const;

/** Níveis de desempenho de cada competência (cartilha 2025, literal). */
export const COMPETENCY_GRID: Record<CompetencyId, { name: string; page: number; levels: Record<0 | 40 | 80 | 120 | 160 | 200, string> }> = {
  C1: {
    name: 'Demonstrar domínio da modalidade escrita formal da língua portuguesa.',
    page: 14,
    levels: {
      200: 'Demonstra excelente domínio da modalidade escrita formal da língua portuguesa e de escolha de registro. Desvios gramaticais ou de convenções da escrita serão aceitos somente como excepcionalidade e quando não caracterizarem reincidência.',
      160: 'Demonstra bom domínio da modalidade escrita formal da língua portuguesa e de escolha de registro, com poucos desvios gramaticais e de convenções da escrita.',
      120: 'Demonstra domínio mediano da modalidade escrita formal da língua portuguesa e de escolha de registro, com alguns desvios gramaticais e de convenções da escrita.',
      80: 'Demonstra domínio insuficiente da modalidade escrita formal da língua portuguesa, com muitos desvios gramaticais, de escolha de registro e de convenções da escrita.',
      40: 'Demonstra domínio precário da modalidade escrita formal da língua portuguesa, de forma sistemática, com diversificados e frequentes desvios gramaticais, de escolha de registro e de convenções da escrita.',
      0: 'Demonstra desconhecimento da modalidade escrita formal da língua portuguesa.',
    },
  },
  C2: {
    name: 'Compreender a proposta de redação e aplicar conceitos das várias áreas de conhecimento para desenvolver o tema dentro dos limites estruturais do texto dissertativo-argumentativo em prosa.',
    page: 26,
    levels: {
      200: 'Desenvolve o tema por meio de argumentação consistente, a partir de um repertório sociocultural produtivo, e apresenta excelente domínio do texto dissertativo-argumentativo.',
      160: 'Desenvolve o tema por meio de argumentação consistente e apresenta bom domínio do texto dissertativo-argumentativo, com proposição, argumentação e conclusão.',
      120: 'Desenvolve o tema por meio de argumentação previsível e apresenta domínio mediano do texto dissertativo-argumentativo, com proposição, argumentação e conclusão.',
      80: 'Desenvolve o tema recorrendo à cópia de trechos dos textos motivadores ou apresenta domínio insuficiente do texto dissertativo-argumentativo, não atendendo à estrutura com proposição, argumentação e conclusão.',
      40: 'Apresenta o assunto, tangenciando o tema, ou demonstra domínio precário do texto dissertativo-argumentativo, com traços constantes de outros tipos textuais.',
      0: 'Fuga ao tema/não atendimento à estrutura dissertativo-argumentativa. Nestes casos a redação recebe nota 0 (zero) e é anulada.',
    },
  },
  C3: {
    name: 'Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.',
    page: 30,
    levels: {
      200: 'Apresenta informações, fatos e opiniões relacionados ao tema proposto, de forma consistente e organizada, configurando autoria, em defesa de um ponto de vista.',
      160: 'Apresenta informações, fatos e opiniões relacionados ao tema, de forma organizada, com indícios de autoria, em defesa de um ponto de vista.',
      120: 'Apresenta informações, fatos e opiniões relacionados ao tema, limitados aos argumentos dos textos motivadores e pouco organizados, em defesa de um ponto de vista.',
      80: 'Apresenta informações, fatos e opiniões relacionados ao tema, mas desorganizados ou contraditórios e limitados aos argumentos dos textos motivadores, em defesa de um ponto de vista.',
      40: 'Apresenta informações, fatos e opiniões pouco relacionados ao tema ou incoerentes e sem defesa de um ponto de vista.',
      0: 'Apresenta informações, fatos e opiniões não relacionados ao tema e sem defesa de um ponto de vista.',
    },
  },
  C4: {
    name: 'Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.',
    page: 33,
    levels: {
      200: 'Articula bem as partes do texto e apresenta repertório diversificado de recursos coesivos.',
      160: 'Articula as partes do texto, com poucas inadequações, e apresenta repertório diversificado de recursos coesivos.',
      120: 'Articula as partes do texto, de forma mediana, com inadequações, e apresenta repertório pouco diversificado de recursos coesivos.',
      80: 'Articula as partes do texto, de forma insuficiente, com muitas inadequações, e apresenta repertório limitado de recursos coesivos.',
      40: 'Articula as partes do texto de forma precária.',
      0: 'Não articula as informações.',
    },
  },
  C5: {
    name: 'Elaborar proposta de intervenção para o problema abordado, respeitando os direitos humanos.',
    page: 37,
    levels: {
      200: 'Elabora muito bem proposta de intervenção, detalhada, relacionada ao tema e articulada à discussão desenvolvida no texto.',
      160: 'Elabora bem proposta de intervenção relacionada ao tema e articulada à discussão desenvolvida no texto.',
      120: 'Elabora, de forma mediana, proposta de intervenção relacionada ao tema e articulada à discussão desenvolvida no texto.',
      80: 'Elabora, de forma insuficiente, proposta de intervenção relacionada ao tema, ou não articulada com a discussão desenvolvida no texto.',
      40: 'Apresenta proposta de intervenção vaga, precária ou relacionada apenas ao assunto.',
      0: 'Não apresenta proposta de intervenção ou apresenta proposta não relacionada ao tema ou ao assunto.',
    },
  },
};

const gradeChunks: KnowledgeChunkSeed[] = (Object.keys(COMPETENCY_GRID) as CompetencyId[]).map((id) => {
  const grid = COMPETENCY_GRID[id];
  const lines = ([200, 160, 120, 80, 40, 0] as const).map((score) => `${score} pontos: ${grid.levels[score]}`);
  return {
    id: `${id.toLowerCase()}-niveis`,
    scope: id,
    title: `Níveis de desempenho da Competência ${id.slice(1)}`,
    text: `Competência ${id.slice(1)} — ${grid.name}\n${lines.join('\n')}`,
    page: grid.page,
    source: 'inep-cartilha-2025',
    kind: 'grade',
  };
});

const chunks: KnowledgeChunkSeed[] = [
  // ---------------------------------------------------------------- GERAL
  {
    id: 'geral-o-que-a-prova-exige',
    scope: 'GERAL',
    title: 'O que a prova de redação exige',
    page: 5,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A prova exige um texto dissertativo-argumentativo, em modalidade escrita formal da língua portuguesa, sobre tema de ordem social, científica, cultural ou política. O participante deve defender um ponto de vista — uma opinião a respeito do tema proposto —, apoiado em argumentos consistentes, estruturados com coerência e coesão, formando uma unidade textual. Deve selecionar, organizar e relacionar argumentos e fatos para a defesa do ponto de vista e elaborar uma proposta de intervenção social para o problema apresentado, respeitando os direitos humanos. Sequência esperada: tema → ponto de vista → argumentos → proposta de intervenção.',
  },
  {
    id: 'geral-como-e-atribuida-a-nota',
    scope: 'GERAL',
    title: 'Como a nota é atribuída',
    page: 6,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A redação é avaliada por, no mínimo, duas pessoas graduadas em Letras ou Linguística, de forma independente, sem que uma conheça a nota da outra. Cada avaliador atribui de 0 a 200 pontos a cada uma das cinco competências; a nota total de cada avaliador é a soma (até 1.000 pontos). A nota final é a média aritmética das notas totais dos dois avaliadores.',
  },
  {
    id: 'geral-discrepancia',
    scope: 'GERAL',
    title: 'Discrepância entre avaliadores',
    page: 6,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Há discrepância quando as notas dos dois avaliadores diferem em mais de 100 pontos no total ou em mais de 80 pontos em qualquer competência. Nesse caso, um terceiro avaliador corrige de forma independente e a nota final é a média das duas notas totais que mais se aproximarem. Se a discrepância persistir, uma banca de três avaliadores atribui a nota final (p. 7).',
  },
  {
    id: 'geral-nota-zero',
    scope: 'GERAL',
    title: 'Razões para nota 0 (zero)',
    page: 7,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A redação recebe nota 0 (zero) se apresentar: fuga total ao tema; não obediência ao tipo dissertativo-argumentativo; ausência de texto ("Em Branco"); extensão de até 7 linhas manuscritas, qualquer que seja o conteúdo, ou até 10 linhas em Braille ("Texto insuficiente"); impropérios, desenhos e outras formas propositais de anulação ("Anulada"); parte deliberadamente desconectada do tema proposto; nome, assinatura, rubrica ou qualquer outra forma de identificação fora do espaço destinado a isso ("Anulada"); texto predominantemente ou integralmente em língua estrangeira; texto ilegível, que impossibilite a leitura por dois avaliadores independentes ("Anulada") (p. 7–8).',
  },
  {
    id: 'geral-copia',
    scope: 'GERAL',
    title: 'Trechos copiados da prova',
    page: 8,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Linhas compostas, integral ou parcialmente, por cópia de textos da Prova de Redação e/ou do Caderno de Questões são desconsideradas para a avaliação e para a contagem do mínimo de linhas; contam apenas as linhas produzidas pelo participante. Na Competência II, desenvolver o tema recorrendo à cópia de trechos dos textos motivadores corresponde ao nível de 80 pontos.',
  },
  {
    id: 'geral-letra-ilegivel',
    scope: 'GERAL',
    title: 'Letra legível e marcas na folha',
    page: 8,
    source: 'inep-cartilha-2025',
    kind: 'orientacao',
    text:
      'Escreva com letra legível: uma redação incompreensível devido à letra ilegível pode receber nota zero. Não faça destaques no título nem marcas de finalização que possam ser consideradas desenhos ou formas de identificação. Assine apenas no local destinado a isso; não se identifique no texto de forma alguma.',
  },
  {
    id: 'geral-partes-desconectadas',
    scope: 'GERAL',
    title: 'Partes deliberadamente desconectadas do tema',
    page: 8,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'São partes deliberadamente desconectadas: reflexões do participante sobre o próprio processo de escrita, sobre a prova ou sobre o próprio desempenho; bilhetes destinados à banca; mensagens políticas ou de protesto, orações, mensagens religiosas; frases desconectadas do corpo do texto sem relação com o tema ou com a argumentação; trechos de música, de hino, de poema ou de qualquer texto, desde que desarticulados da argumentação. Uma mensagem de protesto não é automaticamente parte desconectada: depende de estar ou não articulada à argumentação. O critério é a inserção proposital, pontual e desarticulada de elementos estranhos ao tema e ao projeto de texto, ou que atentem contra a seriedade do exame (p. 8–9).',
  },
  {
    id: 'geral-titulo',
    scope: 'GERAL',
    title: 'Como o título é avaliado',
    page: 9,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'O título é opcional. Embora seja considerado linha escrita, não é avaliado em nenhum aspecto relacionado às competências da Matriz de Referência. Pode, porém, levar à nota zero se tiver característica de anulação (por exemplo, desenhos, sinais gráficos sem função evidente ou impropérios).',
  },
  // ---------------------------------------------------------------- C1
  {
    id: 'c1-o-que-avalia',
    scope: 'C1',
    title: 'O que a Competência I avalia',
    page: 12,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A Competência I avalia o domínio da modalidade escrita formal: convenções da escrita (ortografia e acentuação gráfica pelo Acordo Ortográfico vigente), regras gramaticais e construção sintática. O avaliador considera os problemas de construção sintática e a presença de desvios de convenções da escrita, gramaticais, de escolha de registro e de escolha vocabular. A escrita formal é a modalidade associada ao texto dissertativo-argumentativo, e a própria proposta exige redigir "em modalidade escrita formal da língua portuguesa".',
  },
  {
    id: 'c1-estrutura-sintatica',
    scope: 'C1',
    title: 'Estrutura sintática na Competência I',
    page: 13,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A estrutura sintática é avaliada junto com os desvios. Uma estrutura convencional apresenta as ideias com clareza, em períodos bem estruturados e completos. Para a nota máxima na Competência I, espera-se que os períodos apresentem complexidade, com orações subordinadas e intercaladas. Falhas de estrutura sintática: períodos truncados, justaposição de palavras, ausência de termos ou excesso de palavras — em geral um ponto final separando orações que deveriam formar um mesmo período (truncamento) ou uma vírgula no lugar de um ponto final (justaposição). A frequência dessas falhas e o quanto prejudicam a compreensão definem o nível.',
  },
  {
    id: 'c1-tipos-de-desvio',
    scope: 'C1',
    title: 'Tipos de desvio observados',
    page: 13,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Convenções da escrita: acentuação, ortografia, uso do hífen, emprego de letras maiúsculas e minúsculas e separação silábica (translineação). Gramaticais: regência verbal e nominal, concordância verbal e nominal, tempos e modos verbais, pontuação, paralelismos sintático, morfológico e semântico, emprego de pronomes e crase. Escolha de registro: adequação à modalidade escrita formal, isto é, ausência de uso de registro informal e/ou de marcas de oralidade. Escolha vocabular: emprego de vocabulário preciso — palavras usadas em seu sentido correto e apropriadas ao contexto.',
  },
  // ---------------------------------------------------------------- C2
  {
    id: 'c2-o-que-avalia',
    scope: 'C2',
    title: 'O que a Competência II avalia',
    page: 14,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A Competência II avalia a compreensão da proposta: um tema específico desenvolvido na forma de texto dissertativo-argumentativo, em que, por meio de argumentação, se defende um ponto de vista. É mais do que exposição de ideias — texto apenas expositivo não atende; é preciso assumir claramente um ponto de vista relacionado ao tema da proposta. Avalia habilidades integradas de leitura e escrita.',
  },
  {
    id: 'c2-tema-e-recorte',
    scope: 'C2',
    title: 'Tema, recorte temático e fuga',
    page: 15,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'O tema é o núcleo das ideias e é um recorte de um assunto mais abrangente. É preciso ter o recorte temático definido na proposta para não tangenciá-lo (abordar parcialmente o tema) nem, pior, desenvolver um tema distinto do determinado. Fuga e tangenciamento são dos principais problemas nas redações.',
  },
  {
    id: 'c2-repertorio-sociocultural',
    scope: 'C2',
    title: 'Repertório sociocultural',
    page: 15,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Repertório sociocultural é uma informação, um fato, uma citação ou uma experiência vivida que, de alguma forma, esteja relacionada ao tema e contribua como argumento para a discussão. Recomendações: ler com atenção a proposta e os textos motivadores; não copiar trechos dos textos motivadores (a recorrência de cópia é avaliada negativamente); usar informações que extrapolem a prova e se relacionem a áreas do conhecimento; selecionar conhecimentos próprios pertinentes e articulá-los de modo produtivo, a serviço do ponto de vista. Informações e citações soltas, por mais variadas e interessantes, perdem relevância quando não associadas produtivamente à defesa do ponto de vista.',
  },
  {
    id: 'c2-repertorio-de-bolso',
    scope: 'C2',
    title: 'Repertório de bolso',
    page: 16,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      '"Repertório de bolso" são referências prontas, memorizadas e usadas de forma genérica e pouco aprofundada, sem conexão genuína com o tema — um repertório "guardado no bolso" para qualquer tema. O repertório deve ser pertinente ao assunto, contextualizado e articulado como argumento, mostrando que o participante sabe relacionar o conhecimento ao problema. Se o avaliador perceber que foi inserido de forma decorada, automática ou forçada, pode considerá-lo não produtivo, o que prejudica a nota da Competência II. Exemplos da cartilha: "Utopia", de Thomas More, como contraponto genérico entre ideal e realidade, sem contextualizar a obra nem retomá-la nos argumentos; "instituições zumbis", de Bauman, usada como enfeite teórico aplicável a qualquer instituição, sem explicar o conceito nem relacioná-lo ao recorte do tema — apoiar-se na autoridade do autor em vez de construir raciocínio próprio compromete a autoria (p. 17–18).',
  },
  {
    id: 'c2-repertorio-produtivo',
    scope: 'C2',
    title: 'Como usar repertório de forma produtiva',
    page: 19,
    source: 'inep-cartilha-2025',
    kind: 'exemplo',
    text:
      'Para evitar o repertório de bolso: escolher referências específicas que tenham relação real com o tema; articular o repertório às ideias que defendem o ponto de vista; mostrar que entende o conteúdo citado e que ele fortalece a tese. Nos exemplos produtivos da cartilha (Maria Beatriz Nascimento, "Úrsula" de Maria Firmina dos Reis, Cartola), a referência é específica e ligada ao tema, o parágrafo explica por que foi citada, há articulação entre a citação e o ponto de vista e o contexto é compreendido e usado para sustentar o argumento. Repertórios válidos vêm de conhecimento institucionalizado ou de conhecimento de mundo (música, filmes, literatura, podcasts, notícias, documentários); decorar repertório descredibiliza o texto (p. 19–21).',
  },
  {
    id: 'c2-fuga-ao-tema',
    scope: 'C2',
    title: 'O que é fuga total ao tema',
    page: 24,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Há fuga ao tema quando nem o assunto mais amplo nem o tema específico proposto são desenvolvidos. Exemplo do Enem 2024 (tema "Desafios para a valorização da herança africana no Brasil"): o tema completo exigia Desafios + Valorização + Herança africana + Brasil; foi fuga abordar só o continente africano, só a história do Brasil sem a herança africana, ou só o preconceito no Brasil sem a herança africana. Mencionar o tema apenas no título, ou deixá-lo subentendido, não basta: o texto deve ser compreendido por um leitor que não teve acesso à proposta (p. 24–25).',
  },
  {
    id: 'c2-tangenciamento',
    scope: 'C2',
    title: 'O que é tangenciar o tema',
    page: 25,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Tangenciamento é uma abordagem parcial baseada somente no assunto mais amplo a que o tema está vinculado. No Enem 2024, tangenciou quem abordou a herança africana no Brasil sem relacioná-la aos desafios ou à valorização; a valorização da herança africana em outro país; ou desafios e herança africana sem relacioná-los à valorização no Brasil. Pela Matriz de Referência, o tangenciamento, avaliado na Competência II, afeta também as Competências III e V, impedindo nota acima de 40 pontos em todas essas competências.',
  },
  {
    id: 'c2-tipo-textual',
    scope: 'C2',
    title: 'Não atender ao tipo dissertativo-argumentativo',
    page: 25,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Não atende ao tipo textual a redação com predominância de características de outro tipo, como o narrativo ou o descritivo; ela recebe nota 0 (zero), mesmo que atenda aos outros critérios. Texto dissertativo-argumentativo organiza-se na defesa de um ponto de vista, fundamentado com argumentos para convencer o leitor: é argumentativo porque defende uma opinião e dissertativo porque usa explicações para justificá-la. Redações predominantemente dissertativo-argumentativas com muitas características de outro tipo não zeram, mas são penalizadas na Competência II. Trechos pontuais narrando acontecimentos que justificam o ponto de vista são aceitos; reduzir o texto a narração, poema ou depoimento pessoal não (p. 25–26). Fuga ao tema ou não atendimento ao tipo textual: a redação não é avaliada em nenhuma competência e a nota final é 0 (p. 27).',
  },
  // ---------------------------------------------------------------- C3
  {
    id: 'c3-o-que-avalia',
    scope: 'C3',
    title: 'O que a Competência III avalia',
    page: 27,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A Competência III avalia como o texto seleciona, relaciona, organiza e interpreta informações, fatos, opiniões e argumentos em defesa do ponto de vista escolhido: uma ideia claramente defendida e argumentos que justifiquem a posição. Trata da inteligibilidade do texto — coerência e plausibilidade entre as ideias —, alicerçada num projeto de texto. A inteligibilidade depende de: seleção de argumentos; relação de sentido entre as partes; progressão adequada, revelando planejamento e ideias apresentadas pouco a pouco de forma organizada; e desenvolvimento dos argumentos, com explicitação da relevância das ideias para a defesa do ponto de vista.',
  },
  {
    id: 'c3-projeto-de-texto',
    scope: 'C3',
    title: 'Projeto de texto',
    page: 28,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Projeto de texto é o planejamento prévio à escrita: o esquema que se deixa perceber pela organização estratégica dos argumentos. Nele se definem os argumentos e a melhor ordem para apresentá-los, garantindo texto articulado, claro e coerente. Atende à Competência III o texto em que se percebe a presença implícita de um projeto, com estratégia claramente identificável para defender o ponto de vista.',
  },
  {
    id: 'c3-desenvolvimento',
    scope: 'C3',
    title: 'Desenvolvimento dos argumentos',
    page: 28,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Desenvolvimento é a fundamentação dos argumentos: como o texto explicita e explica informações, fatos e opiniões — por exemplos, definições, comparações, analogias, estatísticas etc. — sempre relacionados ao ponto de vista, para que nenhuma informação fique solta ou confusa. É preciso fazer os desdobramentos necessários para não deixar lacunas de sentido a serem preenchidas pelo leitor.',
  },
  {
    id: 'c3-recomendacoes',
    scope: 'C3',
    title: 'Exigências de organização do texto',
    page: 29,
    source: 'inep-cartilha-2025',
    kind: 'orientacao',
    text:
      'Defina o ponto de vista; selecione ideias pertinentes e organize-as numa estrutura coerente; ordene-as para que o leitor acompanhe o raciocínio (progressão fluente e articulada); verifique a coerência entre introdução e conclusão; confira se todos os argumentos convergem para o ponto de vista e estão bem desenvolvidos; evite informações, fatos e opiniões soltos, sem desenvolvimento nem articulação. Em resumo: apresentação clara do ponto de vista e seleção dos argumentos que o sustentam; encadeamento das ideias, sem repetições desnecessárias nem saltos temáticos; e desenvolvimento por explicitação, explicação ou exemplificação. Evite informações irrelevantes, repetidas ou excessivas (p. 28–29).',
  },
  // ---------------------------------------------------------------- C4
  {
    id: 'c4-o-que-avalia',
    scope: 'C4',
    title: 'O que a Competência IV avalia',
    page: 30,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A Competência IV avalia a estruturação lógica e formal entre as partes da redação: frases e parágrafos devem estabelecer relação que garanta sequenciação coerente e interdependência entre as ideias. Isso se faz com recursos coesivos, em especial operadores argumentativos, que constroem relações de igualdade (assim como, outrossim), adversidade (entretanto, porém), causa e consequência (por isso, assim), conclusão (enfim, portanto); preposições, conjunções, advérbios e locuções adverbiais; e pronomes e expressões referenciais (p. 30–31).',
  },
  {
    id: 'c4-diferenca-c3',
    scope: 'C4',
    title: 'Diferença entre Competência III e IV',
    page: 31,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'As Competências III e IV consideram a construção da argumentação, mas avaliam aspectos diferentes: a III avalia a estrutura mais profunda do texto (selecionar, relacionar, organizar e interpretar argumentos); a IV avalia a superfície textual, isto é, as marcas linguísticas que levam o leitor à compreensão — o encadeamento entre parágrafos e dentro deles.',
  },
  {
    id: 'c4-principios-de-coesao',
    scope: 'C4',
    title: 'Princípios de coesão',
    page: 31,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Estruturação dos parágrafos: um parágrafo é uma unidade formada por uma ideia principal à qual se ligam secundárias; pode ser desenvolvido por comparação, causa-consequência, exemplificação, detalhamento; deve haver articulação explícita entre um parágrafo e outro. Estruturação dos períodos: no texto dissertativo-argumentativo, normalmente complexos, com duas ou mais orações, expressando causa/consequência, contradição, temporalidade, comparação, conclusão. Referenciação: pessoas, coisas, lugares e fatos são apresentados e retomados por pronomes, advérbios, artigos, sinônimos, antônimos, hipônimos, hiperônimos e expressões resumitivas, metafóricas ou metadiscursivas (p. 31–32).',
  },
  {
    id: 'c4-o-que-evitar',
    scope: 'C4',
    title: 'O que evitar na coesão',
    page: 32,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Evite: ausência de articulação entre orações, frases e parágrafos; ausência de paragrafação (texto em um único parágrafo); conector (preposição, conjunção, pronome relativo, advérbios e locuções) que não estabeleça relação lógica entre os trechos e prejudique a compreensão; repetição ou substituição inadequada de palavras sem usar os recursos da língua (pronome, advérbio, artigo, sinônimo). Não use elementos coesivos de forma artificial ou excessiva: boa coesão não depende da mera presença de conectivos, muito menos em grande quantidade — eles precisam estabelecer relações lógicas adequadas (p. 32–33). Estratégias recomendadas: substituição por pronomes, advérbios de lugar e artigos; por sinônimos, hipônimos, hiperônimos ou expressões resumitivas; por conectivos ou expressões que retomem o que foi dito; elipse (p. 32).',
  },
  // ---------------------------------------------------------------- C5
  {
    id: 'c5-o-que-avalia',
    scope: 'C5',
    title: 'O que a Competência V avalia',
    page: 33,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A Competência V avalia a proposta de intervenção para o problema abordado, respeitando os direitos humanos: sugerir uma iniciativa que enfrente o problema da frase temática. A proposta precisa estar relacionada ao tema e integrada ao projeto de texto, coerente com o ponto de vista e os argumentos, respondendo aos problemas abordados. Deve ser concreta, específica ao tema e consistente com o desenvolvimento (p. 33–34).',
  },
  {
    id: 'c5-elementos-da-proposta',
    scope: 'C5',
    title: 'Elementos da proposta de intervenção',
    page: 34,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Uma proposta muito bem elaborada não só propõe uma ação interventiva, mas aponta o agente social competente para executá-la (individual, familiar, comunitário, social, político, governamental), determina o meio de execução e o efeito ou a finalidade, e inclui algum outro detalhamento. Perguntas-guia: 1) O que é possível apresentar como solução? 2) Que ação deve ser tomada? 3) Quem deve executá-la? 4) Como viabilizar essa solução? 5) Qual efeito ela pode alcançar? 6) Que outra informação pode detalhar a proposta? A ação proposta é o elemento essencial. O texto é avaliado com base na composição da proposta apresentada (p. 34–35).',
  },
  {
    id: 'c5-proposta-explicita',
    scope: 'C5',
    title: 'Proposta explícita, não vaga',
    page: 35,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'A proposta deve ser explícita. Apenas constatar a falta de uma ação ou projeto ("faltam investimentos em x") não configura proposta de intervenção. Evite propostas vagas, genéricas ou incompatíveis com a discussão e estruturas que não deem certeza de que se está propondo de fato uma intervenção ("se x for feito, o resultado poderá ser y"). Exponha com clareza o desejo de intervir na realidade e contemple a situação problematizada no texto.',
  },
  {
    id: 'c5-direitos-humanos',
    scope: 'C5',
    title: 'Desrespeito aos direitos humanos',
    page: 35,
    source: 'inep-cartilha-2025',
    kind: 'criterio',
    text:
      'Propostas que desrespeitem os direitos humanos são penalizadas na Competência V — recebem nota 0 (zero) nessa competência (p. 37). São sempre contrárias aos direitos humanos: defesa de tortura, mutilação, execução sumária e qualquer forma de "justiça com as próprias mãos"; incitação à violência motivada por raça, etnia, gênero, credo, opinião política, condição física, origem geográfica ou socioeconômica; explicitação de discurso de ódio contra grupos sociais. Princípios considerados (art. 3º da Resolução CNE/CP nº 1/2012): dignidade humana; igualdade de direitos; reconhecimento e valorização das diferenças e diversidades; laicidade do Estado; democracia na educação; transversalidade, vivência e globalidade; sustentabilidade socioambiental. Em qualquer tema, desrespeitam os direitos humanos propostas que incitem à violência, em que transparece a ação de indivíduos na administração da punição (p. 35–36).',
  },
  // ---------------------------------------------------------------- critérios operacionais da Lumina
  {
    id: 'lumina-c5-contagem-de-elementos',
    scope: 'C5',
    title: 'Contagem de elementos da proposta (critério operacional da Lumina)',
    page: null,
    source: 'lumina',
    kind: 'criterio',
    text:
      'Critério operacional da Lumina, não é texto da cartilha: para tornar a Competência V reprodutível, conta-se quantos dos cinco elementos (ação, agente, meio/modo, efeito/finalidade, detalhamento) estão presentes na proposta mais completa, desde que relacionada ao tema e articulada à discussão: 5 elementos → 200; 4 → 160; 3 → 120; 2 → 80; só a ação ou proposta vaga/relacionada apenas ao assunto → 40; sem proposta ou proposta não relacionada → 0. Desrespeito aos direitos humanos zera a competência independentemente da contagem.',
  },
  {
    id: 'lumina-c1-frequencia-de-desvios',
    scope: 'C1',
    title: 'Frequência de desvios por nível (critério operacional da Lumina)',
    page: null,
    source: 'lumina',
    kind: 'criterio',
    text:
      'Critério operacional da Lumina, não é texto da cartilha: a cartilha usa termos qualitativos ("excepcionalidade", "poucos", "alguns", "muitos", "diversificados e frequentes"). Para reprodutibilidade, a Lumina lê assim, numa redação de cerca de 30 linhas e com estrutura sintática adequada: no máximo 1 desvio pontual, sem reincidência → 200; até 3 desvios → 160; até 5 → 120; de 6 a 8 ou estrutura sintática deficitária → 80; desvios diversificados e frequentes em quase todo o texto → 40. Problemas de estrutura sintática (truncamento, justaposição) pesam mais que desvios isolados de acentuação.',
  },
];

/** Trechos de 2025 sem metadados; a base os vincula ao documento arquivado. */
export const CARTA_2025_CHUNKS: KnowledgeChunkSeed[] = [...chunks, ...gradeChunks];

/** Base arquivada completa, com ids prefixados para não colidir com a vigente. */
export const ARCHIVED_KNOWLEDGE_BASE: KnowledgeChunk[] = CARTA_2025_CHUNKS.map((chunk) =>
  attachDocument({ ...chunk, id: `2025:${chunk.id}` }, CARTILHA_2025),
);

/** Compatibilidade com importações antigas: é a base de 2025, não a vigente. */
export const KNOWLEDGE_BASE = ARCHIVED_KNOWLEDGE_BASE;

export { COMPETENCY_IDS };
export const SCORE_LEVELS = [0, 40, 80, 120, 160, 200] as const;
