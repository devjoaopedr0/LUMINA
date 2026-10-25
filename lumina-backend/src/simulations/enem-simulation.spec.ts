import { beforeEach, describe, expect, it, vi } from 'vitest';
import { triScore } from '../schedules/enem-tri';
import { ENEM_AREA_NAME, ENEM_DAYS, pickEnemQuestions, type EnemCandidate } from './enem-simulation';
import { EnemSimulationService } from './enem-simulation.service';

const candidates = (subject: string, count: number, answered = false): EnemCandidate[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${subject}-${answered ? 'a' : 'n'}${i}`, subject, answered }));

describe('questões do simulado ENEM', () => {
  it('as matérias se revezam e o resultado vem agrupado por matéria', () => {
    const picked = pickEnemQuestions([...candidates('Biologia', 40), ...candidates('Física', 40), ...candidates('Química', 40)]);
    expect(picked).toHaveLength(45);
    const count = (subject: string) => picked.filter((q) => q.subject === subject).length;
    expect([count('Biologia'), count('Física'), count('Química')]).toEqual([15, 15, 15]);
    expect(picked.map((q) => q.subject)).toEqual([...picked.map((q) => q.subject)].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('matéria com poucas questões entra inteira e as outras completam', () => {
    const picked = pickEnemQuestions([...candidates('Filosofia', 5), ...candidates('História', 60)]);
    expect(picked.filter((q) => q.subject === 'Filosofia')).toHaveLength(5);
    expect(picked.filter((q) => q.subject === 'História')).toHaveLength(40);
  });

  it('questão nunca respondida vem antes da já respondida', () => {
    const picked = pickEnemQuestions([...candidates('Matemática', 30, true), ...candidates('Matemática', 30, false)], 30);
    expect(picked.every((q) => !q.answered)).toBe(true);
  });

  it('o sorteio muda a prova; com menos questões que o pedido, devolve o que há', () => {
    const pool = candidates('Matemática', 60);
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const first = pickEnemQuestions(pool, 45, random).map((q) => q.id);
    const second = pickEnemQuestions(pool, 45, random).map((q) => q.id);
    expect(first).not.toEqual(second);
    expect(pickEnemQuestions(candidates('Matemática', 12))).toHaveLength(12);
  });
});

describe('EnemSimulationService', () => {
  const userId = 'user';
  let prisma: any;
  let simulations: any;
  let service: EnemSimulationService;
  let calibration: any;
  const question = (id: string, subject: string) => ({
    id, subject, subjectRef: { name: subject },
    alternatives: [1, 2, 3, 4].map((position) => ({ position, isCorrect: position === 1 })),
  });
  const bank: Record<string, any[]> = {
    Biologia: Array.from({ length: 30 }, (_, i) => question(`bio${i}`, 'Biologia')),
    Física: Array.from({ length: 30 }, (_, i) => question(`fis${i}`, 'Física')),
    Matemática: Array.from({ length: 50 }, (_, i) => question(`mat${i}`, 'Matemática')),
  };

  beforeEach(() => {
    prisma = {
      question: { findMany: vi.fn(({ where }: any) => Promise.resolve(
        where.OR ? where.OR[0].subjectRef.name.in.flatMap((name: string) => bank[name] ?? []) : [],
      )) },
      questionAttempt: { findMany: vi.fn().mockResolvedValue([]) },
      simulation: { update: vi.fn() },
      simulationItem: { updateMany: vi.fn() },
      simulationSubmission: { findUnique: vi.fn() },
    };
    const access: any = {
      getPersonalWorkspace: vi.fn().mockResolvedValue({ id: 'personal' }),
      getBankWorkspace: vi.fn().mockResolvedValue({ id: 'bank' }),
    };
    simulations = { create: vi.fn().mockResolvedValue({ id: 'simulation' }) };
    calibration = { offsets: vi.fn().mockResolvedValue(new Map()) };
    service = new EnemSimulationService(prisma, access, simulations, calibration);
  });

  it('2º dia: 45 de Natureza e 45 de Matemática, com o tempo oficial e a área em cada questão', async () => {
    expect(await service.create(userId, 2)).toEqual({ simulationId: 'simulation' });

    const [creator, title, ids, classId, type, dueAt, minutes, realExam] = simulations.create.mock.calls[0];
    expect([creator, title, classId, type, dueAt, minutes, realExam]).toEqual([
      userId, ENEM_DAYS[2].title, undefined, 'SIMULATION', undefined, 300, false,
    ]);
    expect(ids).toHaveLength(90);
    expect(new Set(ids).size).toBe(90);
    // Natureza primeiro, depois Matemática — a ordem das áreas no dia de prova.
    expect(ids.slice(0, 45).every((id: string) => /^(bio|fis)/.test(id))).toBe(true);
    expect(ids.slice(45).every((id: string) => id.startsWith('mat'))).toBe(true);

    expect(prisma.simulation.update).toHaveBeenCalledWith({ where: { id: 'simulation' }, data: { enemDay: 2 } });
    expect(prisma.simulationItem.updateMany.mock.calls.map((call: any[]) => call[0].data.area)).toEqual([
      ENEM_AREA_NAME.NATUREZA, ENEM_AREA_NAME.MATEMATICA,
    ]);
  });

  it('sem 45 questões numa área, avisa em vez de montar prova incompleta', async () => {
    await expect(service.create(userId, 1)).rejects.toThrow('o simulado modelo ENEM precisa de 45 por área');
    expect(simulations.create).not.toHaveBeenCalled();
  });

  it('o resultado traz a nota estilo TRI de cada área e a média; questão em branco conta como erro', async () => {
    const items = [
      ...Array.from({ length: 45 }, (_, i) => ({ position: i + 1, correctPosition: 1, questionId: `bio${i}`, subject: 'Biologia', area: ENEM_AREA_NAME.NATUREZA, alternatives: [{}, {}, {}, {}] })),
      ...Array.from({ length: 45 }, (_, i) => ({ position: i + 46, correctPosition: 1, questionId: `mat${i}`, subject: 'Matemática', area: ENEM_AREA_NAME.MATEMATICA, alternatives: [{}, {}, {}, {}] })),
    ];
    // Natureza: 30 certas, 10 erradas, 5 em branco. Matemática: 20 certas, 25 erradas.
    const selected = (position: number) =>
      position <= 30 ? 1 : position <= 40 ? 2 : position <= 45 ? 0 : position <= 65 ? 1 : 3;
    prisma.simulationSubmission.findUnique.mockResolvedValue({
      answers: items.map((item) => ({ position: item.position, selectedPosition: selected(item.position) })),
      simulation: { enemDay: 2, items },
    });
    prisma.question.findMany.mockResolvedValue(items.map((item) => ({ id: item.questionId, difficulty: 'MEDIA' })));

    const tri = await service.triForSubmission(userId, 'simulation');
    const answers = (correct: number) => Array.from({ length: 45 }, (_, i) => ({ isCorrect: i < correct, difficulty: 'MEDIA' as const, alternatives: 4 }));
    const natureza = triScore('NATUREZA', answers(30));
    const matematica = triScore('MATEMATICA', answers(20));
    expect(tri?.areas).toEqual([
      { area: 'NATUREZA', label: 'Ciências da Natureza', correct: 30, total: 45, ...natureza, lowConfidence: false },
      { area: 'MATEMATICA', label: 'Matemática', correct: 20, total: 45, ...matematica, lowConfidence: false },
    ]);
    expect(tri?.average).toBe(Math.round((natureza.score + matematica.score) / 2));
    expect(tri?.enemDay).toBe(2);
  });

  it('simulado comum também tem nota por área, sem média e marcada como indicativa se for curto', async () => {
    prisma.simulationSubmission.findUnique.mockResolvedValue({
      answers: [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 2 }],
      simulation: { enemDay: null, items: [
        { position: 1, correctPosition: 1, questionId: 'q1', subject: 'História', area: null, alternatives: [{}, {}, {}, {}] },
        { position: 2, correctPosition: 1, questionId: 'q2', subject: 'História', area: null, alternatives: [{}, {}, {}, {}] },
      ] },
    });
    prisma.question.findMany.mockResolvedValue([{ id: 'q1', difficulty: 'FACIL' }, { id: 'q2', difficulty: 'DIFICIL' }]);
    const tri = await service.triForSubmission(userId, 'simulation');
    expect(tri).toMatchObject({ enemDay: null, average: null });
    expect(tri?.areas[0]).toMatchObject({ area: 'HUMANAS', correct: 1, total: 2, lowConfidence: true });

    prisma.simulationSubmission.findUnique.mockResolvedValue(null);
    expect(await service.triForSubmission(userId, 'outro')).toBeNull();
  });

  it('a nota usa a dificuldade calibrada pelo acerto dos alunos', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ position: i + 1, correctPosition: 1, questionId: `q${i}`, subject: 'História', area: null, alternatives: [{}, {}, {}, {}] }));
    prisma.simulationSubmission.findUnique.mockResolvedValue({
      answers: items.map((item) => ({ position: item.position, selectedPosition: item.position <= 5 ? 1 : 2 })),
      simulation: { enemDay: null, items },
    });
    prisma.question.findMany.mockResolvedValue(items.map((item) => ({ id: item.questionId, difficulty: 'MEDIA' })));
    const plain = (await service.triForSubmission(userId, 'simulation'))!.areas[0].score;

    // As 5 que ele errou se revelaram mais difíceis do que o nível dizia:
    // errar questão difícil custa menos.
    calibration.offsets.mockResolvedValue(new Map(['q5', 'q6', 'q7', 'q8', 'q9'].map((id) => [id, 0.8])));
    const calibrated = (await service.triForSubmission(userId, 'simulation'))!.areas[0].score;
    expect(calibration.offsets).toHaveBeenCalledWith(items.map((item) => item.questionId));
    expect(calibrated).toBeGreaterThan(plain);
  });
});
