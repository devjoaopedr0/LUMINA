/**
 * Mede a sugestão de gabarito por IA contra o gabarito oficial, sem gravar nada.
 *
 *   npm run build && npm run answer-keys:eval -- --exam enem --year 2024 --day 2 --booklet Amarelo
 *
 * Para cada item do gabarito oficial que tem questão acessível no banco público:
 * - o prompt recebe só o enunciado e as alternativas (nunca a resposta do banco);
 * - a IA é chamada com o MESMO prompt do serviço (`SUGGESTION_SYSTEM_PROMPT`);
 * - a posição sugerida é comparada com a resposta oficial;
 * - o relatório separa acertos, erros, pendências (`answer: null`), respostas
 *   inválidas (JSON não lido) e motivos.
 *
 * As respostas ficam em cache por modelo + hash do prompt, em
 * `.cache/answer-key-eval/<modelo>/<prova>.json`. Rodar de novo continua de
 * onde parou e não gasta cota; `--refresh` ignora o cache.
 *
 * Opções:
 *   --exam <texto>        prova (padrão: enem)
 *   --year <ano> --day <1|2> --booklet <cor> --application <texto>
 *   --models <ref>        modelo (padrão: AI_MODEL); aceita "gemini:..."
 *   --prompt-file <arq>   A/B: usa outro system prompt (o hash entra no cache)
 *   --limit <n>           mede só as primeiras n questões elegíveis
 *   --only <n,n,...>      mede só as questões indicadas (depuração)
 *   --max-calls <n>       teto de chamadas (padrão: 200)
 *   --concurrency <n>     chamadas em paralelo (padrão: 2)
 *   --refresh             ignora o cache
 *   --dry-run             confere banco e vínculo sem chamar a IA
 *   --out <arq>           caminho do relatório JSON
 *   --json                imprime o relatório completo
 *   --compare <arq>       compara com um relatório anterior (o que corrigiu,
 *                         piorou ou virou pendência, questão a questão)
 *
 * As respostas em cache são relidas com as regras atuais de leitura (ex.: a
 * trava de justificativa inconsistente): mudar só a leitura não gasta cota.
 *
 * NÃO escreve no banco: é medição, não geração de rascunho. Assim como o
 * `essay:eval`, este script existe para que a medição do roadmap seja
 * reproduzível em vez de um número solto no histórico.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AnswerKeyOrigin, AnswerKeyStatus, Prisma } from '@prisma/client';
import { AiService } from '../../ai/ai.service';
import { PrismaService } from '../../database/prisma.service';
import { QUESTION_BANK_INSTITUTION_EMAIL } from '../../questions/question-access.service';
import { enemArea } from '../answer-key.grading';
import { CHANGE_LABEL, compareMeasurements, MeasuredItem } from './compare';
import {
  enemQuestionSourceId,
  parseSuggestedAnswerOutcome,
  pickAccessibleQuestion,
  positionLetter,
  SUGGESTION_GENERATION,
  SUGGESTION_SYSTEM_PROMPT,
  answerKeyModels,
  suggestionPrompt,
} from '../answer-key.questions';

const ROOT = join(__dirname, '..', '..', '..');
const CACHE_DIR = join(ROOT, '.cache', 'answer-key-eval');
const promptHashOf = (prompt: string) => createHash('sha1').update(prompt).digest('hex').slice(0, 12);

function argText(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function argNumber(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const slug = (value: string) => value.replace(/[^a-z0-9.-]+/gi, '_');

interface CachedSuggestion {
  questionId: string;
  model: string;
  promptHash: string;
  /** false = a resposta da IA não pôde ser lida (JSON inválido). */
  valid: boolean;
  /** null = a IA devolveu `answer: null` com motivo. */
  answer: number | null;
  justification: string;
  /** Texto cru da IA, guardado para depurar JSON inválido. */
  raw?: string;
  at: string;
}

interface CacheFile {
  promptHash: string;
  byModel: Record<string, Record<string, CachedSuggestion>>;
}

interface QuestionRow {
  id: string;
  workspaceId: string;
  examNumber: number | null;
  sourceId: string | null;
  stem: string;
  subject: string;
  imageUrl: string | null;
  alternatives: { position: number; text: string; isCorrect: boolean }[];
}

type Outcome =
  | { status: 'correct'; expected: number; suggested: number; justification: string; model: string | null }
  | { status: 'wrong'; expected: number; suggested: number; justification: string; model: string | null }
  | { status: 'pending'; expected: number; reason: string; model: string | null }
  | { status: 'invalid'; expected: number; model: string | null; raw: string }
  | { status: 'error'; expected: number; error: string; model: string | null }
  | { status: 'missing'; expected: number; model: null }
  | { status: 'image'; expected: number; model: null }
  | { status: 'no-alternatives'; expected: number; model: null }
  | { status: 'not-measured'; expected: number; model: null };

interface Evaluated {
  number: number;
  language: string;
  area: string | null;
  outcome: Outcome;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function loadCache(model: string, examSlug: string, promptHash: string): CacheFile {
  const path = join(CACHE_DIR, slug(model), `${examSlug}.json`);
  if (!existsSync(path)) return { promptHash, byModel: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
    // Prompt novo invalida o cache: a medição precisa refletir o texto atual.
    if (parsed.promptHash !== promptHash) return { promptHash, byModel: {} };
    return parsed;
  } catch {
    return { promptHash, byModel: {} };
  }
}

function saveCache(cache: CacheFile, model: string, examSlug: string): void {
  const dir = join(CACHE_DIR, slug(model));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${examSlug}.json`), JSON.stringify(cache, null, 2), 'utf8');
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function printReport(params: {
  examName: string;
  year: number | null;
  day: number | null;
  booklet: string | null;
  model: string;
  promptHash: string;
  evaluated: Evaluated[];
  calls: number;
  cached: number;
  seconds: number;
  reportPath: string;
}) {
  const { evaluated } = params;
  const counted = evaluated.filter((e) => ['correct', 'wrong', 'pending', 'invalid', 'error'].includes(e.outcome.status));
  const correct = evaluated.filter((e) => e.outcome.status === 'correct');
  const wrong = evaluated.filter((e) => e.outcome.status === 'wrong');
  const pending = evaluated.filter((e) => e.outcome.status === 'pending');
  const invalid = evaluated.filter((e) => e.outcome.status === 'invalid');
  const errors = evaluated.filter((e) => e.outcome.status === 'error');
  const skipped = evaluated.filter((e) => ['missing', 'image', 'no-alternatives', 'not-measured'].includes(e.outcome.status));
  const answered = correct.length + wrong.length;

  console.log('');
  console.log(`Prova: ${params.examName}${params.year ? ` ${params.year}` : ''}${params.day ? ` · ${params.day}º dia` : ''}${params.booklet ? ` · ${params.booklet}` : ''}`);
  console.log(`Modelo: ${params.model} · prompt ${params.promptHash}`);
  console.log(`Itens do gabarito: ${evaluated.length} · elegíveis: ${counted.length} · pulados: ${skipped.length}`);
  console.log(`Respondidas: ${answered} · corretas: ${correct.length} · erradas: ${wrong.length} · pendentes: ${pending.length} · inválidas: ${invalid.length} · erros: ${errors.length}`);
  console.log(`Acurácia entre respondidas (precisão): ${percent(correct.length, answered)}%`);
  console.log(`Acurácia entre elegíveis: ${percent(correct.length, counted.length)}%`);
  console.log(`Cobertura (respondidas / elegíveis): ${percent(answered, counted.length)}%`);
  // O que mais importa para o professor: sugestão errada com cara de certa.
  console.log(`Risco (erradas / elegíveis): ${percent(wrong.length, counted.length)}%`);
  console.log(`Chamadas: ${params.calls} · do cache: ${params.cached} · ${params.seconds}s`);
  console.log('');

  const byArea = new Map<string, { correct: number; answered: number; pending: number; total: number }>();
  for (const e of evaluated) {
    const key = e.area ?? 'Sem área';
    const row = byArea.get(key) ?? { correct: 0, answered: 0, pending: 0, total: 0 };
    row.total++;
    if (e.outcome.status === 'correct') {
      row.correct++;
      row.answered++;
    } else if (e.outcome.status === 'wrong') row.answered++;
    else if (e.outcome.status === 'pending') row.pending++;
    byArea.set(key, row);
  }
  console.log('Por área:');
  for (const [area, row] of [...byArea.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    console.log(`  ${area}: ${row.correct}/${row.answered} respondidas corretas (${percent(row.correct, row.answered)}%) · ${row.pending} pendentes · ${row.total} itens`);
  }
  console.log('');

  if (pending.length) {
    console.log('Pendências (a IA devolveu answer:null):');
    for (const e of pending) {
      const reason = e.outcome.status === 'pending' ? e.outcome.reason : '';
      console.log(`  Q${e.number}${e.language ? `/${e.language}` : ''}: ${reason}`);
    }
    console.log('');
  }
  if (wrong.length) {
    console.log('Erros:');
    for (const e of wrong) {
      if (e.outcome.status !== 'wrong') continue;
      console.log(`  Q${e.number}${e.language ? `/${e.language}` : ''}: esperado ${positionLetter(e.outcome.expected)}, sugerido ${positionLetter(e.outcome.suggested)} — ${e.outcome.justification}`);
    }
    console.log('');
  }
  if (invalid.length) {
    console.log('Inválidas (JSON não lido):');
    for (const e of invalid) {
      if (e.outcome.status !== 'invalid') continue;
      const preview = e.outcome.raw.replace(/\s+/g, ' ').slice(0, 140);
      console.log(`  Q${e.number}${e.language ? `/${e.language}` : ''}: ${preview || '(vazio)'}`);
    }
    console.log('');
  }
  const skippedReasons = skipped.reduce<Record<string, number>>((acc, e) => {
    acc[e.outcome.status] = (acc[e.outcome.status] ?? 0) + 1;
    return acc;
  }, {});
  if (Object.keys(skippedReasons).length) {
    console.log(`Pulados: ${Object.entries(skippedReasons).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }
  console.log(`Relatório: ${params.reportPath}`);
}

async function main() {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {
    // Sem .env, as variáveis precisam vir do ambiente do processo.
  }
  const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  await prisma.$connect();

  try {
    const examQuery = argText('exam') ?? 'enem';
    const yearArg = argNumber('year', 0) || null;
    const day = argNumber('day', 0) || null;
    const booklet = argText('booklet') ?? null;
    const application = argText('application') ?? 'Regular';
    const limit = argNumber('limit', 0) || null;
    const maxCalls = argNumber('max-calls', 200);
    const concurrency = argNumber('concurrency', 2);
    // Sem --models, mede a mesma cadeia que o serviço usa em produção.
    const modelsArg = argText('models');
    const chain = modelsArg ? [modelsArg] : answerKeyModels();
    const modelLabel = chain.length ? chain.join('+') : (process.env.AI_MODEL ?? 'default');
    const refresh = flag('refresh');
    // Confere banco, vínculo e contagem sem gastar cota de IA.
    const dryRun = flag('dry-run');
    // Mede só questões específicas (ex.: --only 143,155,159) para depurar.
    const onlyArg = argText('only');
    const only = onlyArg
      ? new Set(onlyArg.split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n)))
      : null;
    // A/B de prompt no mesmo modelo: --prompt-file caminho.txt (hash entra no cache).
    const promptFile = argText('prompt-file');
    const systemPrompt = promptFile ? readFileSync(promptFile, 'utf8') : SUGGESTION_SYSTEM_PROMPT;
    const promptHash = promptHashOf(systemPrompt);

    const exam = await prisma.exam.findFirst({
      where: {
        name: { contains: examQuery, mode: 'insensitive' as const },
        ...(yearArg ? { year: yearArg } : {}),
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, year: true },
    });
    if (!exam) throw new Error(`Prova não encontrada para --exam "${examQuery}"${yearArg ? ` --year ${yearArg}` : ''}.`);

    const key = await prisma.answerKey.findFirst({
      where: {
        examId: exam.id,
        origin: AnswerKeyOrigin.OFFICIAL,
        status: { not: AnswerKeyStatus.ARCHIVED },
        application,
        day: day ?? null,
        ...(booklet ? { bookletColor: { equals: booklet, mode: 'insensitive' as const } } : {}),
      },
      include: { items: { orderBy: [{ number: 'asc' as const }, { language: 'asc' as const }] } },
      orderBy: { version: 'desc' },
    });
    if (!key) {
      throw new Error(
        `Nenhum gabarito oficial para ${exam.name}${day ? ` ${day}º dia` : ''}${booklet ? ` (${booklet})` : ''} / ${application}. ` +
          'Importe o gabarito do INEP antes de medir.',
      );
    }

    const isEnem = /enem/i.test(exam.name);
    if (isEnem && (!exam.year || !day)) throw new Error('Para o Enem, informe --year e --day (1 ou 2).');

    const bank = await prisma.workspace.findFirst({
      where: { institution: { email: QUESTION_BANK_INSTITUTION_EMAIL } },
      select: { id: true },
    });

    const officialItems = key.items.filter((item) => item.answer !== null);
    const select = {
      id: true,
      workspaceId: true,
      examNumber: true,
      sourceId: true,
      stem: true,
      subject: true,
      imageUrl: true,
      alternatives: { select: { position: true, text: true, isCorrect: true }, orderBy: { position: 'asc' as const } },
    } satisfies Prisma.QuestionSelect;
    const numbers = [...new Set(officialItems.map((item) => item.number))];
    const rows: QuestionRow[] = isEnem
      ? await prisma.question.findMany({
          where: { sourceId: { in: officialItems.map((item) => enemQuestionSourceId(exam.year!, day!, item)) } },
          select,
          orderBy: { createdAt: 'asc' },
        })
      : await prisma.question.findMany({
          where: { examId: exam.id, examNumber: { in: numbers } },
          select,
          orderBy: { createdAt: 'asc' },
        });

    const byKey = new Map<string, QuestionRow[]>();
    for (const question of rows) {
      if (bank?.id && question.workspaceId !== bank.id) continue;
      const groupKey = isEnem ? (question.sourceId ?? '') : `${question.examNumber}:`;
      byKey.set(groupKey, [...(byKey.get(groupKey) ?? []), question]);
    }
    const picked = new Map<string, QuestionRow>();
    for (const item of officialItems) {
      const groupKey = isEnem ? enemQuestionSourceId(exam.year!, day!, item) : `${item.number}:`;
      const question = pickAccessibleQuestion(byKey.get(groupKey) ?? [], bank?.id ?? null);
      if (question) picked.set(`${item.number}:${item.language}`, question);
    }

    const examSlug = slug(`${exam.name}-${exam.year ?? ''}-d${day ?? ''}-${booklet ?? ''}`);
    const cache = loadCache(modelLabel, examSlug, promptHash);
    const modelCache = (cache.byModel[modelLabel] ??= {});
    const ai = new AiService(config);
    let calls = 0;
    let cached = 0;
    const started = Date.now();

    // Separa o que nem chega à IA (mesmas regras do serviço) do que será medido.
    const skippedBase: Evaluated[] = [];
    const eligible: { item: (typeof officialItems)[number]; question: QuestionRow }[] = [];
    for (const item of officialItems) {
      const area = isEnem ? enemArea(item.number) : item.area;
      const base = { number: item.number, language: item.language, area };
      const question = picked.get(`${item.number}:${item.language}`);
      if (!question) skippedBase.push({ ...base, outcome: { status: 'missing', expected: item.answer!, model: null } });
      else if (question.imageUrl) skippedBase.push({ ...base, outcome: { status: 'image', expected: item.answer!, model: null } });
      else if (question.alternatives.length < 2) skippedBase.push({ ...base, outcome: { status: 'no-alternatives', expected: item.answer!, model: null } });
      else eligible.push({ item, question });
    }
    const skippedScoped = only ? skippedBase.filter((e) => only.has(e.number)) : skippedBase;
    const eligibleScoped = only ? eligible.filter(({ item }) => only.has(item.number)) : eligible;
    const toMeasure = dryRun ? [] : eligibleScoped.slice(0, limit ?? undefined);
    const notMeasured: Evaluated[] = eligibleScoped.slice(toMeasure.length).map(({ item }) => ({
      number: item.number,
      language: item.language,
      area: isEnem ? enemArea(item.number) : item.area,
      outcome: { status: 'not-measured', expected: item.answer!, model: null },
    }));

    const measured = await mapLimit(toMeasure, concurrency, async ({ item, question }): Promise<Evaluated> => {
      const area = isEnem ? enemArea(item.number) : item.area;
      const base = { number: item.number, language: item.language, area };
      const expected = item.answer!;
      const alternatives = question.alternatives.map((a) => ({ position: a.position, text: a.text }));
      const existing = modelCache[question.id];
      if (!refresh && existing && existing.promptHash === promptHash) {
        cached++;
        if (existing.raw) {
          // Relê o texto cru com as regras atuais de leitura.
          const reparsed = parseSuggestedAnswerOutcome(existing.raw, alternatives);
          return { ...base, outcome: score(expected, reparsed !== null, reparsed ? reparsed.position : null, reparsed?.justification ?? '', existing.model, existing.raw) };
        }
        return { ...base, outcome: score(expected, existing.valid, existing.answer, existing.justification, existing.model, existing.raw ?? '') };
      }
      if (calls >= maxCalls) {
        return { ...base, outcome: { status: 'error', expected, error: 'limite de chamadas atingido', model: modelLabel } };
      }
      calls++;
      try {
        const result = await ai.generateStructured({
          system: systemPrompt,
          prompt: suggestionPrompt({ stem: question.stem, subject: question.subject, area, alternatives }),
          ...SUGGESTION_GENERATION,
          ...(chain.length ? { models: chain } : {}),
        });
        if (!result?.text?.trim()) {
          return { ...base, outcome: { status: 'error', expected, error: 'a IA não devolveu texto', model: modelLabel } };
        }
        const parsed = parseSuggestedAnswerOutcome(result.text, alternatives);
        const entry: CachedSuggestion = {
          questionId: question.id,
          model: result.model ?? modelLabel,
          promptHash,
          valid: parsed !== null,
          answer: parsed ? parsed.position : null,
          justification: parsed?.justification ?? '',
          raw: result.text,
          at: new Date().toISOString(),
        };
        modelCache[question.id] = entry;
        return { ...base, outcome: score(expected, entry.valid, entry.answer, entry.justification, entry.model, entry.raw ?? '') };
      } catch (error) {
        return { ...base, outcome: { status: 'error', expected, error: error instanceof Error ? error.message : String(error), model: modelLabel } };
      }
    });

    // Uma escrita só, depois de todas as chamadas: evita corrida no arquivo.
    saveCache(cache, modelLabel, examSlug);
    const evaluated = [...skippedScoped, ...notMeasured, ...measured].sort((a, b) => a.number - b.number || a.language.localeCompare(b.language));

    const reportPath = argText('out') ?? join(CACHE_DIR, `report-${examSlug}-${Date.now()}.json`);
    mkdirSync(CACHE_DIR, { recursive: true });
    const report = {
      generatedAt: new Date().toISOString(),
      promptHash,
      prompt: systemPrompt,
      model: modelLabel,
      exam: { id: exam.id, name: exam.name, year: exam.year, day, booklet, application },
      answerKey: { id: key.id, version: key.version },
      calls,
      cached,
      seconds: Math.round((Date.now() - started) / 1000),
      items: evaluated,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    printReport({
      examName: exam.name,
      year: exam.year,
      day,
      booklet,
      model: modelLabel,
      promptHash,
      evaluated,
      calls,
      cached,
      seconds: report.seconds,
      reportPath,
    });
    const comparePath = argText('compare');
    if (comparePath) {
      const previous = JSON.parse(readFileSync(comparePath, 'utf8')) as { items: MeasuredItem[]; promptHash?: string; model?: string };
      const { rows, summary } = compareMeasurements(previous.items, evaluated);
      console.log('');
      console.log(`Comparação com ${comparePath} (prompt ${previous.promptHash ?? '?'} · ${previous.model ?? '?'}):`);
      for (const change of Object.keys(CHANGE_LABEL) as (keyof typeof CHANGE_LABEL)[]) {
        const list = rows.filter((row) => row.change === change).map((row) => row.key);
        console.log(`  ${CHANGE_LABEL[change]}: ${summary[change]}${list.length ? ` (${list.join(', ')})` : ''}`);
      }
    }
    if (flag('json')) console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function score(expected: number, valid: boolean, answer: number | null, justification: string, model: string | null, raw = ''): Outcome {
  if (!valid) return { status: 'invalid', expected, model, raw };
  if (answer === null) return { status: 'pending', expected, reason: justification, model };
  if (answer === expected) return { status: 'correct', expected, suggested: answer, justification, model };
  return { status: 'wrong', expected, suggested: answer, justification, model };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
