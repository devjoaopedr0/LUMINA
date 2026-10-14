import { describe, expect, it, vi } from 'vitest';
import { triScore } from './enem-tri';
import { AREA_SCALE, buildScoreEstimate, estimateArea, type AreaAnswer } from './score-estimate';
import { ScoreEstimateService } from './score-estimate.service';
import { STUDY_AREA_LABEL } from './study-areas';

const answers = (correct: number, wrong: number, difficulty = 'MEDIA'): AreaAnswer[] => [
  ...Array.from({ length: correct }, () => ({ isCorrect: true, difficulty }) as AreaAnswer),
  ...Array.from({ length: wrong }, () => ({ isCorrect: false, difficulty }) as AreaAnswer),
];
const target = { score: 731.3, course: 'MEDICINA', university: 'UFC', year: 2026 };

describe('estimativa de nota por área', () => {
  it('com poucas questões não estima: diz quantas faltam', () => {
    expect(estimateArea('MATEMATICA', answers(4, 2))).toMatchObject({
      answered: 6, correct: 4, accuracy: 67, estimate: null, low: null, high: null, missing: 4,
    });
  });

  it('a nota da área é a nota estilo TRI das respostas', () => {
    const half = answers(10, 10);
    const tri = triScore('MATEMATICA', half);
    expect(estimateArea('MATEMATICA', half)).toMatchObject({
      estimate: tri.score, low: tri.low, high: tri.high, answered: 20, correct: 10, accuracy: 50,
    });
    // Mais acertos, mais nota — dentro do piso e do teto da área.
    const scores = [answers(0, 20), half, answers(20, 0)].map((items) => estimateArea('MATEMATICA', items).estimate!);
    expect(scores[0]).toBeLessThan(scores[1]);
    expect(scores[1]).toBeLessThan(scores[2]);
    expect(scores[0]).toBeGreaterThanOrEqual(AREA_SCALE.MATEMATICA.min);
    expect(scores[2]).toBeLessThanOrEqual(AREA_SCALE.MATEMATICA.max);
    // A mesma taxa de acerto vale mais em Matemática que em Linguagens, como na prova.
    expect(scores[1]).toBeGreaterThan(estimateArea('LINGUAGENS', half).estimate!);
  });

  it('coerência conta: acertar as difíceis errando as fáceis vale menos que o contrário', () => {
    const incoherent = [...answers(5, 0, 'DIFICIL'), ...answers(0, 5, 'FACIL')];
    const coherent = [...answers(5, 0, 'FACIL'), ...answers(0, 5, 'DIFICIL')];
    expect(estimateArea('NATUREZA', incoherent).accuracy).toBe(estimateArea('NATUREZA', coherent).accuracy);
    expect(estimateArea('NATUREZA', coherent).estimate!).toBeGreaterThan(estimateArea('NATUREZA', incoherent).estimate!);
    // E acertar questão difícil vale mais que acertar a mesma quantidade de fáceis.
    expect(estimateArea('NATUREZA', answers(8, 2, 'DIFICIL')).estimate!)
      .toBeGreaterThan(estimateArea('NATUREZA', answers(8, 2, 'FACIL')).estimate!);
  });

  it('a faixa estreita com mais questões', () => {
    const few = estimateArea('HUMANAS', answers(5, 5));
    const many = estimateArea('HUMANAS', answers(45, 45));
    expect(few.low!).toBeLessThan(few.estimate!);
    expect(few.high!).toBeGreaterThan(few.estimate!);
    expect(few.high! - few.low!).toBeGreaterThan(many.high! - many.low!);
  });
});

describe('estimativa da média', () => {
  const build = (answersByArea: Record<string, AreaAnswer[]>, essayScores: number[] = [], withTarget = true) =>
    buildScoreEstimate({ answersByArea, areaLabels: STUDY_AREA_LABEL, essayScores, target: withTarget ? target : null });

  it('sem duas áreas com questões suficientes não há média — e a mensagem diz o que falta', () => {
    const estimate = build({ MATEMATICA: answers(10, 10), NATUREZA: answers(3, 0) });
    expect(estimate.average).toBeNull();
    expect(estimate.gap).toBeNull();
    expect(estimate.message).toContain('Ainda não dá para estimar');
    expect(estimate.message).toContain('7 em Ciências da Natureza');
    expect(estimate.message).toContain('10 em Linguagens');
  });

  it('a média junta as áreas estimadas e a redação, e diz quantas notas entraram', () => {
    const estimate = build({ MATEMATICA: answers(10, 10), LINGUAGENS: answers(10, 10) }, [800, 700]);
    // Média de Matemática, Linguagens e redação (750).
    const expected = Math.round(
      (triScore('MATEMATICA', answers(10, 10)).score + triScore('LINGUAGENS', answers(10, 10)).score + 750) / 3,
    );
    expect(estimate.essay).toEqual({ score: 750, corrections: 2 });
    expect(estimate.average).toMatchObject({ estimate: expected, parts: 3, complete: false });
    expect(estimate.average!.low).toBeLessThan(expected);
    expect(estimate.average!.high).toBeGreaterThan(expected);
    expect(estimate.gap).toBe(Math.round((731.3 - expected) * 10) / 10);
    expect(estimate.message).toContain('em torno de ' + expected);
    expect(estimate.message).toContain('(com 3 das 5 notas)');
    expect(estimate.message).toContain('Faltam cerca de ' + Math.round(731.3 - expected) + ' pontos para a meta de 731.3');
  });

  it('com as quatro áreas e a redação a média é completa; acima da meta, diz que alcança', () => {
    const all = { MATEMATICA: answers(20, 0), LINGUAGENS: answers(20, 0), HUMANAS: answers(20, 0), NATUREZA: answers(20, 0) };
    const estimate = build(all, [900]);
    expect(estimate.average).toMatchObject({ parts: 5, complete: true });
    expect(estimate.gap).toBeLessThan(0);
    expect(estimate.message).toContain('já alcança a meta');
    expect(estimate.message).not.toContain('das 5 notas');
  });

  it('sem meta do Sisu, estima sem comparar', () => {
    const estimate = build({ MATEMATICA: answers(10, 10), LINGUAGENS: answers(10, 10) }, [], false);
    expect(estimate.gap).toBeNull();
    expect(estimate.message).not.toContain('meta');
  });
});

describe('ScoreEstimateService', () => {
  it('cada questão conta uma vez, pela primeira resposta, somando avulsas e simulados', async () => {
    const at = (day: number) => new Date(Date.now() - day * 86_400_000);
    const mathIds = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const prisma: any = {
      questionAttempt: { findMany: vi.fn().mockResolvedValue([
        // m0: errou primeiro, acertou depois — vale o erro.
        { questionId: 'm0', isCorrect: false, createdAt: at(9) },
        { questionId: 'm0', isCorrect: true, createdAt: at(2) },
        ...mathIds.slice(1, 6).map((questionId) => ({ questionId, isCorrect: true, createdAt: at(5) })),
      ]) },
      simulationSubmission: { findMany: vi.fn().mockResolvedValue([{
        submittedAt: at(1),
        answers: mathIds.slice(6).map((_, i) => ({ position: i + 1, selectedPosition: 1 })).concat({ position: 9, selectedPosition: 2 }),
        simulation: { items: [
          ...mathIds.slice(6).map((questionId, i) => ({ position: i + 1, correctPosition: 1, questionId })),
          // Já respondida antes como avulsa: a do simulado não conta de novo.
          { position: 9, correctPosition: 1, questionId: 'm1' },
        ] },
      }]) },
      essayCorrection: { findMany: vi.fn().mockResolvedValue([{ totalScore: 760, updatedAt: at(3) }]) },
      question: { findMany: vi.fn(({ where }: any) => Promise.resolve(
        where.id.in.map((id: string) => ({ id, difficulty: 'MEDIA', subject: 'Matemática', subjectRef: { name: 'Matemática' } })),
      )) },
    };
    const cutoffs: any = { targetForUser: vi.fn().mockResolvedValue({ status: 'MISSING_PROFILE', targetScore: null }) };

    const estimate = await new ScoreEstimateService(prisma, cutoffs).forUser('user');
    const math = estimate.areas.find((area) => area.area === 'MATEMATICA')!;
    expect(math).toMatchObject({ answered: 10, correct: 9, missing: 0 });
    expect(math.estimate).toBe(triScore('MATEMATICA', answers(9, 1)).score);
    expect(estimate.essay.score).toBe(760);
    // Só uma área estimada: ainda sem média.
    expect(estimate.average).toBeNull();
    expect(estimate.target).toBeNull();
  });

  it('a evolução recalcula a estimativa ao fim de cada semana, pelas datas das respostas', async () => {
    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * 86_400_000);
    const block = (prefix: string, subject: string, correct: number, wrong: number, days: number) =>
      Array.from({ length: correct + wrong }, (_, i) => ({
        questionId: `${prefix}${i}`, isCorrect: i < correct, createdAt: daysAgo(days), subject,
      }));
    // Há 5 semanas: Matemática e Linguagens pela metade. Há 2 dias: mais acertos em Matemática.
    const attempts = [
      ...block('m', 'Matemática', 5, 5, 35),
      ...block('l', 'Língua Portuguesa', 5, 5, 35),
      ...block('n', 'Matemática', 10, 0, 2),
    ];
    const subjectOf = new Map(attempts.map((a) => [a.questionId, a.subject]));
    const prisma: any = {
      questionAttempt: { findMany: vi.fn().mockResolvedValue(attempts) },
      simulationSubmission: { findMany: vi.fn().mockResolvedValue([]) },
      essayCorrection: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn(({ where }: any) => Promise.resolve(
        where.id.in.map((id: string) => ({ id, difficulty: 'MEDIA', subject: subjectOf.get(id), subjectRef: null })),
      )) },
    };
    const cutoffs: any = { targetForUser: vi.fn().mockResolvedValue({ status: 'MISSING_PROFILE', targetScore: null }) };

    const history = await new ScoreEstimateService(prisma, cutoffs).history('user', 8);
    expect(history).toHaveLength(8);
    // Semanas em ordem, de domingo a sábado.
    expect(new Date(`${history[0].weekStart}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(new Date(`${history[7].weekEnd}T00:00:00Z`).getUTCDay()).toBe(6);
    // Antes das primeiras respostas não há estimativa.
    expect(history[0].estimate).toBeNull();
    // Depois delas: média de Matemática e Linguagens pela metade (2 das 5 notas).
    const middle = history.filter((point) => point.estimate !== null)[0];
    expect(middle).toMatchObject({
      estimate: Math.round((triScore('MATEMATICA', answers(5, 5)).score + triScore('LINGUAGENS', answers(5, 5)).score) / 2),
      parts: 2,
    });
    // Nesta semana Matemática subiu, e a média junto.
    expect(history[7].estimate!).toBeGreaterThan(middle.estimate!);
  });
});
