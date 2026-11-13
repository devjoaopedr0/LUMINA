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

export type RepertoireAiAction = 'suggest' | 'explain' | 'howToUse' | 'connections' | 'check';
export interface RepertoireAiResult {
  action: RepertoireAiAction;
  disclaimer: string;
  text?: string;
  suggestions?: RepertoireSuggestion[];
  check?: { verdict: CheckVerdict; explanation: string; tips: string[] };
}

export const SORT_LABEL: Record<NotebookSort, string> = {
  recent: 'Mais recentes',
  oldest: 'Mais antigos',
  favorites: 'Favoritos primeiro',
  az: 'A–Z',
};

// -------------------------------------------------------------- regras

/** Seções do detalhe do repertório, na ordem da especificação (vazias somem). */
export function repertoireSections(r: Repertoire): { title: string; body: string }[] {
  const identification = [
    r.author ? `Autor/responsável: ${r.author}` : null,
    `Tipo: ${REFERENCE_TYPE_LABEL[r.referenceType] ?? r.referenceType}`,
    `Categoria: ${categoryLabel(r.category)}`,
    r.year !== null ? `Ano: ${r.year < 0 ? `${-r.year} a.C.` : r.year}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const sections: { title: string; body: string | null }[] = [
    { title: 'Identificação', body: identification },
    { title: 'Contexto', body: r.context },
    { title: 'Conceito', body: r.summary },
    { title: 'Importância sociocultural', body: r.importance },
    { title: 'Como usar na redação', body: r.essayUse },
    { title: 'Temas relacionados', body: r.relatedThemes.length ? r.relatedThemes.join(' · ') : null },
    { title: 'Exemplo de uso argumentativo', body: r.example },
    { title: 'Fonte', body: r.source },
    { title: 'Minhas anotações', body: r.notes },
  ];
  return sections.filter((s): s is { title: string; body: string } => !!s.body && s.body.trim().length > 0);
}

/** O que falta para o repertório ficar completo (o cadastro mínimo já é garantido pelo servidor). */
export function missingRepertoireFields(r: Pick<Repertoire, 'author' | 'context' | 'essayUse' | 'example' | 'source'>): string[] {
  const missing: string[] = [];
  if (!r.author) missing.push('autor ou responsável');
  if (!r.context) missing.push('contexto');
  if (!r.essayUse) missing.push('como usar na redação');
  if (!r.example) missing.push('exemplo de uso');
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
