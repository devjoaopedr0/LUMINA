import { describe, expect, it, vi } from 'vitest';
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

  it('o acerto posiciona o aluno entre o piso e o teto da área', () => {
    const { min, max } = AREA_SCALE.MATEMATICA;
    expect(estimateArea('MATEMATICA', answers(0, 20)).estimate).toBe(min);
    expect(estimateArea('MATEMATICA', answers(20, 0)).estimate).toBe(max);
    expect(estimateArea('MATEMATICA', answers(10, 10)).estimate).toBe((min + max) / 2);
    // A mesma taxa de acerto vale notas diferentes em áreas diferentes.
    expect(estimateArea('LINGUAGENS', answers(10, 10)).estimate).toBe(555);
  });

  it('acertar questão difícil vale mais que acertar fácil', () => {
    const hardRight = [...answers(5, 0, 'DIFICIL'), ...answers(0, 5, 'FACIL')];
    const easyRight = [...answers(5, 0, 'FACIL'), ...answers(0, 5, 'DIFICIL')];
    const hard = estimateArea('NATUREZA', hardRight);
    const easy = estimateArea('NATUREZA', easyRight);
    expect(hard.accuracy).toBe(easy.accuracy);
    expect(hard.estimate!).toBeGreaterThan(easy.estimate!);
  });

  it('a faixa estreita com mais questões e não passa do piso nem do teto', () => {
    const few = estimateArea('HUMANAS', answers(5, 5));
    const many = estimateArea('HUMANAS', answers(50, 50));
    expect(few.high! - few.low!).toBeGreaterThan(many.high! - many.low!);
    expect(many.high! - many.low!).toBe(70);
    expect(estimateArea('HUMANAS', answers(20, 0)).high).toBe(AREA_SCALE.HUMANAS.max);
    expect(estimateArea('HUMANAS', answers(0, 20)).low).toBe(AREA_SCALE.HUMANAS.min);
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
    // Matemática 640, Linguagens 555, redação 750.
    expect(estimate.essay).toEqual({ score: 750, corrections: 2 });
    expect(estimate.average).toMatchObject({ estimate: 648, parts: 3, complete: false });
    expect(estimate.average!.low).toBeLessThan(648);
    expect(estimate.average!.high).toBeGreaterThan(648);
    expect(estimate.gap).toBe(83.3);
    expect(estimate.message).toContain('em torno de 648');
    expect(estimate.message).toContain('(com 3 das 5 notas)');
    expect(estimate.message).toContain('Faltam cerca de 83 pontos para a meta de 731.3');
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
      essayCorrection: { findMany: vi.fn().mockResolvedValue([{ totalScore: 760 }]) },
      question: { findMany: vi.fn(({ where }: any) => Promise.resolve(
        where.id.in.map((id: string) => ({ id, difficulty: 'MEDIA', subject: 'Matemática', subjectRef: { name: 'Matemática' } })),
      )) },
    };
    const cutoffs: any = { targetForUser: vi.fn().mockResolvedValue({ status: 'MISSING_PROFILE', targetScore: null }) };

    const estimate = await new ScoreEstimateService(prisma, cutoffs).forUser('user');
    const math = estimate.areas.find((area) => area.area === 'MATEMATICA')!;
    expect(math).toMatchObject({ answered: 10, correct: 9, missing: 0 });
    expect(math.estimate).toBe(896);
    expect(estimate.essay.score).toBe(760);
    // Só uma área estimada: ainda sem média.
    expect(estimate.average).toBeNull();
    expect(estimate.target).toBeNull();
  });
});
