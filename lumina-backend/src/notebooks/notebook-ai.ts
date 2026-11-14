/**
 * LuminIA nos cadernos de repertórios e de fórmulas: prompts e leitura das
 * respostas. Funções puras (testáveis sem IA).
 *
 * Regra central da especificação: a IA não inventa autores, obras, citações,
 * estatísticas ou acontecimentos. Quando não puder confirmar um detalhe, ela
 * diz o que o aluno precisa conferir em vez de afirmar. Toda sugestão chega
 * marcada como "a conferir" e só entra no caderno depois que o aluno revisa.
 */
import { extractJson } from '../essay-correction/grading/essay-grader';
import { REFERENCE_TYPES, REPERTOIRE_CATEGORIES } from './notebooks.dto';

export const PROMPT_VERSION = 'cadernos-v2';

const HONESTY_RULES = `Regras obrigatórias:
- Cite apenas autores, obras, leis, pesquisas e acontecimentos amplamente conhecidos e verificáveis.
- Nunca invente citação literal, número, porcentagem, data, título ou nome. Prefira paráfrase a frase entre aspas.
- Se não tiver certeza de um detalhe (ano, dado, edição), omita o detalhe e diga o que o aluno deve conferir.
- Escreva em português do Brasil, de forma didática, para um aluno que se prepara para o ENEM.`;

export const REPERTOIRE_SYSTEM = `Você é a LuminIA, que ajuda alunos a usar repertório sociocultural na redação do ENEM (competência 2: repertório legitimado, pertinente ao tema e usado de forma produtiva).
${HONESTY_RULES}`;

export const FORMULA_SYSTEM = `Você é a LuminIA, que ajuda alunos do ENEM a entender e memorizar fórmulas de Matemática e Ciências da Natureza.
${HONESTY_RULES}
- Use exatamente a fórmula fornecida. Se ela parecer errada ou incompleta, avise antes de explicar.`;

export interface RepertoireForPrompt {
  title: string;
  author: string | null;
  category: string;
  summary: string;
  context: string | null;
  essayUse: string | null;
  concepts?: string[];
  socialProblems?: string | null;
  brazilRelation?: string | null;
}

function describe(r: RepertoireForPrompt): string {
  return [
    `Título: ${r.title}`,
    r.author ? `Autor/responsável: ${r.author}` : null,
    `Categoria: ${r.category}`,
    `Explicação registrada pelo aluno: ${r.summary}`,
    r.context ? `Contexto registrado: ${r.context}` : null,
    r.essayUse ? `Uso na redação registrado: ${r.essayUse}` : null,
    r.concepts?.length ? `Conceitos fundamentais: ${r.concepts.join(', ')}` : null,
    r.socialProblems ? `Problemas sociais que ajuda a explicar: ${r.socialProblems}` : null,
    r.brazilRelation ? `Relação com a realidade brasileira: ${r.brazilRelation}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function suggestPrompt(theme: string): string {
  return `Tema de redação: "${theme}"

Sugira de 3 a 5 repertórios socioculturais pertinentes a esse tema. Responda SOMENTE com JSON neste formato:
{"suggestions":[{"title":"...","author":"... ou null","category":"uma de ${REPERTOIRE_CATEGORIES.join('|')}","referenceType":"uma de ${REFERENCE_TYPES.join('|')}","context":"contexto histórico/social em 1-2 frases","relation":"relação com o tema","howToArgue":"como argumentar com ele","example":"um trecho de exemplo de uso argumentativo, sem citação literal inventada","verify":"o que o aluno deve conferir antes de usar (ou null)"}]}`;
}

export function explainPrompt(r: RepertoireForPrompt): string {
  return `${describe(r)}

Explique esse repertório em linguagem didática, em até 3 parágrafos curtos: o que é, o contexto e por que ele é relevante socialmente. Se algo registrado pelo aluno parecer impreciso, aponte com cuidado.`;
}

export function howToUsePrompt(r: RepertoireForPrompt, part: 'INTRODUCAO' | 'DESENVOLVIMENTO'): string {
  const where = part === 'INTRODUCAO' ? 'na introdução (contextualização do tema)' : 'em um parágrafo de desenvolvimento (fundamentando um argumento)';
  return `${describe(r)}

Mostre como usar esse repertório ${where}. Dê: 1) a estratégia em 2-3 frases; 2) um exemplo de trecho com 2-4 frases; 3) um erro comum a evitar (uso superficial ou "de bolso").`;
}

export function connectionsPrompt(items: RepertoireForPrompt[]): string {
  return `${items.map((r, i) => `Repertório ${i + 1}\n${describe(r)}`).join('\n\n')}

Explique as conexões entre esses repertórios: ideias em comum, contrastes e como combiná-los numa mesma redação sem soar forçado. Seja objetivo (até 3 parágrafos).`;
}

export function checkPrompt(r: RepertoireForPrompt, theme: string): string {
  return `${describe(r)}

Tema da redação: "${theme}"

Avalie a pertinência desse repertório ao tema. Responda SOMENTE com JSON:
{"verdict":"PERTINENTE|SUPERFICIAL|FORCADO|DESCONTEXTUALIZADO","explanation":"por que, em 2-4 frases","tips":["como tornar o uso produtivo", "..."]}`;
}

/** As 5 perguntas de aplicação (especificação, seção 6) para um tema. */
export function applyPrompt(r: RepertoireForPrompt, theme: string): string {
  return `${describe(r)}

Tema da redação: "${theme}"

Ajude o aluno a aplicar esse repertório ao tema, sem decorar citação. Antes de tudo, julgue a pertinência com rigor:
- ALTA: o repertório explica diretamente a causa, a consequência ou o problema central do recorte do tema;
- MEDIA: ajuda num aspecto lateral do tema, mas não no problema central;
- BAIXA: só se liga ao tema por uma generalização ("toda sociedade tem desigualdade", "tudo é cultura"). Nesse caso, diga em "relacao" que é melhor escolher outro repertório e não invente uma ligação.
Responda SOMENTE com JSON:
{"pertinencia":"ALTA|MEDIA|BAIXA","defende":"o que o repertório defende, em 1-2 frases","problema":"qual problema social do tema ele ajuda a explicar","relacao":"como relacioná-lo ao recorte do tema","tese":"como usá-lo para sustentar uma tese possível sobre o tema","desenvolver":"como desenvolvê-lo sem só mencionar (explicar, relacionar ao Brasil e voltar ao argumento)","paragrafo":"um parágrafo de desenvolvimento modelo (4-6 frases) que conecta repertório, argumento e problemática, sem citação literal inventada"}`;
}

export const USE_VERDICTS = ['PRODUTIVO', 'SUPERFICIAL', 'DECORATIVO', 'FORCADO', 'INCORRETO', 'SEM_REPERTORIO'] as const;
export type UseVerdict = (typeof USE_VERDICTS)[number];

/** Analisa como o aluno usou repertório num parágrafo (especificação, seção 7). */
export function analyzeUsePrompt(paragraph: string, theme: string | undefined): string {
  const themeLine = theme ? `Tema da redação: "${theme}"\n\n` : '';
  return `${themeLine}Parágrafo do aluno:
<<<
${paragraph}
>>>

Avalie o uso de repertório sociocultural nesse parágrafo pelos critérios da competência 2 do ENEM (legitimidade, pertinência e produtividade). Decida em dois passos: (1) o repertório tem relação com o argumento do próprio parágrafo? (2) se tem, ele é explicado e usado para sustentar o argumento? Classifique:
- PRODUTIVO: o repertório é explicado, relacionado ao tema e sustenta o argumento;
- SUPERFICIAL: tem relação com o argumento do parágrafo, mas só é mencionado, sem desenvolvimento;
- DECORATIVO: não tem relação com o argumento do parágrafo; aparece solto, como enfeite, e o parágrafo diria o mesmo sem ele ("repertório de bolso"). Ex.: citar um autor numa frase e, na frase seguinte, mudar de assunto com "além disso" sem voltar a ele é DECORATIVO, mesmo que o autor seja conhecido;
- FORCADO: a ligação com o tema não se sustenta;
- INCORRETO: o autor, a obra ou a ideia atribuída parece errada (diga o que conferir, sem afirmar o que não tem certeza);
- SEM_REPERTORIO: o parágrafo não usa repertório.
Responda SOMENTE com JSON:
{"veredito":"PRODUTIVO|SUPERFICIAL|DECORATIVO|FORCADO|INCORRETO|SEM_REPERTORIO","repertorio":"qual repertório foi usado (ou null)","trecho":"trecho literal do parágrafo onde ele aparece (ou null)","explicacao":"por que, em 2-3 frases","como_melhorar":["passo concreto"]}`;
}

export interface FormulaForPrompt {
  name: string;
  discipline: string;
  topic: string | null;
  latex: string;
  variables: string | null;
}

function describeFormula(f: FormulaForPrompt): string {
  return [`Fórmula: ${f.name}`, `Disciplina: ${f.discipline}`, f.topic ? `Assunto: ${f.topic}` : null, `Expressão (LaTeX): ${f.latex}`, f.variables ? `Variáveis (anotadas pelo aluno): ${f.variables}` : null]
    .filter(Boolean)
    .join('\n');
}

export function formulaPrompt(action: 'explain' | 'example' | 'mnemonic', f: FormulaForPrompt): string {
  const task = {
    explain: 'Explique o que cada símbolo significa, quando a fórmula vale (condições) e em que tipo de questão do ENEM ela costuma aparecer. Até 3 parágrafos curtos.',
    example: 'Crie um exercício curto no estilo ENEM que use essa fórmula e resolva passo a passo, com os números escolhidos por você e as contas conferidas.',
    mnemonic: 'Dê uma dica para memorizar a fórmula (associação, frase ou padrão) e um jeito rápido de conferir se lembrou certo, como análise de unidades ou caso particular.',
  }[action];
  return `${describeFormula(f)}\n\n${task}`;
}

// ------------------------------------------------------------- leitura

export interface RepertoireSuggestion {
  title: string;
  author: string | null;
  category: string;
  referenceType: string;
  context: string;
  relation: string;
  howToArgue: string;
  example: string;
  verify: string | null;
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const nullableText = (value: unknown, max: number): string | null => {
  const t = text(value, max);
  return t && t.toLowerCase() !== 'null' ? t : null;
};

/** Lê as sugestões; descarta as que vierem sem título ou sem relação com o tema. */
export function parseSuggestions(raw: string): RepertoireSuggestion[] {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return [];
  }
  const list = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 5)
    .map((item: Record<string, unknown>) => {
      const category = text(item?.category, 60).toUpperCase();
      const referenceType = text(item?.referenceType, 40).toUpperCase();
      return {
        title: text(item?.title, 240),
        author: nullableText(item?.author, 200),
        category: (REPERTOIRE_CATEGORIES as readonly string[]).includes(category) ? category : 'OUTRA',
        referenceType: (REFERENCE_TYPES as readonly string[]).includes(referenceType) ? referenceType : 'OUTRO',
        context: text(item?.context, 2000),
        relation: text(item?.relation, 2000),
        howToArgue: text(item?.howToArgue, 2000),
        example: text(item?.example, 2000),
        verify: nullableText(item?.verify, 500),
      };
    })
    .filter((s) => s.title.length >= 2 && s.relation.length > 0);
}

export const CHECK_VERDICTS = ['PERTINENTE', 'SUPERFICIAL', 'FORCADO', 'DESCONTEXTUALIZADO'] as const;
export type CheckVerdict = (typeof CHECK_VERDICTS)[number];

export interface PertinenceCheck {
  verdict: CheckVerdict;
  explanation: string;
  tips: string[];
}

export function parseCheck(raw: string): PertinenceCheck | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const verdict = text(parsed?.verdict, 30).toUpperCase();
  const explanation = text(parsed?.explanation, 2000);
  if (!(CHECK_VERDICTS as readonly string[]).includes(verdict) || !explanation) return null;
  const tips = Array.isArray(parsed.tips) ? parsed.tips.map((tip) => text(tip, 400)).filter(Boolean).slice(0, 5) : [];
  return { verdict: verdict as CheckVerdict, explanation, tips };
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

export function parseApplication(raw: string): RepertoireApplication | null {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const relevance = text(data.pertinencia, 10).toUpperCase();
  const result: RepertoireApplication = {
    relevance: (['ALTA', 'MEDIA', 'BAIXA'].includes(relevance) ? relevance : 'MEDIA') as RepertoireApplication['relevance'],
    defends: text(data.defende, 800),
    problem: text(data.problema, 800),
    relation: text(data.relacao, 800),
    thesis: text(data.tese, 800),
    develop: text(data.desenvolver, 800),
    paragraph: text(data.paragrafo, 2000),
  };
  return result.defends && result.relation ? result : null;
}

export interface UseAnalysis {
  verdict: UseVerdict;
  repertoire: string | null;
  excerpt: string | null;
  explanation: string;
  tips: string[];
}

/** Lê a análise; o trecho só fica se estiver de fato no parágrafo (sem invenção). */
export function parseUseAnalysis(raw: string, paragraph: string): UseAnalysis | null {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const verdict = text(data.veredito, 20).toUpperCase();
  const explanation = text(data.explicacao, 1500);
  if (!(USE_VERDICTS as readonly string[]).includes(verdict) || !explanation) return null;
  const excerpt = nullableText(data.trecho, 600);
  const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return {
    verdict: verdict as UseVerdict,
    repertoire: nullableText(data.repertorio, 240),
    excerpt: excerpt && norm(paragraph).includes(norm(excerpt)) ? excerpt : null,
    explanation,
    tips: Array.isArray(data.como_melhorar) ? data.como_melhorar.map((tip) => text(tip, 400)).filter(Boolean).slice(0, 4) : [],
  };
}
