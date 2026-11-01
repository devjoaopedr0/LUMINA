/**
 * Redações já avaliadas usadas para treinar e validar a correção.
 *
 * Essay-BR estendido (Marinho, Anchiêta e Moura, JIDM 2022; licença MIT —
 * github.com/lplnufpi/essay-br): 6.577 redações do ensino médio avaliadas por
 * profissionais nas cinco competências do Enem (0 a 200, de 40 em 40). O
 * arquivo não é versionado: é baixado para `.cache/essay-br/` na primeira
 * execução.
 *
 * Divisão treino/validação/teste por TEMA (prompt), não por redação: assim o
 * teste mede a correção em temas que o modelo nunca viu, como acontece com a
 * proposta inédita de cada Enem.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompetencyId } from '../knowledge/inep-cartilha-2025';

export const CACHE_DIR = join(__dirname, '..', '..', '..', '.cache', 'essay-br');
const BASE_URL = 'https://raw.githubusercontent.com/lplnufpi/essay-br/main/extended-corpus';

export interface GradedEssay {
  id: string;
  prompt: string;
  theme: string;
  text: string;
  scores: Record<CompetencyId, number>;
  total: number;
  split: 'train' | 'valid' | 'test';
}

/** CSV RFC 4180 (aspas duplas, campos com quebra de linha). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** O corpus guarda os parágrafos como lista Python: "['par 1', \"par 2\"]". */
export function parsePythonList(value: string): string[] {
  const items: string[] = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const raw = match[1] ?? match[2] ?? '';
    items.push(raw.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1').trim());
  }
  return items.filter(Boolean);
}

function splitOf(prompt: string): GradedEssay['split'] {
  const h = createHash('sha256').update(`essay-br:${prompt}`).digest()[0] / 255;
  return h < 0.7 ? 'train' : h < 0.85 ? 'valid' : 'test';
}

async function ensureFile(name: string): Promise<string> {
  const path = join(CACHE_DIR, name);
  if (!existsSync(path)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    const response = await fetch(`${BASE_URL}/${name}`);
    if (!response.ok) throw new Error(`Falha ao baixar ${name}: HTTP ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(path, 'utf8');
}

export async function loadEssayBr(): Promise<GradedEssay[]> {
  const [essaysCsv, promptsCsv] = await Promise.all([ensureFile('extended_essay-br.csv'), ensureFile('prompts.csv')]);
  const prompts = parseCsv(promptsCsv);
  const promptHeader = prompts[0];
  const themeById = new Map(prompts.slice(1).map((r) => [r[promptHeader.indexOf('id')], r[promptHeader.indexOf('title')]]));
  const rows = parseCsv(essaysCsv);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const essays: GradedEssay[] = [];
  rows.slice(1).forEach((r, index) => {
    const paragraphs = parsePythonList(r[col('essay')] ?? '');
    const scores = {
      C1: Number(r[col('c1')]),
      C2: Number(r[col('c2')]),
      C3: Number(r[col('c3')]),
      C4: Number(r[col('c4')]),
      C5: Number(r[col('c5')]),
    };
    if (!paragraphs.length || Object.values(scores).some((s) => !Number.isFinite(s) || s % 40 !== 0 || s < 0 || s > 200)) return;
    const prompt = r[col('prompt')];
    essays.push({
      id: `essay-br-${index}`,
      prompt,
      theme: themeById.get(prompt) ?? '',
      text: paragraphs.join('\n\n'),
      scores,
      total: Object.values(scores).reduce((a, b) => a + b, 0),
      split: splitOf(prompt),
    });
  });
  return essays;
}

/** Amostra determinística e estratificada pela nota total (mesma semente → mesma amostra). */
export function stratifiedSample(essays: GradedEssay[], size: number, seed: string): GradedEssay[] {
  const bins = new Map<number, GradedEssay[]>();
  for (const essay of essays) {
    const bin = Math.min(4, Math.floor(essay.total / 200));
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin)!.push(essay);
  }
  const key = (e: GradedEssay) => createHash('sha256').update(`${seed}:${e.id}`).digest('hex');
  for (const list of bins.values()) list.sort((a, b) => key(a).localeCompare(key(b)));
  const out: GradedEssay[] = [];
  const order = [...bins.keys()].sort();
  for (let i = 0; out.length < size && order.some((b) => bins.get(b)!.length > i); i++) {
    for (const bin of order) {
      const item = bins.get(bin)![i];
      if (item && out.length < size) out.push(item);
    }
  }
  return out;
}
