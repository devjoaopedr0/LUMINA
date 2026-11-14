/**
 * Valida e calibra o corretor por competência com redações já avaliadas.
 *
 *   npm run build && npm run essay:eval -- --models gemini:gemini-3.5-flash-lite --calib 30 --test 30 --inep 3 --max-calls 400
 *
 * Mede UM modelo por vez (calibração é por modelo), um avaliador, cinco
 * chamadas por redação — uma por competência, como na produção. O avaliador
 * único é deliberado: a linha de base v2 também foi medida assim. A validação
 * com os dois avaliadores da produção é uma etapa separada.
 *
 * 1. Calibração: amostra estratificada da VALIDAÇÃO do Essay-BR. Para cada
 *    competência, a validação cruzada escolhe a função (identidade, reta ou
 *    isotônica) — ver grading/calibration.ts.
 * 2. Teste: amostra estratificada do TESTE (temas que não entraram acima),
 *    medida com a nota bruta e com a calibração ajustada só na amostra de
 *    calibração — é o número honesto, em temas nunca vistos.
 * 3. Calibração final: depois de validada, é ajustada de novo com calibração
 *    + teste juntos (mais dados por nível) e gravada em
 *    model/llm-calibration.json, em byModel[modelo].
 * 4. Redações nota mil da cartilha do Inep (se `.cache/inep-nota-mil-2024.json`
 *    existir): a nota esperada é 1000.
 *
 * Cada chamada fica em cache (`.cache/llm-runs/<versão>/<modelo>/`): rodar
 * de novo continua de onde parou e não gasta cota com o que já foi avaliado.
 * `--max-calls` protege a cota diária dos modelos gratuitos.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service';
import { analyzeEssayText } from '../analysis/text-analysis';
import { applyCalibrationFn, CalibrationFn, fitCalibration } from '../grading/calibration';
import { archiveCalibrationIfNeeded, canWriteFinalCalibration } from '../grading/calibration-store';
import { EssayGrader, GRADER_PROMPT_VERSION, IDENTITY_CALIBRATION, LlmCalibration } from '../grading/essay-grader';
import { PROMPT_SETS } from '../grading/prompt-sets';
import { extractFeatures, FeatureModelWeights, predictWithFeatureModel, snapToLevel } from '../grading/feature-model';
import { CompetencyId, COMPETENCY_IDS } from '../knowledge';
import { EssayMcpClient } from '../mcp/essay-mcp-client';
import { essayModels } from '../essay-correction.service';
import { CACHE_DIR, GradedEssay, loadEssayBr, stratifiedSample } from './dataset';
import { agreementReport, ScoredPair } from './metrics';

const ROOT = join(__dirname, '..', '..', '..');
const REPORT_DIR = join(CACHE_DIR, '..', 'reports');
const CALIBRATION_PATH = join(ROOT, 'src', 'essay-correction', 'model', 'llm-calibration.json');
const FEATURE_MODEL_PATH = join(ROOT, 'src', 'essay-correction', 'model', 'feature-model.json');

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

function argText(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Nome de arquivo seguro para um modelo (ex.: "gemini:gemini-3.5-flash-lite"). */
const slug = (model: string) => model.replace(/[^a-z0-9.-]+/gi, '_');

type Scores = Record<CompetencyId, number>;

/** Cache de uma redação: nota bruta de cada competência já avaliada. */
interface CachedEssay {
  id: string;
  model: string;
  competencies: Partial<Record<CompetencyId, { raw: number; at: string }>>;
  /** Da C2. */
  annulment?: string | null;
  tangencia?: boolean;
  /** Da C5. */
  humanRights?: boolean;
  /** Anulada por regra (sem IA). */
  ruleAnnulment?: string;
}

/** Nota final de um avaliador: calibra cada competência e aplica as regras. */
function predict(cached: CachedEssay, perCompetency?: Record<CompetencyId, CalibrationFn>): Scores {
  const out = {} as Scores;
  for (const id of COMPETENCY_IDS) {
    const raw = cached.competencies[id]!.raw;
    let score = snapToLevel(perCompetency ? applyCalibrationFn(perCompetency[id], raw) : raw);
    if (cached.tangencia && (id === 'C2' || id === 'C3' || id === 'C5')) score = Math.min(score, 40);
    if (cached.humanRights && id === 'C5') score = 0;
    if (cached.annulment) score = 0;
    out[id] = score;
  }
  return out;
}

const rawScores = (cached: CachedEssay) => Object.fromEntries(COMPETENCY_IDS.map((id) => [id, cached.competencies[id]!.raw])) as Scores;
const complete = (cached: CachedEssay | null): cached is CachedEssay => Boolean(cached && !cached.ruleAnnulment && COMPETENCY_IDS.every((id) => cached.competencies[id]));

async function main() {
  const calibSize = arg('calib', 30);
  const testSize = arg('test', 30);
  const inepSize = arg('inep', 3);
  const maxCalls = arg('max-calls', 200);
  // Chamadas simultâneas: os planos gratuitos limitam requisições por minuto.
  const concurrency = arg('concurrency', 2);
  process.loadEnvFile(join(ROOT, '.env'));
  const model = argText('models') ?? essayModels()[0];
  // --prompt <versão> mede outra versão do prompt sem mudar o código (A/B).
  const promptVersion = argText('prompt') ?? GRADER_PROMPT_VERSION;
  if (!PROMPT_SETS[promptVersion]) throw new Error(`Prompt desconhecido: ${promptVersion}. Opções: ${Object.keys(PROMPT_SETS).join(', ')}`);
  if (!model) throw new Error('Informe o modelo: --models gemini:gemini-3.5-flash-lite (ou defina AI_ESSAY_MODELS).');
  const runsDir = join(CACHE_DIR, '..', 'llm-runs', promptVersion, slug(model));
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const ai = new AiService(config);
  const tools = await EssayMcpClient.connect();
  let calls = 0;
  let consecutiveFailures = 0;
  const latencies: number[] = [];
  const answeredBy = new Set<string>();
  const started = Date.now();
  // Sem calibração: o que se mede e calibra é a nota bruta do modelo.
  const grader = new EssayGrader({
    tools,
    calibration: IDENTITY_CALIBRATION,
    promptVersion,
    llm: async (args) => ai.generateStructured({ ...args, timeoutMs: 120_000, models: [model] }),
  });

  async function evaluate(essay: { id: string; text: string; theme: string }): Promise<CachedEssay | null> {
    const path = join(runsDir, `${essay.id}.json`);
    const cached: CachedEssay = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { id: essay.id, model, competencies: {} };
    if (cached.ruleAnnulment || COMPETENCY_IDS.every((id) => cached.competencies[id])) return cached;
    const prepared = await grader.prepare({ text: essay.text, theme: essay.theme });
    if (prepared.ruleAnnulment) {
      cached.ruleAnnulment = prepared.ruleAnnulment.code;
      writeFileSync(path, JSON.stringify(cached, null, 1));
      return cached;
    }
    const missing = COMPETENCY_IDS.filter((id) => !cached.competencies[id]);
    for (let start = 0; start < missing.length; start += concurrency) await Promise.all(
      missing.slice(start, start + concurrency).map(async (id) => {
        if (calls >= maxCalls || consecutiveFailures >= 5) return;
        calls++;
        const t0 = Date.now();
        try {
          const run = await grader.evaluateCompetency(prepared, id, 'avaliador-1', 0.2);
          if (!run) return;
          latencies.push(Date.now() - t0);
          consecutiveFailures = 0;
          answeredBy.add(run.model);
          cached.model = run.model;
          cached.competencies[id] = { raw: run.rawScore ?? run.score, at: new Date().toISOString() };
          if (id === 'C2') {
            cached.annulment = run.annulment?.code ?? null;
            cached.tangencia = run.tangencia ?? false;
          }
          if (id === 'C5') cached.humanRights = run.humanRightsViolation ?? false;
        } catch (error) {
          consecutiveFailures++;
          console.warn(`  ${essay.id} ${id}: falhou (${(error instanceof Error ? error.message : String(error)).slice(0, 160)})`);
        }
      }),
    );
    writeFileSync(path, JSON.stringify(cached, null, 1));
    if (complete(cached)) console.log(`  ${essay.id}: ${COMPETENCY_IDS.map((id) => cached.competencies[id]!.raw).join('/')} — chamadas ${calls}/${maxCalls}`);
    return cached;
  }

  const all = await loadEssayBr();
  // Redação com nota zero total no corpus é, em geral, anulada por motivo que
  // o texto sozinho não mostra (cópia, fuga a um tema cuja proposta não está
  // aqui): fica de fora da amostra.
  const usable = (e: GradedEssay) => e.total > 0 && e.theme;
  const calibSample = stratifiedSample(all.filter((e) => e.split === 'valid' && usable(e)), calibSize, 'calib');
  const testSample = stratifiedSample(all.filter((e) => e.split === 'test' && usable(e)), testSize, 'test');

  console.log(`Modelo: ${model} — prompts ${promptVersion}`);
  console.log(`Calibração (${calibSample.length} redações da validação):`);
  const calibPairs: { human: Scores; raw: Scores; cached: CachedEssay }[] = [];
  for (const essay of calibSample) {
    const cached = await evaluate(essay);
    if (complete(cached)) calibPairs.push({ human: essay.scores, raw: rawScores(cached), cached });
  }

  console.log(`Teste (${testSample.length} redações de temas inéditos):`);
  const testPairs: { human: Scores; raw: Scores; cached: CachedEssay; essay: GradedEssay }[] = [];
  for (const essay of testSample) {
    const cached = await evaluate(essay);
    if (complete(cached)) testPairs.push({ human: essay.scores, raw: rawScores(cached), cached, essay });
  }

  const inepPath = join(ROOT, '.cache', 'inep-nota-mil-2024.json');
  const inepRuns: { id: string; cached: CachedEssay | null }[] = [];
  if (inepSize > 0 && existsSync(inepPath)) {
    console.log('Redações nota mil da cartilha do Inep (esperado: 1000):');
    const inep = (JSON.parse(readFileSync(inepPath, 'utf8')) as { id: string; theme: string; text: string }[]).slice(0, inepSize);
    for (const essay of inep) inepRuns.push({ id: essay.id, cached: await evaluate(essay) });
  }

  // 1) Calibração ajustada SÓ na amostra de calibração, medida no teste.
  const heldOut = calibPairs.length >= 10 ? fitCalibration(calibPairs) : null;
  const featureJson = JSON.parse(readFileSync(FEATURE_MODEL_PATH, 'utf8')) as FeatureModelWeights & { trained?: boolean };
  const testRaw: ScoredPair[] = testPairs.map((p) => ({ human: p.human, predicted: predict(p.cached) }));
  const testCal: ScoredPair[] = testPairs.map((p) => ({ human: p.human, predicted: predict(p.cached, heldOut?.perCompetency) }));
  const testFeature: ScoredPair[] =
    featureJson.trained === false
      ? []
      : testPairs.map((p) => {
          const f = predictWithFeatureModel(featureJson, extractFeatures(analyzeEssayText(p.essay.text, { theme: p.essay.theme }), p.essay.text));
          return { human: p.human, predicted: Object.fromEntries(COMPETENCY_IDS.map((id) => [id, snapToLevel(f[id])])) as Scores };
        });

  // 2) Calibração final, com todos os dados, gravada para o modelo. Só grava
  // quando a amostra de TESTE também foi medida: calibrar com as redações de
  // calibração e não validar em temas inéditos foi o que produziu uma função
  // de 10 redações numa execução interrompida por limite de cota (05/11/2026).
  const allPairs = [...calibPairs, ...testPairs];
  const final = canWriteFinalCalibration(calibPairs.length, testPairs.length) ? fitCalibration(allPairs) : null;
  const modelKey = [...answeredBy][0] ?? calibPairs[0]?.cached.model ?? model;
  if (final && argText('write') !== 'false') {
    const archived = archiveCalibrationIfNeeded(CALIBRATION_PATH, promptVersion);
    if (archived) console.log(`Calibração anterior arquivada em ${archived}`);
    const current = existsSync(CALIBRATION_PATH) ? (JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8')) as Partial<LlmCalibration>) : {};
    const next: LlmCalibration =
      current.version === 2 && current.promptVersion === promptVersion
        ? (current as LlmCalibration)
        : { version: 2, promptVersion: promptVersion, byModel: {} };
    next.byModel[modelKey] = { perCompetency: final.perCompetency, fittedAt: new Date().toISOString(), sampleSize: allPairs.length, selection: final.selection };
    writeFileSync(CALIBRATION_PATH, `${JSON.stringify(next, null, 2)}\n`);
  }

  const total = (s: Scores) => COMPETENCY_IDS.reduce((sum, id) => sum + s[id], 0);
  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: promptVersion,
    model: modelKey,
    callsThisRun: calls,
    secondsThisRun: Math.round((Date.now() - started) / 1000),
    medianLatencyMs: latencies.length ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
    calibration: { n: calibPairs.length, heldOutSelection: heldOut?.selection ?? null },
    test: {
      n: testPairs.length,
      llmRaw: testRaw.length ? agreementReport(testRaw) : null,
      llmCalibratedHeldOut: testCal.length ? agreementReport(testCal) : null,
      featureModelSameEssays: testFeature.length ? agreementReport(testFeature) : null,
    },
    finalCalibration: final ? { n: allPairs.length, selection: final.selection } : null,
    inepNotaMil: inepRuns.map(({ id, cached }) => ({
      id,
      raw: complete(cached) ? total(predict(cached)) : null,
      calibrated: complete(cached) && final ? total(predict(cached, final.perCompetency)) : null,
    })),
  };
  writeFileSync(join(REPORT_DIR, `eval-${promptVersion}-${slug(model)}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await tools.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
