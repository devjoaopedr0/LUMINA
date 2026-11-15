/**
 * LuminIA sobre os materiais da instituição (item 49).
 *
 * A IA recebe só os trechos encontrados nos materiais da turma e deve
 * responder com base neles, citando material e página. Se o material não
 * trata do assunto, diz isso em vez de responder de memória. As citações
 * devolvidas são conferidas: só ficam as que apontam para trechos enviados.
 */
export const MATERIAL_SYSTEM = `Você é a LuminIA, assistente de estudos de uma plataforma de preparação para o ENEM. Responda em português do Brasil, de forma clara e didática, SOMENTE com base nos trechos de material do professor que forem fornecidos. Não use conhecimento externo para completar lacunas. Responda somente com JSON válido.`;

export interface MaterialCitation {
  materialId: string;
  title: string;
  page: number;
}

export function askPrompt(question: string, context: string, explainPage: boolean): string {
  return `${explainPage ? 'O aluno pediu a explicação deste trecho do material.' : 'Pergunta do aluno:'}
"""${question}"""

Trechos dos materiais do professor (cada um com material e página):
${context}

Regras:
- Use só o que está nos trechos. Se eles não tratam da pergunta, diga isso em "resposta", deixe "citacoes" vazio e marque "encontrado": false.
- Cite cada trecho usado no formato exato do cabeçalho, como "Apostila de Química, p. 3".
- Explique com suas palavras; cite literalmente no máximo uma frase curta.

Responda SOMENTE com JSON:
{"encontrado": true, "resposta": "...", "citacoes": ["Título, p. N"]}`;
}

export interface AskResult {
  found: boolean;
  answer: string;
  citations: MaterialCitation[];
}

function extractJson(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Lê a resposta e mantém só as citações que batem com trechos enviados. */
export function parseAsk(raw: string, sent: MaterialCitation[]): AskResult | null {
  const json = extractJson(raw);
  if (!json || typeof json.resposta !== 'string' || !json.resposta.trim()) return null;
  const wanted = Array.isArray(json.citacoes) ? json.citacoes.filter((c): c is string => typeof c === 'string') : [];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const citations: MaterialCitation[] = [];
  for (const c of wanted) {
    const m = /^(.*),\s*p\.?\s*(\d+)\s*$/i.exec(c.trim());
    if (!m) continue;
    const hit = sent.find((s) => s.page === Number(m[2]) && norm(s.title) === norm(m[1]));
    if (hit && !citations.some((x) => x.materialId === hit.materialId && x.page === hit.page)) citations.push(hit);
  }
  const found = json.encontrado !== false && citations.length > 0;
  return { found, answer: json.resposta.trim(), citations: found ? citations : [] };
}

export interface DraftQuestion {
  stem: string;
  alternatives: { text: string; isCorrect: boolean }[];
  explanation: string;
  page: number | null;
}

export function questionsPrompt(context: string, count: number, subject: string | null): string {
  return `Crie ${count} questão(ões) de múltipla escolha no estilo do ENEM${subject ? ` de ${subject}` : ''} usando SOMENTE o conteúdo dos trechos abaixo, do material do professor.

${context}

Regras:
- Cada questão com enunciado contextualizado, 5 alternativas e exatamente UMA correta.
- A resposta correta tem de estar sustentada pelo trecho; indique a página usada.
- As alternativas erradas devem ser plausíveis, sem pegadinha de redação.
- Explicação curta: por que a correta está certa, com base no trecho.

Responda SOMENTE com JSON:
{"questoes": [{"enunciado": "...", "alternativas": ["...", "...", "...", "...", "..."], "correta": 0, "explicacao": "...", "pagina": 1}]}`;
}

/** Valida as questões geradas: 4 ou 5 alternativas distintas, índice correto válido. */
export function parseQuestions(raw: string, pages: number[]): DraftQuestion[] {
  const json = extractJson(raw);
  const list = Array.isArray(json?.questoes) ? (json!.questoes as Record<string, unknown>[]) : [];
  const out: DraftQuestion[] = [];
  for (const q of list) {
    const stem = typeof q.enunciado === 'string' ? q.enunciado.trim() : '';
    const alts = Array.isArray(q.alternativas) ? q.alternativas.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim()) : [];
    const correct = typeof q.correta === 'number' ? q.correta : -1;
    if (stem.length < 20 || alts.length < 4 || alts.length > 5 || new Set(alts).size !== alts.length || correct < 0 || correct >= alts.length) continue;
    const page = typeof q.pagina === 'number' && pages.includes(q.pagina) ? q.pagina : null;
    out.push({
      stem,
      alternatives: alts.map((text, i) => ({ text, isCorrect: i === correct })),
      explanation: typeof q.explicacao === 'string' ? q.explicacao.trim() : '',
      page,
    });
  }
  return out;
}
