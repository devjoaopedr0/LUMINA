/**
 * Base de conhecimento vigente da correção (cartilha 2026 + manuais oficiais).
 *
 * A cartilha de 2026 foi publicada on-line em setembro de 2026. Os descritores
 * das cinco competências são os mesmos da edição de 2025; o que mudou foram os
 * exemplos e o tema usado para ilustrar fuga/tangenciamento (Enem 2025:
 * "Perspectivas acerca do envelhecimento na sociedade brasileira"). Por isso,
 * os trechos de C1/C3/C5 e as regras gerais foram migrados com as páginas da
 * edição de 2026, enquanto C2 e C4 receberam trechos novos, transcritos da
 * cartilha vigente e dos manuais oficiais de correção do Inep.
 *
 * A edição de 2025 continua em `inep-cartilha-2025.ts`, arquivada e acessível
 * apenas por consulta explícita à versão.
 */
import { attachDocument, CompetencyId, KnowledgeChunk, KnowledgeChunkSeed } from './types';
import { CARTA_2025_CHUNKS, COMPETENCY_GRID as GRID_2025 } from './inep-cartilha-2025';
import { CARTILHA_2026, LUMINA_OPERATIONAL, MANUAL_C2_2019, MANUAL_C4_2019 } from './documents';

/** Grade vigente: mesmos descritores, páginas da cartilha de 2026. */
export const COMPETENCY_GRID: Record<CompetencyId, { name: string; page: number; levels: Record<0 | 40 | 80 | 120 | 160 | 200, string> }> = {
  C1: { ...GRID_2025.C1, page: 14 },
  C2: { ...GRID_2025.C2, page: 27 },
  C3: { ...GRID_2025.C3, page: 31 },
  C4: { ...GRID_2025.C4, page: 34 },
  C5: { ...GRID_2025.C5, page: 38 },
};

/**
 * Páginas dos trechos de C1/C3/C5/gerais na edição de 2026. O texto é o mesmo
 * da edição anterior; o número da página foi conferido no PDF de 2026.
 */
const PAGE_2026: Record<string, number> = {
  'geral-o-que-a-prova-exige': 5,
  'geral-como-e-atribuida-a-nota': 6,
  'geral-discrepancia': 6,
  'geral-nota-zero': 7,
  'geral-copia': 8,
  'geral-letra-ilegivel': 8,
  'geral-partes-desconectadas': 8,
  'geral-titulo': 9,
  'c1-o-que-avalia': 12,
  'c1-estrutura-sintatica': 13,
  'c1-tipos-de-desvio': 13,
  'c3-o-que-avalia': 28,
  'c3-projeto-de-texto': 29,
  'c3-desenvolvimento': 29,
  'c3-recomendacoes': 30,
  'c5-o-que-avalia': 35,
  'c5-elementos-da-proposta': 36,
  'c5-proposta-explicita': 36,
  'c5-direitos-humanos': 37,
};

const C2_C4_SEEDS: KnowledgeChunkSeed[] = [
  // ------------------------------------------------------------------ C2
  {
    id: 'c2-o-que-avalia',
    scope: 'C2',
    title: 'O que a Competência II avalia',
    page: 14,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'A Competência II avalia a compreensão da proposta: um tema específico desenvolvido na forma de texto dissertativo-argumentativo, em que, por meio de argumentação, se defende um ponto de vista. É mais do que exposição de ideias — texto apenas expositivo não atende; é preciso assumir claramente um ponto de vista relacionado ao tema da proposta. A competência integra habilidades de leitura e de escrita.',
  },
  {
    id: 'c2-tema-e-recorte',
    scope: 'C2',
    title: 'Tema, recorte temático e fuga',
    page: 15,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'O tema constitui o núcleo das ideias sobre as quais o ponto de vista se organiza e é uma delimitação de um assunto mais abrangente. É preciso atender ao recorte temático definido para evitar tangenciá-lo (abordar parcialmente o tema) ou, ainda pior, desenvolver um tema distinto do determinado pela proposta.',
  },
  {
    id: 'c2-repertorio-sociocultural',
    scope: 'C2',
    title: 'Repertório sociocultural: legitimidade, pertinência e produtividade',
    page: 16,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Repertório sociocultural é uma informação, um fato, uma citação ou uma experiência vivida que esteja relacionada ao tema e contribua como argumento para a discussão. A cartilha de 2026 exige que o repertório seja legitimamente relacionado ao tema: pertinente ao assunto, bem contextualizado e articulado com os argumentos, mostrando que o participante sabe relacionar o conhecimento ao problema discutido. Informações e citações soltas, por mais variadas e interessantes, perdem relevância quando não associadas produtivamente à defesa do ponto de vista. A legitimação pode vir de diferentes áreas do conhecimento.',
  },
  {
    id: 'c2-repertorio-de-bolso',
    scope: 'C2',
    title: 'Repertório de bolso',
    page: 16,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      '"Repertório de bolso" são referências prontas, memorizadas e usadas de forma genérica e pouco aprofundada, sem conexão genuína com o tema — um repertório "guardado no bolso" para qualquer tema. A cartilha de 2026 exemplifica com Platão em A República e com Aristóteles ("o homem é um animal político") no tema do envelhecimento: a referência é legitimada, mas a relação com o recorte é superficial ou forçada e poderia ser retirada sem prejuízo da argumentação. Se o repertório é inserido de forma decorada, automática ou forçada, pode ser avaliado como não produtivo, o que prejudica a Competência II. Citar autor ou obra não garante, por si só, nota alta.',
  },
  {
    id: 'c2-repertorio-produtivo',
    scope: 'C2',
    title: 'Como usar repertório de forma produtiva',
    page: 19,
    source: 'inep-cartilha-2026',
    kind: 'exemplo',
    text:
      'Para evitar o repertório de bolso: escolher referências específicas que tenham relação real com o tema; articular o repertório às ideias que defendem o ponto de vista; mostrar que se entende o conteúdo citado e que ele fortalece a tese. Nos exemplos produtivos da cartilha de 2026, a Constituição Federal de 1988 é usada como marco histórico para explicar a responsabilidade do Estado; Memórias Póstumas de Brás Cubas é interpretada para iluminar o etarismo contemporâneo; o filme A Substância é relacionado à pressão midiática por juventude. Em todos, o repertório é legitimado, pertinente e interpretado, e não apenas mencionado.',
  },
  {
    id: 'c2-fuga-ao-tema',
    scope: 'C2',
    title: 'O que é fuga total ao tema',
    page: 25,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Há fuga ao tema quando nem o assunto mais amplo nem o tema específico proposto são desenvolvidos. No Enem 2025, o tema foi "Perspectivas acerca do envelhecimento na sociedade brasileira" e foi considerado completo quando abordou perspectivas + envelhecimento + sociedade brasileira. Foi considerada fuga a redação que abordou exclusivamente qualquer outro tema ou assunto, ou outras questões relacionadas à sociedade brasileira sem relação com o envelhecimento.',
  },
  {
    id: 'c2-tangenciamento',
    scope: 'C2',
    title: 'O que é tangenciar o tema',
    page: 25,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Tangenciamento é uma abordagem parcial baseada somente no assunto mais amplo a que o tema está vinculado. No Enem 2025, tangenciou quem abordou exclusivamente o envelhecimento considerando especificidades de contexto não brasileiro ou como experiência universal/processo biológico inevitável. Pela Matriz de Referência, o tangenciamento, avaliado na Competência II, afeta também as Competências III e V, impedindo nota acima de 40 pontos em todas essas competências.',
  },
  {
    id: 'c2-tipo-textual',
    scope: 'C2',
    title: 'Não atender ao tipo dissertativo-argumentativo',
    page: 26,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Não atende ao tipo textual a redação com predominância de características de outro tipo, como o narrativo ou o descritivo; ela recebe nota 0 (zero), mesmo que atenda aos outros critérios. Texto dissertativo-argumentativo organiza-se na defesa de um ponto de vista, fundamentado com argumentos para convencer o leitor: é argumentativo porque defende uma opinião e dissertativo porque usa explicações para justificá-la. Redações predominantemente dissertativo-argumentativas com muitas características de outro tipo não zeram, mas são penalizadas na Competência II. Trechos pontuais narrando acontecimentos que justificam o ponto de vista são aceitos; reduzir o texto a narração, poema ou depoimento pessoal não (p. 26–27).',
  },
  {
    id: 'lumina-c2-leitura-global',
    scope: 'C2',
    title: 'Leitura global do tema (critério operacional da Lumina)',
    page: null,
    source: 'lumina',
    kind: 'criterio',
    text:
      'Critério operacional da Lumina, não é texto do Inep: a cobertura lexical do tema é apenas um sinal auxiliar. Fuga ao tema e tangenciamento só podem ser concluídos pela leitura global do texto, considerando sinônimos, paráfrases, retomadas, exemplos e o recorte efetivamente desenvolvido. Nunca classifique fuga ou tangenciamento apenas porque faltam palavras idênticas ao tema, e não anule na dúvida.',
  },
  // Manuais oficiais de correção — aprofundamento da C2.
  {
    id: 'c2-manual-grade-especifica',
    scope: 'C2',
    title: 'Grade específica da Competência II (manual oficial)',
    page: 7,
    source: 'inep-manual-c2-2019',
    kind: 'criterio',
    text:
      'O manual oficial da Competência II combina dois critérios: desenvolvimento do tema e domínio do tipo dissertativo-argumentativo. No nível máximo, o texto desenvolve o tema de forma completa, com repertório legitimado, pertinente e produtivo, e apresenta excelente domínio da estrutura. Nos níveis intermediários, a nota cai quando o tema é abordado de forma parcial, quando o repertório é apenas legitimado mas não pertinente, quando é baseado nos textos motivadores ou não é legitimado, ou quando a estrutura dissertativo-argumentativa é insuficiente.',
  },
  {
    id: 'c2-manual-tema-tangencia',
    scope: 'C2',
    title: 'Tema completo, tangenciamento e fuga (manual oficial)',
    page: 23,
    source: 'inep-manual-c2-2019',
    kind: 'criterio',
    text:
      'O manual oficial distingue: tema completo (todos os elementos do recorte são desenvolvidos), tangenciamento (apenas o assunto mais amplo é abordado) e fuga (nem o assunto amplo nem o tema específico são desenvolvidos). A avaliação considera o desenvolvimento dos elementos do tema, não a repetição literal de uma palavra: no Exemplo 4, o manual reconhece "algoritmos" como sinônimo direto de "controle de dados". Também mostra que a simples menção a um elemento do tema não garante o desenvolvimento do recorte.',
  },
  {
    id: 'c2-manual-repertorio',
    scope: 'C2',
    title: 'Legitimidade, pertinência e produtividade do repertório (manual oficial)',
    page: 19,
    source: 'inep-manual-c2-2019',
    kind: 'criterio',
    text:
      'O manual oficial avalia o repertório em três planos articulados: legitimidade (reconhecimento pelas áreas do Conhecimento), pertinência (relação com o tema e com o recorte) e produtividade (uso do repertório para fundamentar, explicar ou aprofundar o ponto de vista). Repertório legitimado, mas não pertinente, não sustenta a argumentação; repertório pertinente, mas apenas citado, tem produtividade baixa. O manual considera informações, fatos, citações ou experiências vividas legitimados pelas áreas do Conhecimento, e a pertinência pode estar na referência direta ou no uso produtivo do repertório.',
  },
  {
    id: 'c2-manual-tipo-textual',
    scope: 'C2',
    title: 'Tipo textual e limites estruturais (manual oficial)',
    page: 8,
    source: 'inep-manual-c2-2019',
    kind: 'criterio',
    text:
      'O manual oficial explica que, em avaliação em larga escala, a avaliação do tipo textual é centralizada na verificação da proporcionalidade das partes da estrutura dissertativo-argumentativa: introdução, argumentação e conclusão. Também distingue "traços constantes de outros tipos textuais" de predominância: não existe quantidade precisa de linhas que determine traços; é preciso analisar a recorrência no conjunto. A predominância de outro tipo textual leva à nota zero, conforme a cartilha.',
  },

  // ------------------------------------------------------------------ C4
  {
    id: 'c4-o-que-avalia',
    scope: 'C4',
    title: 'O que a Competência IV avalia',
    page: 31,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'A Competência IV avalia a estruturação lógica e formal entre as partes da redação: frases e parágrafos devem estabelecer relação que garanta sequenciação coerente e interdependência entre as ideias. Isso se faz com recursos coesivos, em especial operadores argumentativos, que constroem relações de igualdade (assim como, outrossim), adversidade (entretanto, porém), causa e consequência (por isso, assim), conclusão (enfim, portanto); preposições, conjunções, advérbios e locuções adverbiais; e pronomes e expressões referenciais (p. 31–32).',
  },
  {
    id: 'c4-diferenca-c3',
    scope: 'C4',
    title: 'Diferença entre Competência III e IV',
    page: 32,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'As Competências III e IV consideram a construção da argumentação, mas avaliam aspectos diferentes: a III avalia a estrutura mais profunda do texto (selecionar, relacionar, organizar e interpretar argumentos); a IV avalia a superfície textual, isto é, as marcas linguísticas que levam o leitor à compreensão — o encadeamento entre parágrafos e dentro deles. Problemas de coerência global ou de progressão argumentativa são da C3; problemas de articulação linguística e referenciação são da C4.',
  },
  {
    id: 'c4-principios-de-coesao',
    scope: 'C4',
    title: 'Princípios de coesão',
    page: 32,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Estruturação dos parágrafos: um parágrafo é uma unidade formada por uma ideia principal à qual se ligam secundárias; pode ser desenvolvido por comparação, causa-consequência, exemplificação, detalhamento; deve haver articulação entre um parágrafo e outro. Estruturação dos períodos: no texto dissertativo-argumentativo, normalmente complexos, com duas ou mais orações, expressando causa/consequência, contradição, temporalidade, comparação, conclusão. Referenciação: pessoas, coisas, lugares e fatos são apresentados e retomados por pronomes, advérbios, artigos, sinônimos, antônimos, hipônimos, hiperônimos e expressões resumitivas, metafóricas ou metadiscursivas (p. 32–33).',
  },
  {
    id: 'c4-referenciacao',
    scope: 'C4',
    title: 'Referenciação e retomadas',
    page: 33,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'A referenciação ocorre quando pessoas, coisas, lugares e fatos são apresentados e, depois, retomados à medida que o texto progride, por pronomes, advérbios, artigos, sinônimos, antônimos, hipônimos, hiperônimos e expressões resumitivas, metafóricas ou metadiscursivas. A cartilha recomenda substituir termos por pronomes pessoais, possessivos e demonstrativos, advérbios de localização e artigos; substituir por sinônimos, hipônimos, hiperônimos ou expressões resumitivas; retomar por conectivos ou expressões; e usar elipse de elementos já citados ou facilmente identificáveis.',
  },
  {
    id: 'c4-o-que-evitar',
    scope: 'C4',
    title: 'O que evitar na coesão',
    page: 34,
    source: 'inep-cartilha-2026',
    kind: 'criterio',
    text:
      'Evite: ausência de articulação entre orações, frases e parágrafos; ausência de paragrafação (texto em um único parágrafo); conector que não estabeleça relação lógica entre os trechos e prejudique a compreensão; repetição ou substituição inadequada de palavras sem usar os recursos da língua. A cartilha alerta expressamente: não use elementos coesivos de forma artificial ou excessiva; boa coesão não depende da mera presença de conectivos, muito menos de grande quantidade — é preciso que estabeleçam relações lógicas adequadas. Estratégias recomendadas: substituição por pronomes, advérbios, artigos, sinônimos, hipônimos, hiperônimos, expressões resumitivas e elipse.',
  },
  {
    id: 'c4-repeticao-oficial',
    scope: 'C4',
    title: 'Repetição não é falha automática (manual oficial)',
    page: 22,
    source: 'inep-manual-c4-2019',
    kind: 'criterio',
    text:
      'O manual oficial da Competência IV afirma que a repetição de palavras é um fenômeno esperado na língua e não deve, por si só, rebaixar a nota. A repetição pode ser temática, referencial ou necessária para manter a clareza. A repetição se torna problemática quando reduz a diversidade do repertório coesivo ou prejudica a progressão e a compreensão, não pela ocorrência isolada de um termo. Não existe limite numérico de repetições que determine automaticamente um nível.',
  },
  {
    id: 'c4-inadequacao-oficial',
    scope: 'C4',
    title: 'Conectivo inadequado (manual oficial)',
    page: 26,
    source: 'inep-manual-c4-2019',
    kind: 'criterio',
    text:
      'O manual oficial alerta que o uso de muitos conectivos não garante boa coesão. Um conectivo é inadequado quando não estabelece a relação semântica pretendida: por exemplo, "portanto" (conclusivo) usado com função adversativa, ou "onde" sem função locativa. O avaliador deve verificar a relação lógica efetiva entre os trechos, e não contar conectivos.',
  },
  {
    id: 'c4-referencial-oficial',
    scope: 'C4',
    title: 'Coesão referencial e sequencial (manual oficial)',
    page: 8,
    source: 'inep-manual-c4-2019',
    kind: 'criterio',
    text:
      'O manual oficial organiza a coesão em referencial e sequencial. A referencial retoma pessoas, objetos, fatos e lugares por formas gramaticais (pronomes, advérbios, verbos, artigos, numerais, elipse) e lexicais (sinônimos, hiperônimos, nomes genéricos, nominalizações). A sequencial pode ser parafrástica (repetição de termos, estrutura sintática, conteúdo semântico ou recursos fonológicos) ou frástica (manutenção temática, encadeamento por justaposição ou por conexão). O manual exemplifica a repetição de termos como recurso coesivo comum na poesia, mas ressalva que esse recurso é indesejável em textos dissertativo-argumentativos; por isso, a repetição deve ser avaliada no conjunto, não contada isoladamente.',
  },
  {
    id: 'lumina-c4-coesao-global',
    scope: 'C4',
    title: 'Coesão global, não contagem (critério operacional da Lumina)',
    page: null,
    source: 'lumina',
    kind: 'criterio',
    text:
      'Critério operacional da Lumina, não é texto do Inep: a contagem de conectivos, de parágrafos com conectivo inicial e de palavras repetidas é apenas sinal auxiliar. A nota da Competência IV depende da qualidade das relações semânticas, da referenciação e da articulação explícita ou implícita ao longo do texto. Não penalize automaticamente poucos conectivos, ausência de conectivo no início de parágrafo ou repetição temática; só aponte problema quando houver prejuízo real à compreensão ou à progressão.',
  },
];

const gradeChunks: KnowledgeChunkSeed[] = (Object.keys(COMPETENCY_GRID) as CompetencyId[]).map((id) => {
  const grid = COMPETENCY_GRID[id];
  const lines = ([200, 160, 120, 80, 40, 0] as const).map((score) => `${score} pontos: ${grid.levels[score]}`);
  return {
    id: `${id.toLowerCase()}-niveis`,
    scope: id,
    title: `Níveis de desempenho da Competência ${id.slice(1)}`,
    text: `Competência ${id.slice(1)} — ${grid.name}\n${lines.join('\n')}`,
    page: grid.page,
    source: 'inep-cartilha-2026',
    kind: 'grade',
  };
});

function documentFor(seed: KnowledgeChunkSeed) {
  switch (seed.source) {
    case 'lumina':
      return LUMINA_OPERATIONAL;
    case 'inep-manual-c2-2019':
      return MANUAL_C2_2019;
    case 'inep-manual-c4-2019':
      return MANUAL_C4_2019;
    default:
      return CARTILHA_2026;
  }
}

/**
 * C1/C3/C5 e regras gerais: mesmo texto da edição de 2025, com a página da
 * edição de 2026. C2/C4 vêm dos trechos novos acima. Critérios da Lumina
 * mantêm a fonte interna.
 */
const migratedSeeds: KnowledgeChunkSeed[] = CARTA_2025_CHUNKS.filter((seed) => seed.scope !== 'C2' && seed.scope !== 'C4')
  .filter((seed) => !seed.id.endsWith('-niveis'))
  .map((seed) => {
    if (seed.source === 'lumina') return seed;
    return {
      ...seed,
      page: PAGE_2026[seed.id] ?? seed.page,
      source: 'inep-cartilha-2026',
    };
  });

export const CURRENT_KNOWLEDGE_BASE: KnowledgeChunk[] = [...migratedSeeds, ...C2_C4_SEEDS, ...gradeChunks].map((seed) =>
  attachDocument(seed, documentFor(seed)),
);
