import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleInsightsService } from './schedule-insights.service';

const userId = 'user';
const schedule = {
  id: 'schedule', userId, objective: 'Passar em Medicina', targetCourse: 'Medicina',
  priorityAreas: ['NATUREZA', 'MATEMATICA'], essayFrequency: null, excludedTopicIds: [] as string[],
  scheduleSubjects: [
    { subjectId: 'ss-math', targetHours: 40, subject: { name: 'Matemática', code: 'MATH' } },
    { subjectId: 'ss-physics', targetHours: 20, subject: { name: 'Física', code: 'PHYSICS' } },
    { subjectId: 'ss-english', targetHours: 10, subject: { name: 'Inglês', code: 'ENGLISH' } },
    { subjectId: 'ss-essay', targetHours: 10, subject: { name: 'Redação', code: 'ESSAY' } },
  ],
};

function setup() {
  const prisma: any = {
    subject: { findMany: vi.fn().mockResolvedValue([{ id: 'qb-math', name: 'Matemática' }, { id: 'qb-physics', name: 'Física' }]) },
    topic: { findMany: vi.fn().mockResolvedValue([]) },
    topicMastery: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    question: { findMany: vi.fn().mockResolvedValue([]) },
    studyTask: { findUnique: vi.fn() },
  };
  const repo: any = {
    findScheduleByUserId: vi.fn().mockResolvedValue(schedule),
    findScheduleById: vi.fn().mockResolvedValue(schedule),
  };
  const schedules: any = { phaseFor: vi.fn().mockResolvedValue('BASE') };
  const questions: any = { findAll: vi.fn().mockResolvedValue({ items: [] }) };
  const cutoffs: any = { targetForUser: vi.fn().mockResolvedValue({ status: 'MISSING_PROFILE', message: '' }) };
  const service = new ScheduleInsightsService(prisma, repo, schedules, questions, cutoffs);
  return { service, prisma, repo, schedules, questions, cutoffs };
}

describe('ScheduleInsightsService.masterySummary (§13)', () => {
  it('conta os conteúdos por status e os que estão com revisão vencida', async () => {
    const { service, prisma } = setup();
    prisma.topic.findMany.mockResolvedValue(
      ['t1', 't2', 't3', 't4', 't5'].map((id) => ({ id, name: id })).concat({ id: 'geral', name: 'Geral' }),
    );
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 5 * 86_400_000);
    prisma.topicMastery.findMany.mockResolvedValue([
      { topicId: 't1', status: 'DOMINADO', nextReviewAt: past },
      { topicId: 't2', status: 'DOMINADO', nextReviewAt: future },
      { topicId: 't3', status: 'APRENDENDO', nextReviewAt: past },
      { topicId: 't4', status: 'PRECISA_REFORCO', nextReviewAt: null },
      // Domínio no tópico-coringa não entra na conta.
      { topicId: 'geral', status: 'DOMINADO', nextReviewAt: past },
    ]);
    expect(await service.masterySummary(userId)).toEqual({
      totalTopics: 5,
      naoEstudados: 1,
      aprendendo: 1,
      praticando: 0,
      dominados: 2,
      precisaReforco: 1,
      paraRevisar: 2,
    });
  });

  it('tópico que o aluno tirou do cronograma sai da conta', async () => {
    const { service, prisma, repo } = setup();
    repo.findScheduleByUserId.mockResolvedValue({ ...schedule, excludedTopicIds: ['t2'] });
    prisma.topic.findMany.mockResolvedValue(['t1', 't2', 't3'].map((id) => ({ id, name: id })));
    prisma.topicMastery.findMany.mockResolvedValue([{ topicId: 't2', status: 'DOMINADO', nextReviewAt: null }]);
    expect(await service.masterySummary(userId)).toMatchObject({ totalTopics: 2, dominados: 0, naoEstudados: 2 });
  });

  it('só olha as matérias do cronograma que têm catálogo de tópicos', async () => {
    const { service, prisma } = setup();
    await service.masterySummary(userId);
    // Redação fica de fora: não é dividida em tópicos.
    expect(prisma.subject.findMany).toHaveBeenCalledWith({ where: { name: { in: ['Matemática', 'Física', 'Inglês'] } } });
  });

  it('sem cronograma não há indicador', async () => {
    const { service, repo } = setup();
    repo.findScheduleByUserId.mockResolvedValue(null);
    expect(await service.masterySummary(userId)).toBeNull();
  });
});

describe('ScheduleInsightsService.topicsBySubject', () => {
  it('lista os tópicos de cada matéria com a situação do aluno e se estão no plano', async () => {
    const { service, prisma, repo } = setup();
    repo.findScheduleByUserId.mockResolvedValue({ ...schedule, excludedTopicIds: ['m-juros'] });
    prisma.topic.findMany.mockResolvedValue([
      { id: 'm-funcoes', subjectId: 'qb-math', name: 'Funções' },
      { id: 'm-geral', subjectId: 'qb-math', name: 'Geral' },
      { id: 'm-juros', subjectId: 'qb-math', name: 'Juros' },
      { id: 'f-ondas', subjectId: 'qb-physics', name: 'Ondas' },
    ]);
    prisma.topicMastery.findMany.mockResolvedValue([
      { topicId: 'm-funcoes', status: 'PRATICANDO', masteryScore: 60, attempts: 5, correctAttempts: 3, nextReviewAt: new Date(Date.now() - 86_400_000) },
    ]);
    prisma.question.findMany.mockResolvedValue([{ topicId: 'm-funcoes' }, { topicId: 'm-funcoes' }, { topicId: 'f-ondas' }]);

    const result = await service.topicsBySubject(userId);
    // Redação não tem tópicos; Inglês não tem Subject neste banco de teste.
    expect(result?.map((s) => [s.subjectName, s.questionBankSubjectId, s.topics.length])).toEqual([
      ['Matemática', 'qb-math', 2],
      ['Física', 'qb-physics', 1],
      ['Inglês', null, 0],
    ]);
    expect(result?.[0].topics).toEqual([
      { id: 'm-funcoes', name: 'Funções', level: null, status: 'PRATICANDO', masteryScore: 60, attempts: 5, correctAttempts: 3, due: true, questionCount: 2, included: true },
      { id: 'm-juros', name: 'Juros', level: null, status: 'NAO_ESTUDADO', masteryScore: 0, attempts: 0, correctAttempts: 0, due: false, questionCount: 0, included: false },
    ]);
  });
});

describe('ScheduleInsightsService.topicsBySubject — trilha', () => {
  it('devolve os tópicos na ordem da trilha, com o nível de cada um', async () => {
    const { service, prisma, repo } = setup();
    repo.findScheduleByUserId.mockResolvedValue({ ...schedule, excludedTopicIds: [] });
    prisma.topic.findMany.mockResolvedValue([
      { id: 'analise', subjectId: 'qb-math', name: 'Análise combinatória' },
      { id: 'afim', subjectId: 'qb-math', name: 'Função afim' },
      { id: 'importado', subjectId: 'qb-math', name: 'Assunto importado' },
      { id: 'fracoes', subjectId: 'qb-math', name: 'Frações' },
    ]);
    prisma.topicMastery.findMany.mockResolvedValue([]);
    prisma.question.findMany.mockResolvedValue([]);

    const result = await service.topicsBySubject(userId);
    expect(result?.[0].topics.map((t) => [t.name, t.level])).toEqual([
      ['Frações', 'BASE'],
      ['Função afim', 'INTERMEDIARIO'],
      ['Análise combinatória', 'AVANCADO'],
      ['Assunto importado', null],
    ]);
  });
});

describe('ScheduleInsightsService.explainTask (§10)', () => {
  const baseTask = {
    id: 'task', scheduleId: 'schedule', subjectId: 'ss-physics', scheduledMinutes: 40,
    title: 'Questões — Ondas', activityType: 'QUESTOES',
    subject: { name: 'Física', code: 'PHYSICS' },
    topic: { id: 'topic-ondas', name: 'Ondas', subjectId: 'qb-physics' },
    session: { date: new Date('2026-10-20') },
    schedule: { userId },
  };

  it('explica com os dados reais de domínio, incidência, área prioritária e fase', async () => {
    const { service, prisma, schedules } = setup();
    prisma.studyTask.findUnique.mockResolvedValue(baseTask);
    prisma.topicMastery.findUnique.mockResolvedValue({
      masteryScore: 35, status: 'APRENDENDO', attempts: 4, correctAttempts: 1,
      lastStudiedAt: new Date('2026-09-25'), nextReviewAt: new Date('2026-10-30'),
    });
    prisma.question.findMany.mockResolvedValue([
      { topicId: 'topic-ondas' }, { topicId: 'topic-ondas' }, { topicId: 'topic-ondas' }, { topicId: 'outro' },
    ]);
    schedules.phaseFor.mockResolvedValue('CONSOLIDACAO');

    const explanation = await service.explainTask(userId, 'task');
    expect(explanation?.reasons).toEqual([
      'Seu domínio nesse tópico está em 35% (aprendendo, 1 acerto(s) em 4 questão(ões)).',
      'É um dos tópicos mais cobrados de Física no banco de questões (3 questões).',
      'Faz 25 dias que você não estuda esse tópico.',
      'Física é de uma área que você marcou como prioritária (Ciências da Natureza).',
      'Física recebe uma fatia do dia proporcional às 20h que você definiu para a matéria.',
      'A atividade é questões porque o tópico já passou da teoria: agora é praticar.',
      'Você está na fase de Consolidação do cronograma: o foco passa para questões e revisão.',
    ]);
    expect(explanation?.context).toContain('Tarefa: "Questões — Ondas" — 40 minutos em 20/10.');
    expect(explanation?.context).toContain('Curso-alvo: Medicina.');
    expect(explanation?.context).toContain('- Seu domínio nesse tópico está em 35%');
  });

  it('leva para a LuminIA a meta de nota do aluno pela nota de corte', async () => {
    const { service, prisma, cutoffs } = setup();
    prisma.studyTask.findUnique.mockResolvedValue(baseTask);
    cutoffs.targetForUser.mockResolvedValue({
      status: 'OK',
      message: 'A nota de corte média de MEDICINA na UFC (2023–2025) foi 802,0: é a média do ENEM que você precisa alcançar.',
    });
    const explanation = await service.explainTask(userId, 'task');
    expect(explanation?.context).toContain('Meta de nota: A nota de corte média de MEDICINA na UFC (2023–2025) foi 802,0');
    expect(explanation?.context).toContain('vai até 1000 por prova');
  });

  it('tópico nunca estudado e revisão vencida viram motivos próprios', async () => {
    const { service, prisma } = setup();
    prisma.studyTask.findUnique.mockResolvedValue({ ...baseTask, activityType: 'TEORIA', title: 'Teoria — Ondas' });
    expect((await service.explainTask(userId, 'task'))?.reasons[0])
      .toBe('Você ainda não estudou esse tópico, e conteúdo nunca visto sobe na fila.');
    // Ondas é de nível intermediário na trilha de Física.
    expect((await service.explainTask(userId, 'task'))?.reasons[1])
      .toBe('Na trilha de Física ele é de nível intermediário: entra depois dos conteúdos de que depende, que já estão no seu cronograma.');
    prisma.studyTask.findUnique.mockResolvedValue({
      ...baseTask, activityType: 'TEORIA', title: 'Teoria — Cinemática', topic: { ...baseTask.topic, name: 'Cinemática' },
    });
    expect((await service.explainTask(userId, 'task'))?.reasons[1])
      .toBe('Ele é da base de Física: vem primeiro porque outros conteúdos da matéria dependem dele.');

    prisma.studyTask.findUnique.mockResolvedValue({ ...baseTask, activityType: 'REVISAO', title: 'Revisão — Ondas' });
    prisma.topicMastery.findUnique.mockResolvedValue({
      masteryScore: 90, status: 'DOMINADO', attempts: 6, correctAttempts: 6,
      lastStudiedAt: new Date('2026-10-13'), nextReviewAt: new Date('2026-10-18'),
    });
    expect((await service.explainTask(userId, 'task'))?.reasons[0])
      .toBe('A revisão espaçada desse tópico venceu em 18/10: revisar agora evita esquecer o que você já estudou.');
  });

  it('redação e matéria sem catálogo têm explicação própria, sem números de domínio', async () => {
    const { service, prisma } = setup();
    prisma.studyTask.findUnique.mockResolvedValue({
      ...baseTask, subjectId: 'ss-essay', activityType: 'REDACAO', title: 'Redação — Repertório',
      subject: { name: 'Redação', code: 'ESSAY' }, topic: null,
    });
    const essay = await service.explainTask(userId, 'task');
    expect(essay?.reasons[0]).toContain('uma atividade por semana');
    expect(essay?.reasons).toHaveLength(2);

    prisma.studyTask.findUnique.mockResolvedValue({
      ...baseTask, subjectId: 'ss-english', title: 'Inglês: estudo programado',
      subject: { name: 'Inglês', code: 'ENGLISH' }, topic: null,
    });
    const english = await service.explainTask(userId, 'task');
    expect(english?.reasons[0]).toContain('ainda não tem catálogo de tópicos');
    expect(prisma.topicMastery.findUnique).not.toHaveBeenCalled();
  });

  it('tarefa de outro aluno não é explicada', async () => {
    const { service, prisma } = setup();
    prisma.studyTask.findUnique.mockResolvedValue({ ...baseTask, schedule: { userId: 'outro' } });
    expect(await service.explainTask(userId, 'task')).toBeNull();
  });
});

describe('ScheduleInsightsService.diagnostic (§11)', () => {
  const question = (id: string, topicId: string, attempts = 0) => ({ id, topicId, topic: topicId, progress: attempts ? { attempts } : null });

  it('monta até 5 questões por área, de tópicos diferentes e ainda não respondidas', async () => {
    const { service, questions } = setup();
    questions.findAll.mockImplementation((_user: string, query: { subjectId: string }) =>
      Promise.resolve({
        items:
          query.subjectId === 'qb-math'
            ? [
                question('m1', 'porcentagem'), question('m2', 'porcentagem'), question('m3', 'funcoes', 2),
                question('m4', 'geometria'), question('m5', 'probabilidade'), question('m6', 'juros'),
                question('m7', 'matrizes'), question('m8', 'conjuntos'),
              ]
            : [question('f1', 'ondas'), question('f2', 'ondas'), question('f3', 'optica')],
      }),
    );

    const result = await service.diagnostic(userId);
    expect(result?.recommended).toBe(true);
    expect(result?.areas.map((a) => [a.label, a.questions.map((q) => q.id)])).toEqual([
      // m2 repete o tópico de m1 e m3 já foi respondida.
      ['Matemática', ['m1', 'm4', 'm5', 'm6', 'm7']],
      ['Ciências da Natureza', ['f1', 'f3']],
    ]);
  });

  it('não é recomendado para quem já tem domínio registrado', async () => {
    const { service, prisma, questions } = setup();
    prisma.topicMastery.count.mockResolvedValue(3);
    questions.findAll.mockResolvedValue({ items: [question('m1', 'porcentagem')] });
    expect((await service.diagnostic(userId))?.recommended).toBe(false);
  });
});
