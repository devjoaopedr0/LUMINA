import { ENEM_MATRIX, type EnemArea, skillCode } from './enem-matrix';

/**
 * Classificação das questões pela Matriz de Referência do ENEM.
 *
 * Uma chamada classifica um lote de questões da MESMA área: o prompt leva a
 * lista oficial das 30 habilidades daquela área (texto do Inep) e o
 * enunciado + alternativas de cada questão. A IA só pode responder um número
 * de 1 a 30 daquela área ou null; qualquer outra coisa é descartada. O
 * resultado entra como sugestão (origin AI, não validada) e o professor ou a
 * gestão confirma ou corrige na edição da questão.
 */
export const SKILL_PROMPT_VERSION = 'habilidades-v1';

export const SKILL_SYSTEM = `Você é especialista na Matriz de Referência do ENEM (Inep). Classifica questões pela habilidade (H1 a H30) que a questão de fato exige do aluno para ser resolvida, não pelo assunto que ela menciona. Responda somente com JSON válido.`;

export interface SkillQuestionInput {
  ref: string;
  subject: string;
  topic: string;
  stem: string;
  alternatives: string[];
}

export interface SkillClassification {
  ref: string;
  code: string | null;
  note: string;
}

const MAX_STEM = 1800;
const MAX_ALT = 300;
const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

export function skillBatchPrompt(area: EnemArea, questions: SkillQuestionInput[]): string {
  const matrix = ENEM_MATRIX[area];
  const competencies = matrix.competencies
    .map((c) => {
      const skills = matrix.skills.filter((s) => s.competency === c.n).map((s) => `  H${s.n} — ${s.text}`).join('\n');
      return `Competência de área ${c.n} — ${c.text}\n${skills}`;
    })
    .join('\n');
  const items = questions
    .map((q) => {
      const alts = q.alternatives.map((a, i) => `  ${String.fromCharCode(65 + i)}) ${clip(a, MAX_ALT)}`).join('\n');
      return `### ${q.ref}\nMatéria/assunto: ${q.subject} / ${q.topic}\nEnunciado: ${clip(q.stem, MAX_STEM)}\nAlternativas:\n${alts}`;
    })
    .join('\n\n');
  return `Área: ${matrix.name}

Matriz de Referência do ENEM (texto oficial do Inep) desta área:
${competencies}

Para cada questão abaixo, escolha UMA habilidade desta área (H1 a H30) que melhor descreve o que a questão exige para ser resolvida.
Regras:
- Leia o comando da questão (o que ela pede) antes do assunto: a habilidade é a operação cognitiva exigida.
- Use só habilidades da lista acima. Não invente códigos.
- Se o texto da questão estiver incompleto (ex.: depende de uma figura que não veio) ou nenhuma habilidade se aplicar com segurança, responda null.
- Justificativa: uma frase curta, ligando o comando da questão ao texto da habilidade.

Questões:

${items}

Responda SOMENTE com JSON, um item por questão, na mesma ordem:
{"classificacoes": [{"ref": "Q1", "habilidade": 17, "justificativa": "..."}]}`;
}

function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Lê a resposta da IA. Só aceita refs do lote e números 1–30; o resto vira null com o motivo. */
export function parseSkillBatch(raw: string, area: EnemArea, refs: string[]): SkillClassification[] {
  const json = extractJson(raw) as { classificacoes?: unknown } | null;
  const list = Array.isArray(json?.classificacoes) ? (json!.classificacoes as Record<string, unknown>[]) : [];
  const byRef = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (item && typeof item.ref === 'string' && refs.includes(item.ref) && !byRef.has(item.ref)) byRef.set(item.ref, item);
  }
  return refs.map((ref) => {
    const item = byRef.get(ref);
    if (!item) return { ref, code: null, note: 'A IA não devolveu classificação para esta questão.' };
    const raw = typeof item.habilidade === 'string' ? item.habilidade.replace(/^H/i, '') : item.habilidade;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    const note = typeof item.justificativa === 'string' ? item.justificativa.trim().slice(0, 500) : '';
    if (item.habilidade === null) return { ref, code: null, note: note || 'A IA não encontrou habilidade com segurança.' };
    if (!Number.isInteger(n) || n < 1 || n > 30) return { ref, code: null, note: 'Resposta da IA fora da matriz.' };
    return { ref, code: skillCode(area, n), note };
  });
}
