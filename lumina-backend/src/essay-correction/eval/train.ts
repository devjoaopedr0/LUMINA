/**
 * Treina o modelo de atributos com o Essay-BR e mede no conjunto de teste.
 *
 *   npm run build && npm run essay:train
 *
 * Grava os pesos em src/essay-correction/model/feature-model.json (versionado:
 * é o que o backend carrega) e o relatório em .cache/reports/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeEssayText } from '../analysis/text-analysis';
import { CompetencyId, COMPETENCY_IDS } from '../knowledge/inep-cartilha-2025';
import { extractFeatures, FEATURE_NAMES, FeatureModelWeights, fitRidge, predictWithFeatureModel, snapToLevel, standardize } from '../grading/feature-model';
import { CACHE_DIR, GradedEssay, loadEssayBr } from './dataset';
import { agreementReport, ScoredPair } from './metrics';

const MODEL_PATH = join(__dirname, '..', '..', '..', 'src', 'essay-correction', 'model', 'feature-model.json');
const REPORT_DIR = join(CACHE_DIR, '..', 'reports');
const LAMBDAS = [0.1, 1, 10, 30, 100, 300, 1000];

function matrix(essays: GradedEssay[]) {
  return essays.map((e) => extractFeatures(analyzeEssayText(e.text, { theme: e.theme }), e.text));
}

function evaluate(model: FeatureModelWeights, x: number[][], essays: GradedEssay[]): ScoredPair[] {
  return x.map((features, i) => {
    const raw = predictWithFeatureModel(model, features);
    const predicted = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, snapToLevel(raw[id])])) as Record<CompetencyId, number>;
    return { human: essays[i].scores, predicted };
  });
}

async function main() {
  const all = await loadEssayBr();
  const train = all.filter((e) => e.split === 'train');
  const valid = all.filter((e) => e.split === 'valid');
  const test = all.filter((e) => e.split === 'test');
  console.log(`Essay-BR: ${all.length} redações válidas — treino ${train.length}, validação ${valid.length}, teste ${test.length} (divisão por tema).`);

  const xTrain = matrix(train);
  const d = FEATURE_NAMES.length;
  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(0);
  for (const row of xTrain) row.forEach((v, i) => (mean[i] += v / xTrain.length));
  for (const row of xTrain) row.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / xTrain.length));
  for (let i = 0; i < d; i++) std[i] = Math.sqrt(std[i]) || 1;
  mean[0] = 0;
  std[0] = 1;
  const zTrain = xTrain.map((row) => standardize(row, mean, std));
  const xValid = matrix(valid);
  const xTest = matrix(test);

  const weights = {} as Record<CompetencyId, number[]>;
  const chosenLambda = {} as Record<CompetencyId, number>;
  for (const id of COMPETENCY_IDS) {
    const y = train.map((e) => e.scores[id]);
    let best = { lambda: LAMBDAS[0], mae: Infinity, w: [] as number[] };
    for (const lambda of LAMBDAS) {
      const w = fitRidge(zTrain, y, lambda);
      const probe: FeatureModelWeights = { version: 1, trainedAt: '', dataset: '', trainSize: 0, mean, std, weights: { C1: w, C2: w, C3: w, C4: w, C5: w } };
      const err = xValid.reduce((s, row, i) => s + Math.abs(snapToLevel(predictWithFeatureModel(probe, row)[id]) - valid[i].scores[id]), 0) / valid.length;
      if (err < best.mae) best = { lambda, mae: err, w };
    }
    weights[id] = best.w.map((v) => Number(v.toFixed(5)));
    chosenLambda[id] = best.lambda;
  }

  const model: FeatureModelWeights = {
    version: 1,
    trainedAt: new Date().toISOString(),
    dataset: 'essay-br-estendido',
    trainSize: train.length,
    mean: mean.map((v) => Number(v.toFixed(5))),
    std: std.map((v) => Number(v.toFixed(5))),
    weights,
  };
  const testReport = agreementReport(evaluate(model, xTest, test));
  model.testMae = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, testReport.perCompetency[id].mae])) as Record<CompetencyId, number>;

  // Referência ingênua: sempre a média de cada competência no treino.
  const meanScore = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, snapToLevel(train.reduce((s, e) => s + e.scores[id], 0) / train.length)])) as Record<CompetencyId, number>;
  const baseline = agreementReport(test.map((e) => ({ human: e.scores, predicted: meanScore })));

  writeFileSync(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`);
  mkdirSync(REPORT_DIR, { recursive: true });
  const report = { generatedAt: model.trainedAt, sizes: { train: train.length, valid: valid.length, test: test.length }, lambda: chosenLambda, featureModel: testReport, baselineMean: baseline };
  writeFileSync(join(REPORT_DIR, 'feature-model.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Pesos gravados em ${MODEL_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
