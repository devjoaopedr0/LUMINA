/**
 * Mede se o aprendizado humano validado reduz o erro em redações held-out.
 *
 * O desenho é deliberadamente conservador:
 * 1. só entram revisões VALIDATED ou CONSOLIDATED (rótulo humano confiável);
 * 2. a divisão é por essayId, nunca por competência ou por linha, para que a
 *    mesma redação não apareça em treino e teste;
 * 3. a calibração por competência é ajustada apenas no treino e aplicada ao
 *    teste, sem olhar a nota humana do teste;
 * 4. o relatório compara MAE total, viés e concordância pela regra do Inep
 *    antes e depois da calibração supervisionada.
 *
 * Uso depois do build:
 *   npm run essay:human-eval -- --test-ratio 0.3 --write true
 *
 * Enquanto não houver revisões validadas suficientes, o comando apenas
 * informa quantas existem. Não inventa uma medição com dados sintéticos.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { EssayLearningLevel, PrismaClient } from '@prisma/client';
import { COMPETENCY_IDS, CompetencyId } from '../../essay-correction/knowledge';
import { agreementReport, fitLinear, ScoredPair } from '../../essay-correction/eval/metrics';
import { snapToLevel } from '../../essay-correction/grading/feature-model';

export interface HumanLoopSample {
  essayId: string;
  ai: Record<CompetencyId, number>;
  human: Record<CompetencyId, number>;
}

export interface HumanLoopEvaluation {
  split: { train: number; test: number; testRatio: number; disjoint: boolean };
  calibration: Record<CompetencyId, { a: number; b: number; n: number }>;
  baseline: ReturnType<typeof agreementReport>;
  calibrated: ReturnType<typeof agreementReport>;
  improvement: { totalMae: number; inepAgreement: number; totalBias: number };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Divide por redação, não por avaliação: evita vazamento entre treino/teste. */
export function splitHumanLoopSamples(samples: HumanLoopSample[], testRatio = 0.3) {
  if (samples.length < 2) throw new Error('São necessárias ao menos duas redações validadas para separar treino e teste.');
  const ratio = Math.min(0.5, Math.max(0.1, testRatio));
  const ordered = [...samples].sort((a, b) => hash(a.essayId) - hash(b.essayId) || a.essayId.localeCompare(b.essayId));
  const testCount = Math.max(1, Math.min(ordered.length - 1, Math.round(ordered.length * ratio)));
  const test = ordered.slice(0, testCount);
  const train = ordered.slice(testCount);
  const trainIds = new Set(train.map((sample) => sample.essayId));
  return {
    train,
    test,
    disjoint: test.every((sample) => !trainIds.has(sample.essayId)),
  };
}

/** Ajusta no treino e mede no teste; a nota humana do teste nunca entra no ajuste. */
export function evaluateHumanLoop(samples: HumanLoopSample[], testRatio = 0.3): HumanLoopEvaluation {
  const { train, test, disjoint } = splitHumanLoopSamples(samples, testRatio);
  const calibration = {} as HumanLoopEvaluation['calibration'];

  for (const id of COMPETENCY_IDS) {
    const pairs = train.map((sample) => [sample.ai[id], sample.human[id]] as [number, number]);
    const { a, b } = fitLinear(pairs);
    calibration[id] = { a, b, n: pairs.length };
  }

  const baselinePairs: ScoredPair[] = test.map((sample) => ({ human: sample.human, predicted: sample.ai }));
  const calibratedPairs: ScoredPair[] = test.map((sample) => ({
    human: sample.human,
    predicted: Object.fromEntries(
      COMPETENCY_IDS.map((id) => [id, snapToLevel(calibration[id].a * sample.ai[id] + calibration[id].b)]),
    ) as Record<CompetencyId, number>,
  }));

  const baseline = agreementReport(baselinePairs);
  const calibrated = agreementReport(calibratedPairs);
  return {
    split: { train: train.length, test: test.length, testRatio, disjoint },
    calibration,
    baseline,
    calibrated,
    improvement: {
      totalMae: Number((baseline.totalMae - calibrated.totalMae).toFixed(1)),
      inepAgreement: Number((calibrated.inepAgreement - baseline.inepAgreement).toFixed(3)),
      totalBias: Number((Math.abs(baseline.totalBias) - Math.abs(calibrated.totalBias)).toFixed(1)),
    },
  };
}

/** Agrega revisões repetidas da mesma redação para uma única amostra. */
export function aggregateReviewSamples(
  reviews: { essayId: string; details: { competency: string; aiScore: number; humanScore: number }[] }[],
): HumanLoopSample[] {
  const byEssay = new Map<string, { ai: Record<string, number[]>; human: Record<string, number[]> }>();
  for (const review of reviews) {
    const entry = byEssay.get(review.essayId) ?? { ai: {}, human: {} };
    for (const detail of review.details) {
      if (!COMPETENCY_IDS.includes(detail.competency as CompetencyId)) continue;
      (entry.ai[detail.competency] ??= []).push(detail.aiScore);
      (entry.human[detail.competency] ??= []).push(detail.humanScore);
    }
    byEssay.set(review.essayId, entry);
  }

  const average = (values: number[] | undefined) =>
    values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return [...byEssay.entries()]
    .map(([essayId, entry]) => {
      const ai = {} as Record<CompetencyId, number>;
      const human = {} as Record<CompetencyId, number>;
      for (const id of COMPETENCY_IDS) {
        const aiAverage = average(entry.ai[id]);
        const humanAverage = average(entry.human[id]);
        if (aiAverage === null || humanAverage === null) return null;
        ai[id] = aiAverage;
        human[id] = humanAverage;
      }
      return { essayId, ai, human };
    })
    .filter((sample): sample is HumanLoopSample => sample !== null);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const reviews = await prisma.essayReview.findMany({
      where: {
        validationLevel: { in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] },
        details: { some: {} },
      },
      select: {
        essayId: true,
        details: { select: { competency: true, aiScore: true, humanScore: true } },
      },
    });
    const samples = aggregateReviewSamples(reviews);
    if (samples.length < 2) {
      console.log(`Revisões validadas suficientes para medir: ${samples.length}. Necessário: 2 redações distintas.`);
      console.log('Nenhuma métrica foi inventada. Colete e valide mais revisões humanas antes de rodar a medição held-out.');
      return;
    }
    const report = evaluateHumanLoop(samples, Number(arg('test-ratio') ?? 0.3));
    const output = {
      generatedAt: new Date().toISOString(),
      source: 'essay_reviews.validationLevel=VALIDATED|CONSOLIDATED',
      essays: samples.length,
      ...report,
      note: 'O ajuste usa somente o treino. A nota humana do teste é usada apenas para medir o erro.',
    };
    const text = `${JSON.stringify(output, null, 2)}\n`;
    console.log(text);
    if (arg('write') !== 'false') {
      const dir = join(__dirname, '..', '..', '..', '.cache', 'reports');
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `human-loop-${Date.now()}.json`);
      writeFileSync(path, text);
      console.log(`Relatório gravado em ${path}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
