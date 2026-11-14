/**
 * Tipos, rótulos e regras de tela dos cadernos de fórmulas e de repertórios.
 * Sem dependências de runtime do app: testado direto no Node
 * (test/cadernos.check.ts).
 */

export type NotebookSort = 'recent' | 'oldest' | 'favorites' | 'az';
export type NotebookScope = 'mine' | 'platform' | 'all';
export type Origin = 'MANUAL' | 'AI' | 'PLATFORM_COPY';

// ------------------------------------------------------------- fórmulas

export const DISCIPLINES = ['MATEMATICA', 'FISICA', 'QUIMICA', 'BIOLOGIA', 'OUTRA'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  MATEMATICA: 'Matemática',
  FISICA: 'Física',
  QUIMICA: 'Química',
  BIOLOGIA: 'Biologia',
  OUTRA: 'Outra',
};

export interface Formula {
  id: string;
  userId: string;
  name: string;
  discipline: Discipline;
  topic: string | null;
  latex: string;
  description: string | null;
  variables: string | null;
  whenToUse: string | null;
  example: string | null;
  isFavorite: boolean;
  isMemorized: boolean;
  isPlatform: boolean;
  origin: Origin;
  platformSourceId: string | null;
  collectionIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FormulaPayload {
  name: string;
  discipline: Discipline;
  topic?: string | null;
  latex: string;
  description?: string | null;
  variables?: string | null;
  whenToUse?: string | null;
  example?: string | null;
  isFavorite?: boolean;
  isMemorized?: boolean;
  isPlatform?: boolean;
}

export interface FormulaQuery {
  q?: string;
  discipline?: Discipline;
  favorite?: boolean;
  toMemorize?: boolean;
  scope?: NotebookScope;
  collectionId?: string;
  sort?: NotebookSort;
}

export interface NotebookPlan {
  tier: 'FREE' | 'PREMIUM' | 'INSTITUTIONAL';
  itemLimit: number;
  collectionLimit: number;
}

export interface FormulaSummary {
  total: number;
  favorites: number;
  memorized: number;
  byDiscipline: { discipline: Discipline; count: number }[];
  recent: { id: string; name: string; discipline: Discipline; createdAt: string }[];
  platformAvailable: number;
  plan: NotebookPlan;
}

export type FormulaAiAction = 'explain' | 'example' | 'mnemonic';
export const FORMULA_AI_LABEL: Record<FormulaAiAction, string> = {
  explain: 'Explicar a fórmula',
  example: 'Exercício resolvido',
  mnemonic: 'Dica para memorizar',
};

// ---------------------------------------------------------- repertórios

export const REPERTOIRE_CATEGORIES = [
  'FILOSOFIA',
  'SOCIOLOGIA',
  'HISTORIA',
  'LITERATURA',
  'CINEMA_SERIES',
  'MUSICA',
  'CIENCIA_TECNOLOGIA',
  'ATUALIDADES',
  'LEGISLACAO',
  'DADOS_ESTATISTICOS',
  'PENSADORES',
  'OBRAS_ACONTECIMENTOS',
  'ARTES_CULTURA',
  'OUTRA',
] as const;
export type FixedCategory = (typeof REPERTOIRE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<FixedCategory, string> = {
  FILOSOFIA: 'Filosofia',
  SOCIOLOGIA: 'Sociologia',
  HISTORIA: 'História',
  LITERATURA: 'Literatura',
  CINEMA_SERIES: 'Cinema e séries',
  MUSICA: 'Música',
  CIENCIA_TECNOLOGIA: 'Ciência e tecnologia',
  ATUALIDADES: 'Atualidades',
  LEGISLACAO: 'Legislação',
  DADOS_ESTATISTICOS: 'Dados estatísticos',
  PENSADORES: 'Pensadores e filósofos',
  OBRAS_ACONTECIMENTOS: 'Obras e acontecimentos históricos',
  ARTES_CULTURA: 'Artes e cultura',
  OUTRA: 'Outra',
};

/** Rótulo de uma categoria fixa ou o nome da categoria própria do aluno. */
export function categoryLabel(category: string): string {
  return (CATEGORY_LABEL as Record<string, string>)[category] ?? category;
}

export function isCustomCategory(category: string): boolean {
  return !(REPERTOIRE_CATEGORIES as readonly string[]).includes(category);
}

export const REFERENCE_TYPES = ['LIVRO', 'FILME', 'SERIE', 'MUSICA', 'LEI', 'PESQUISA', 'PENSADOR', 'OBRA_DE_ARTE', 'ACONTECIMENTO', 'CONCEITO', 'OUTRO'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];
export const REFERENCE_TYPE_LABEL: Record<ReferenceType, string> = {
  LIVRO: 'Livro',
  FILME: 'Filme',
  SERIE: 'Série',
  MUSICA: 'Música',
  LEI: 'Lei ou norma',
  PESQUISA: 'Pesquisa ou dado',
  PENSADOR: 'Pensador',
  OBRA_DE_ARTE: 'Obra de arte',
  ACONTECIMENTO: 'Acontecimento',
  CONCEITO: 'Conceito',
  OUTRO: 'Outro',
};

export const REPERTOIRE_THEMES = ['TECNOLOGIA', 'MEIO_AMBIENTE', 'SAUDE', 'POLITICA', 'EDUCACAO', 'ECONOMIA', 'CULTURA', 'CIENCIA', 'DIREITOS_HUMANOS', 'OUTRO'] as const;
export type RepertoireTheme = (typeof REPERTOIRE_THEMES)[number];
export const THEME_LABEL: Record<RepertoireTheme, string> = {
  TECNOLOGIA: 'Tecnologia',
  MEIO_AMBIENTE: 'Meio ambiente',
  SAUDE: 'Saúde',
  POLITICA: 'Política',
  EDUCACAO: 'Educação',
  ECONOMIA: 'Economia',
  CULTURA: 'Cultura',
  CIENCIA: 'Ciência',
  DIREITOS_HUMANOS: 'Direitos humanos',
  OUTRO: 'Outro',
};

/** Eixos temáticos (especificação de 13/11/2026). */
export const REPERTOIRE_AXES = ['EDUCACAO', 'DESIGUALDADE', 'POLITICA_CIDADANIA', 'CULTURA_IDENTIDADE', 'TECNOLOGIA', 'MEIO_AMBIENTE', 'SAUDE', 'TRABALHO_ECONOMIA', 'DIREITOS_HUMANOS', 'MIDIA_COMPORTAMENTO'] as const;
export type RepertoireAxis = (typeof REPERTOIRE_AXES)[number];
export const AXIS_LABEL: Record<RepertoireAxis, string> = {
  EDUCACAO: 'Educação e formação social',
  DESIGUALDADE: 'Desigualdade e exclusão social',
  POLITICA_CIDADANIA: 'Política, cidadania e democracia',
  CULTURA_IDENTIDADE: 'Cultura e identidade brasileira',
  TECNOLOGIA: 'Tecnologia e sociedade',
  MEIO_AMBIENTE: 'Meio ambiente e sustentabilidade',
  SAUDE: 'Saúde pública e bem-estar',
  TRABALHO_ECONOMIA: 'Trabalho e relações econômicas',
  DIREITOS_HUMANOS: 'Direitos humanos e grupos vulneráveis',
  MIDIA_COMPORTAMENTO: 'Mídia, comunicação e comportamento social',
};

/** Mapa de aplicação argumentativa: a função do repertório no texto. */
export const ARGUMENT_FUNCTIONS = ['DESIGUALDADES_ESTRUTURAIS', 'OMISSAO_ESTATAL', 'FALHAS_EDUCACIONAIS', 'COMPORTAMENTOS_COLETIVOS', 'PROBLEMAS_HISTORICOS', 'VIOLACOES_DE_DIREITOS', 'IMPACTOS_TECNOLOGICOS', 'RELACOES_DE_PODER'] as const;
export type ArgumentFunction = (typeof ARGUMENT_FUNCTIONS)[number];
export const FUNCTION_LABEL: Record<ArgumentFunction, string> = {
  DESIGUALDADES_ESTRUTURAIS: 'Explicar desigualdades estruturais',
  OMISSAO_ESTATAL: 'Evidenciar omissão estatal',
  FALHAS_EDUCACIONAIS: 'Discutir falhas educacionais',
  COMPORTAMENTOS_COLETIVOS: 'Analisar comportamentos coletivos',
  PROBLEMAS_HISTORICOS: 'Explicar problemas históricos',
  VIOLACOES_DE_DIREITOS: 'Fundamentar violações de direitos',
  IMPACTOS_TECNOLOGICOS: 'Discutir impactos tecnológicos',
  RELACOES_DE_PODER: 'Analisar relações de poder',
};

export interface Repertoire {
  id: string;
  userId: string;
  title: string;
  summary: string;
  category: string;
  author: string | null;
  referenceType: ReferenceType;
  source: string | null;
  year: number | null;
  theme: RepertoireTheme;
  keywords: string[];
  relatedThemes: string[];
  context: string | null;
  importance: string | null;
  essayUse: string | null;
  example: string | null;
  notes: string | null;
  axes: RepertoireAxis[];
  argumentFunctions: ArgumentFunction[];
  concepts: string[];
  socialProblems: string | null;
  brazilRelation: string | null;
  exampleSlot: 'D1' | 'D2' | null;
  connections: string | null;
  pitfalls: string | null;
  quote: string | null;
  quoteSource: string | null;
  isStudied: boolean;
  isFavorite: boolean;
  isPlatform: boolean;
  origin: Origin;
  platformSourceId: string | null;
  collectionIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RepertoirePayload {
  title: string;
  summary: string;
  category?: string;
  author?: string | null;
  referenceType?: ReferenceType;
  source?: string | null;
  year?: number | null;
  theme?: RepertoireTheme;
  keywords?: string[];
  relatedThemes?: string[];
  context?: string | null;
  importance?: string | null;
  essayUse?: string | null;
  example?: string | null;
  notes?: string | null;
  axes?: RepertoireAxis[];
  argumentFunctions?: ArgumentFunction[];
  concepts?: string[];
  socialProblems?: string | null;
  brazilRelation?: string | null;
  exampleSlot?: 'D1' | 'D2' | null;
  connections?: string | null;
  pitfalls?: string | null;
  quote?: string | null;
  quoteSource?: string | null;
  isStudied?: boolean;
  isFavorite?: boolean;
  origin?: 'MANUAL' | 'AI';
  isPlatform?: boolean;
}

export interface RepertoireQuery {
  q?: string;
  category?: string;
  theme?: RepertoireTheme;
  referenceType?: ReferenceType;
  axis?: RepertoireAxis;
  argumentFunction?: ArgumentFunction;
  favorite?: boolean;
  scope?: NotebookScope;
  collectionId?: string;
  sort?: NotebookSort;
}

export interface RepertoireSummary {
  total: number;
  favorites: number;
  categoriesUsed: number;
  byCategory: { category: string; count: number }[];
  recent: { id: string; title: string; category: string; author: string | null; createdAt: string }[];
  platformAvailable: number;
  byAxis?: Partial<Record<RepertoireAxis, number>>;
  byFunction?: Partial<Record<ArgumentFunction, number>>;
  plan: NotebookPlan;
}

export interface NotebookCollection {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
}

export interface RepertoireSuggestion {
  title: string;
  author: string | null;
  category: string;
  referenceType: ReferenceType;
  context: string;
  relation: string;
  howToArgue: string;
  example: string;
  verify: string | null;
}

export type CheckVerdict = 'PERTINENTE' | 'SUPERFICIAL' | 'FORCADO' | 'DESCONTEXTUALIZADO';
export const VERDICT_LABEL: Record<CheckVerdict, string> = {
  PERTINENTE: 'Pertinente ao tema',
  SUPERFICIAL: 'Uso superficial',
  FORCADO: 'Relação forçada',
  DESCONTEXTUALIZADO: 'Fora de contexto',
};

export type RepertoireAiAction = 'suggest' | 'explain' | 'howToUse' | 'connections' | 'check' | 'apply' | 'analyzeUse';
export interface RepertoireAiResult {
  action: RepertoireAiAction;
  disclaimer: string;
  text?: string;
  suggestions?: RepertoireSuggestion[];
  check?: { verdict: CheckVerdict; explanation: string; tips: string[] };
  application?: RepertoireApplication;
  analysis?: UseAnalysis;
}

export interface RepertoireApplication {
  relevance: 'ALTA' | 'MEDIA' | 'BAIXA';
  defends: string;
  problem: string;
  relation: string;
  thesis: string;
  develop: string;
  paragraph: string;
}

export type UseVerdict = 'PRODUTIVO' | 'SUPERFICIAL' | 'DECORATIVO' | 'FORCADO' | 'INCORRETO' | 'SEM_REPERTORIO';
export const USE_VERDICT_LABEL: Record<UseVerdict, string> = {
  PRODUTIVO: 'Uso produtivo',
  SUPERFICIAL: 'Uso superficial',
  DECORATIVO: 'Uso decorativo (repertório de bolso)',
  FORCADO: 'Relação forçada com o tema',
  INCORRETO: 'Atribuição a conferir',
  SEM_REPERTORIO: 'Sem repertório',
};

export interface UseAnalysis {
  verdict: UseVerdict;
  repertoire: string | null;
  excerpt: string | null;
  explanation: string;
  tips: string[];
}

export const SORT_LABEL: Record<NotebookSort, string> = {
  recent: 'Mais recentes',
  oldest: 'Mais antigos',
  favorites: 'Favoritos primeiro',
  az: 'A–Z',
};

// -------------------------------------------------------------- regras

/** Seções do detalhe na ordem da especificação de 13/11/2026 (vazias somem). */
export function repertoireSections(r: Repertoire): { title: string; body: string }[] {
  const identification = [
    r.author ? `Autor/responsável: ${r.author}` : null,
    `Tipo: ${REFERENCE_TYPE_LABEL[r.referenceType] ?? r.referenceType}`,
    `Categoria: ${categoryLabel(r.category)}`,
    r.year !== null ? `Ano: ${r.year < 0 ? `${-r.year} a.C.` : r.year}` : null,
    r.axes?.length ? `Eixos: ${r.axes.map((a) => AXIS_LABEL[a] ?? a).join(' · ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const sections: { title: string; body: string | null }[] = [
    { title: '1. Autor, obra ou documento', body: identification },
    { title: '2. Contexto histórico e social', body: r.context },
    { title: '3. Ideia central', body: r.summary },
    { title: '4. Conceitos fundamentais', body: r.concepts?.length ? r.concepts.join(' · ') : null },
    { title: '5. Problemas sociais que ajuda a explicar', body: r.socialProblems },
    { title: '6. Relação com a realidade brasileira', body: r.brazilRelation },
    { title: '7. Temas de redação', body: r.relatedThemes.length ? r.relatedThemes.join(' · ') : null },
    { title: `8. Exemplo de aplicação${r.exampleSlot ? ` (${r.exampleSlot})` : ''}`, body: r.example },
    { title: '9. Conexões com outros repertórios', body: r.connections },
    { title: '10. Cuidados para não usar de forma decorativa', body: r.pitfalls },
    { title: 'Como usar na redação', body: r.essayUse },
    { title: 'Função na argumentação', body: r.argumentFunctions?.length ? r.argumentFunctions.map((f) => FUNCTION_LABEL[f] ?? f).join(' · ') : null },
    { title: 'Importância sociocultural', body: r.importance },
    { title: 'Fonte', body: r.source },
    { title: 'Minhas anotações', body: r.notes },
  ];
  return sections.filter((x): x is { title: string; body: string } => !!x.body && x.body.trim().length > 0);
}

/**
 * Guia de aplicação prática (seção 6): as 5 perguntas, respondidas com o que
 * o repertório já registra. Pergunta sem resposta no registro fica marcada
 * para o aluno completar (ou pedir à LuminIA com o tema dele).
 */
export function practiceGuide(r: Pick<Repertoire, 'summary' | 'socialProblems' | 'relatedThemes' | 'brazilRelation' | 'essayUse' | 'example' | 'pitfalls'>): { question: string; answer: string | null }[] {
  return [
    { question: 'O que esse repertório defende?', answer: r.summary || null },
    { question: 'Qual problema social ele ajuda a explicar?', answer: r.socialProblems },
    { question: 'Como posso relacioná-lo ao tema?', answer: [r.relatedThemes.length ? `Temas: ${r.relatedThemes.join(', ')}.` : '', r.brazilRelation ?? ''].join(' ').trim() || null },
    { question: 'Como posso usá-lo para sustentar minha tese?', answer: r.essayUse },
    { question: 'Como desenvolvê-lo sem apenas mencioná-lo?', answer: [r.example ?? '', r.pitfalls ? `Cuidado: ${r.pitfalls}` : ''].join('\n\n').trim() || null },
  ];
}

/** Repertórios agrupados pela função argumentativa (mapa de aplicação). */
export function byArgumentFunction<T extends Pick<Repertoire, 'argumentFunctions'>>(items: T[]): { fn: ArgumentFunction; items: T[] }[] {
  return ARGUMENT_FUNCTIONS.map((fn) => ({ fn, items: items.filter((item) => item.argumentFunctions?.includes(fn)) }));
}

/** O que falta para o repertório ficar completo (o cadastro mínimo já é garantido pelo servidor). */
export function missingRepertoireFields(r: Pick<Repertoire, 'author' | 'context' | 'essayUse' | 'example' | 'source'> & Partial<Pick<Repertoire, 'socialProblems' | 'brazilRelation' | 'pitfalls'>>): string[] {
  const missing: string[] = [];
  if (!r.author) missing.push('autor ou responsável');
  if (!r.context) missing.push('contexto');
  if (!r.socialProblems) missing.push('problemas que explica');
  if (!r.brazilRelation) missing.push('relação com o Brasil');
  if (!r.example) missing.push('exemplo de uso');
  if (!r.pitfalls) missing.push('cuidados de uso');
  if (!r.source) missing.push('fonte');
  return missing;
}

/** Texto para copiar ou inserir na redação: o exemplo pronto, ou uma menção com autor. */
export function repertoireInsertText(r: Pick<Repertoire, 'title' | 'author' | 'example'>): string {
  if (r.example?.trim()) return r.example.trim();
  return r.author ? `Segundo ${r.author}, em "${r.title}", ` : `Como mostra "${r.title}", `;
}

/** Texto completo para copiar o repertório. */
export function repertoireCopyText(r: Repertoire): string {
  return [r.title, ...repertoireSections(r).map((s) => `${s.title}:\n${s.body}`)].join('\n\n');
}

/** Converte a sugestão revisada da LuminIA em repertório do caderno (origem AI). */
export function suggestionToPayload(s: RepertoireSuggestion, theme: string): RepertoirePayload {
  return {
    title: s.title,
    author: s.author,
    category: s.category,
    referenceType: s.referenceType,
    summary: s.relation.length >= 10 ? s.relation : `${s.relation} — ${s.context}`.slice(0, 5000),
    context: s.context || null,
    essayUse: s.howToArgue || null,
    example: s.example || null,
    relatedThemes: [theme],
    notes: s.verify ? `Conferir: ${s.verify}` : null,
    origin: 'AI',
  };
}

/** "12 de 20" no Gratuito; "12" no Premium. */
export function usageLabel(total: number, plan: NotebookPlan): string {
  return plan.tier === 'FREE' ? `${total} de ${plan.itemLimit}` : String(total);
}

export function atItemLimit(total: number, plan: NotebookPlan): boolean {
  return plan.tier === 'FREE' && total >= plan.itemLimit;
}

/** Monta a query string sem campos vazios. */
export function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

// ------------------------------------------------- texto da LuminIA

export type AiBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

/** Quebra o Markdown simples da LuminIA em blocos (títulos, parágrafos, listas). */
export function parseAiBlocks(raw: string): AiBlock[] {
  const blocks: AiBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (!trimmed) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const item = (bullet ?? numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
    } else {
      paragraph.push(trimmed);
    }
  }
  flush();
  return blocks;
}

/** Separa **negrito** do texto comum (o resto do Markdown vira texto). */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part.replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/(\S)[*_](\s|$)/g, '$1$2'), bold: false }));
}

/** Parágrafo onde está o cursor (separado por linha em branco ou quebra de linha). */
export function paragraphAt(text: string, index: number): string {
  if (!text.trim()) return '';
  const at = Math.max(0, Math.min(index, text.length));
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const endBreak = text.indexOf('\n', at);
  const paragraph = text.slice(start, endBreak === -1 ? text.length : endBreak).trim();
  // Cursor numa linha em branco: usa o parágrafo anterior.
  return paragraph || text.slice(0, start).trim().split(/\n+/).pop()?.trim() || '';
}
