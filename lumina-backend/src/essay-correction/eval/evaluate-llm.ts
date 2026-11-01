/**
 * Valida (e calibra) o corretor com IA usando redações já avaliadas.
 *
 *   npm run build && npm run essay:eval -- --calib 12 --test 18 --inep 3 --max-calls 40
 *
 * 1. Calibração: amostra estratificada da VALIDAÇÃO do Essay-BR; compara a
 *    nota bruta do avaliador com a humana e ajusta, por competência,
 *    nota = a·bruta + b (a entre 0,5 e 1,5). Só grava a calibração se ela
 *    reduzir o erro na própria amostra e houver pelo menos 10 redações.
 * 2. Teste: amostra estratificada do TESTE (temas que não entraram em nada
 *    acima), medida sem e com a calibração, ao lado do modelo estatístico.
 * 3. Redações nota mil comentadas na cartilha do Inep 2025 (se o arquivo
 *    `.cache/inep-nota-mil-2024.json` existir): a nota esperada é 1000.
 *
 * Cada resposta do modelo fica em `.cache/llm-runs/`: rodar de novo continua
 * de onde parou e não gasta cota com redação já avaliada. `--max-calls`
 * protege a cota diária dos modelos gratuitos.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service';
import { analyzeEssayText } from '../analysis/text-analysis';
import { EssayGrader, EvaluatorRun, IDENTITY_CALIBRATION, LlmCalibration } from '../grading/essay-grader';
import { extractFeatures, FeatureModelWeights, predictWithFeatureModel, snapToLevel } from '../grading/feature-model';
import { CompetencyId, COMPETENCY_IDS } from '../knowledge/inep-cartilha-2025';
import { EssayMcpClient } from '../mcp/essay-mcp-client';
import { essayModels } from '../essay-correction.service';
import { CACHE_DIR, GradedEssay, loadEssayBr, stratifiedSample } from './dataset';
import { agreementReport, fitLinear, ScoredPair } from './metrics';

const ROOT = join(__dirname, '..', '..', '..');
const RUNS_DIR = join(CACHE_DIR, '..', 'llm-runs');
const REPORT_DIR = join(CACHE_DIR, '..', 'reports');
const CALIBRATION_PATH = join(ROOT, 'src', 'essay-correction', 'model', 'llm-calibration.json');
const FEATURE_MODEL_PATH = join(ROOT, 'src', 'essay-correction', 'model', 'feature-model.json');
const PROMPT_VERSION = 'v1';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

type Scores = Record<CompetencyId, number>;
interface CachedRun {
  id: string;
  model: string;
  raw: Scores;
  annulment: string | null;
  at: string;
}

async function main() {
  const calibSize = arg('calib', 12);
  const testSize = arg('test', 18);
  const inepSize = arg('inep', 3);
  const maxCalls = arg('max-calls', 40);
  process.loadEnvFile(join(ROOT, '.env'));
  const config = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const ai = new AiService(config);
  const tools = await EssayMcpClient.connect();
  let calls = 0;
  let consecutiveFailures = 0;
  const grader = new EssayGrader({
    tools,
    calibration: IDENTITY_CALIBRATION,
    llm: async (args) => {
      if (calls >= maxCalls) throw new Error('LIMITE_DE_CHAMADAS');
      calls++;
      return ai.generateStructured({ ...args, timeoutMs: 120_000, models: essayModels() });
    },
  });
  mkdirSync(RUNS_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  async function rawScores(essay: { id: string; text: string; theme: string }): Promise<CachedRun | null> {
    const path = join(RUNS_DIR, `${PROMPT_VERSION}-${essay.id}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as CachedRun;
    if (calls >= maxCalls || consecutiveFailures >= 3) return null;
    let run: EvaluatorRun | null;
    try {
      run = await grader.evaluateOnce({ text: essay.text, theme: essay.theme });
      consecutiveFailures = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'LIMITE_DE_CHAMADAS') return null;
      consecutiveFailures++;
      console.warn(`  ${essay.id}: falhou (${message.slice(0, 160)})`);
      return null;
    }
    if (!run) return null;
    const cached: CachedRun = {
      id: essay.id,
      model: run.model ?? '',
      raw: Object.fromEntries(COMPETENCY_IDS.map((id) => [id, run!.competencies[id].score])) as Scores,
      annulment: run.annulment?.code ?? null,
      at: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(cached, null, 1));
    console.log(`  ${essay.id}: ${COMPETENCY_IDS.map((id) => cached.raw[id]).join('/')} (${cached.model}) — chamadas ${calls}/${maxCalls}`);
    return cached;
  }

  const all = await loadEssayBr();
  // Redação com nota zero total no corpus é, em geral, anulada por motivo que
  // o texto sozinho não mostra (cópia, fuga a um tema cuja proposta não está
  // aqui): fica de fora da amostra.
  const usable = (e: GradedEssay) => e.total > 0 && e.theme;
  const calibSample = stratifiedSample(all.filter((e) => e.split === 'valid' && usable(e)), calibSize, 'calib');
  const testSample = stratifiedSample(all.filter((e) => e.split === 'test' && usable(e)), testSize, 'test');

  console.log(`Calibração (${calibSample.length} redações da validação):`);
  const calibPairs: { human: Scores; raw: Scores }[] = [];
  for (const essay of calibSample) {
    const run = await rawScores(essay);
    if (run) calibPairs.push({ human: essay.scores, raw: run.raw });
  }

  const calibration: LlmCalibration = { version: 1, fitted: false, perCompetency: { ...IDENTITY_CALIBRATION.perCompetency } };
  if (calibPairs.length >= 10) {
    for (const id of COMPETENCY_IDS) calibration.perCompetency[id] = fitLinear(calibPairs.map((p) => [p.raw[id], p.human[id]]));
  }
  const applyCal = (raw: Scores, cal: LlmCalibration): Scores =>
    Object.fromEntries(COMPETENCY_IDS.map((id) => [id, snapToLevel(cal.perCompetency[id].a * raw[id] + cal.perCompetency[id].b)])) as Scores;
  const calibRawReport = agreementReport(calibPairs.map((p) => ({ human: p.human, predicted: p.raw })));
  const calibFitReport = agreementReport(calibPairs.map((p) => ({ human: p.human, predicted: applyCal(p.raw, calibration) })));
  const improves = calibPairs.length >= 10 && calibFitReport.totalMae < calibRawReport.totalMae;

  console.log(`Teste (${testSample.length} redações de temas inéditos):`);
  const featureJson = JSON.parse(readFileSync(FEATURE_MODEL_PATH, 'utf8')) as FeatureModelWeights & { trained?: boolean };
  const testRaw: ScoredPair[] = [];
  const testCal: ScoredPair[] = [];
  const testFeature: ScoredPair[] = [];
  for (const essay of testSample) {
    const run = await rawScores(essay);
    if (!run) continue;
    testRaw.push({ human: essay.scores, predicted: run.raw });
    testCal.push({ human: essay.scores, predicted: improves ? applyCal(run.raw, calibration) : run.raw });
    if (featureJson.trained !== false) {
      const p = predictWithFeatureModel(featureJson, extractFeatures(analyzeEssayText(essay.text, { theme: essay.theme }), essay.text));
      testFeature.push({ human: essay.scores, predicted: Object.fromEntries(COMPETENCY_IDS.map((id) => [id, snapToLevel(p[id])])) as Scores });
    }
  }

  const inepPath = join(ROOT, '.cache', 'inep-nota-mil-2024.json');
  const inepResults: { id: string; raw: Scores | null; total: number | null }[] = [];
  if (inepSize > 0 && existsSync(inepPath)) {
    console.log('Redações nota mil da cartilha do Inep (esperado: 1000):');
    const inep = (JSON.parse(readFileSync(inepPath, 'utf8')) as { id: string; theme: string; text: string }[]).slice(0, inepSize);
    for (const essay of inep) {
      const run = await rawScores(essay);
      inepResults.push({ id: essay.id, raw: run?.raw ?? null, total: run ? COMPETENCY_IDS.reduce((s, id) => s + run.raw[id], 0) : null });
    }
  }

  if (improves) {
    writeFileSync(CALIBRATION_PATH, `${JSON.stringify({ ...calibration, fitted: true, fittedAt: new Date().toISOString(), sampleSize: calibPairs.length }, null, 2)}\n`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    callsThisRun: calls,
    models: [...new Set(readCachedModels())],
    calibration: { n: calibPairs.length, fitted: improves, perCompetency: calibration.perCompetency, rawOnCalib: calibRawReport, calibratedOnCalib: calibFitReport },
    test: {
      n: testRaw.length,
      llmRaw: testRaw.length ? agreementReport(testRaw) : null,
      llmCalibrated: testCal.length ? agreementReport(testCal) : null,
      featureModelSameEssays: testFeature.length ? agreementReport(testFeature) : null,
    },
    inepNotaMil: inepResults,
  };
  writeFileSync(join(REPORT_DIR, 'llm-evaluation.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await tools.close();
}

function readCachedModels(): string[] {
  try {
    return require('node:fs')
      .readdirSync(RUNS_DIR)
      .map((f: string) => (JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')) as CachedRun).model);
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
