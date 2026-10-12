import { TopicMasteryStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleGeneratorService } from './schedule-generator.service';

const userId = 'user-1';
const session = { id: 'session-1', scheduleId: 'schedule-1', date: new Date('2026-09-30'), scheduledMinutes: 60 };

function mathStudySubject(overrides: Partial<{ subjectId: string; targetHours: number }> = {}) {
  return {
    subjectId: 'study-subject-math',
    targetHours: 10,
    subject: { name: 'Matemática', code: 'MATH' },
    ...overrides,
  };
}

describe('ScheduleGeneratorService.buildTasksForSession', () => {
  it('sem matérias no cronograma não gera nada', async () => {
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [], {} as never);
    expect(tasks).toEqual([]);
  });

  it('sessão sem minutos não gera nada', async () => {
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession({ ...session, scheduledMinutes: 0 }, userId, [mathStudySubject()], {} as never);
    expect(tasks).toEqual([]);
  });

  it('matéria sem catálogo de tópicos (ex.: Inglês) recebe uma tarefa genérica proporcional', async () => {
    const db: any = { subject: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new ScheduleGeneratorService({} as never);
    const englishSubject = { subjectId: 'study-subject-english', targetHours: 10, subject: { name: 'Inglês', code: 'ENGLISH' } };
    const tasks = await service.buildTasksForSession(session, userId, [englishSubject], db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      subjectId: 'study-subject-english',
      topicId: null,
      activityType: 'QUESTOES',
      title: 'Inglês: estudo programado',
      scheduledMinutes: 60,
    });
  });

  it('tópico nunca estudado vira tarefa de Teoria', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([{ id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' }]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      subjectId: 'study-subject-math',
      topicId: 'topic-funcoes',
      activityType: 'TEORIA',
      title: 'Teoria — Funções',
      scheduledMinutes: 40,
    });
  });

  it('tópico dominado sem revisão vencida não entra na fila', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([{ id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' }]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([
        { topicId: 'topic-funcoes', masteryScore: 90, status: TopicMasteryStatus.DOMINADO, lastStudiedAt: new Date('2026-09-29'), nextReviewAt: new Date('2026-10-05') },
      ]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks).toEqual([]);
  });

  it('revisão vencida entra antes da fila normal e consome o orçamento primeiro', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([
        { id: 'topic-funcoes', subjectId: 'qb-math', name: 'Funções' },
        { id: 'topic-geometria', subjectId: 'qb-math', name: 'Geometria' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([
        { topicId: 'topic-funcoes', masteryScore: 90, status: TopicMasteryStatus.DOMINADO, lastStudiedAt: new Date('2026-09-20'), nextReviewAt: new Date('2026-09-29') },
      ]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks[0]).toMatchObject({ topicId: 'topic-funcoes', activityType: 'REVISAO', scheduledMinutes: 20 });
    expect(tasks[1]).toMatchObject({ topicId: 'topic-geometria', activityType: 'TEORIA' });
  });

  it('tópico com mais questões no banco (maior incidência) vem antes na fila', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([
        { id: 'topic-raro', subjectId: 'qb-math', name: 'Assunto raro' },
        { id: 'topic-comum', subjectId: 'qb-math', name: 'Assunto muito cobrado' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([
        { subjectId: 'qb-math', topicId: 'topic-comum' },
        { subjectId: 'qb-math', topicId: 'topic-comum' },
        { subjectId: 'qb-math', topicId: 'topic-comum' },
      ]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks[0].topicId).toBe('topic-comum');
    expect(tasks[1].topicId).toBe('topic-raro');
  });

  it('toda matéria do cronograma recebe a sua fatia, mesmo com prioridade menor', async () => {
    // Matemática tem mais horas-alvo e mais questões (prioridade maior em
    // todos os tópicos); ainda assim Física não pode ficar sem tempo.
    const subjects: Record<string, { id: string; name: string }> = {
      'Matemática': { id: 'qb-math', name: 'Matemática' },
      'Física': { id: 'qb-physics', name: 'Física' },
    };
    const db: any = {
      subject: { findUnique: vi.fn(({ where }: any) => Promise.resolve(subjects[where.name] ?? null)) },
      topic: { findMany: vi.fn().mockResolvedValue([
        ...Array.from({ length: 5 }, (_, i) => ({ id: `math-${i}`, subjectId: 'qb-math', name: `Matemática ${i}` })),
        { id: 'physics-0', subjectId: 'qb-physics', name: 'Ondas' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ subjectId: 'qb-math', topicId: `math-${i}` })),
      ) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(
      { ...session, scheduledMinutes: 120 },
      userId,
      [
        mathStudySubject({ targetHours: 40 }),
        { subjectId: 'study-subject-physics', targetHours: 20, subject: { name: 'Física', code: 'PHYSICS' } },
      ],
      db,
    );
    const minutesBySubject = new Map<string, number>();
    for (const t of tasks) {
      minutesBySubject.set(t.subjectId as string, (minutesBySubject.get(t.subjectId as string) ?? 0) + (t.scheduledMinutes as number));
    }
    expect(minutesBySubject.get('study-subject-math')).toBe(80);
    expect(minutesBySubject.get('study-subject-physics')).toBe(40);
  });

  it('tópico já agendado num dia vizinho perde a vez para os que ainda não apareceram', async () => {
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue([
        { id: 'topic-comum', subjectId: 'qb-math', name: 'Assunto muito cobrado' },
        { id: 'topic-raro', subjectId: 'qb-math', name: 'Assunto raro' },
      ]) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([{ topicId: 'topic-comum' }]) },
      question: { findMany: vi.fn().mockResolvedValue([
        { subjectId: 'qb-math', topicId: 'topic-comum' },
        { subjectId: 'qb-math', topicId: 'topic-comum' },
      ]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    expect(tasks.map((t) => t.topicId)).toEqual(['topic-raro', 'topic-comum']);
  });

  describe('revezamento de matérias quando não cabem todas no dia', () => {
    const codes = ['MATH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'HISTORY', 'GEOGRAPHY'];
    const names = ['Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia'];
    const subjects = codes.map((code, i) => ({
      subjectId: `ss-${code}`, targetHours: 10, subject: { name: names[i], code },
    }));
    function db(received: Record<string, number> = {}) {
      return {
        subject: { findUnique: vi.fn(({ where }: any) => Promise.resolve({ id: `qb-${where.name}`, name: where.name })) },
        topic: { findMany: vi.fn(({ where }: any) => Promise.resolve(
          where.subjectId.in.flatMap((subjectId: string) => [1, 2, 3].map((n) => ({ id: `${subjectId}-${n}`, subjectId, name: `${subjectId} ${n}` }))),
        )) },
        topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
        // A mesma consulta serve às duas perguntas do gerador: quanto cada
        // matéria já recebeu (subjectId + minutos) e que tópicos estão perto.
        studyTask: { findMany: vi.fn().mockResolvedValue(
          Object.entries(received).map(([subjectId, scheduledMinutes]) => ({ subjectId, scheduledMinutes, topicId: null, activityType: 'TEORIA' })),
        ) },
        question: { findMany: vi.fn().mockResolvedValue([]) },
      } as any;
    }
    const run = (database: any, scheduledMinutes = 120) =>
      new ScheduleGeneratorService({} as never).buildTasksForSession({ ...session, scheduledMinutes }, userId, subjects, database);
    const subjectsOf = (tasks: any[]) => [...new Set(tasks.map((t) => t.subjectId))];

    it('seis matérias em 2h: entram quatro, com bloco inteiro, e nenhuma tarefa picada', async () => {
      const tasks = await run(db());
      expect(subjectsOf(tasks)).toHaveLength(4);
      expect(tasks.every((t) => (t.scheduledMinutes as number) >= 30)).toBe(true);
      expect(tasks.reduce((s, t) => s + (t.scheduledMinutes as number), 0)).toBe(120);
    });

    it('no dia seguinte entram primeiro as que ficaram de fora', async () => {
      const first = subjectsOf(await run(db()));
      const left = subjects.map((s) => s.subjectId).filter((id) => !first.includes(id));
      const second = subjectsOf(await run(db(Object.fromEntries(first.map((id) => [id, 30])))));
      expect(second).toEqual(expect.arrayContaining(left));
    });

    it('quando cabem todas, entram todas (sem consultar o histórico)', async () => {
      const database = db();
      const tasks = await run(database, 180);
      expect(subjectsOf(tasks)).toHaveLength(6);
      expect(database.studyTask.findMany).toHaveBeenCalledTimes(1);
    });

    it('matéria que já está no dia (tarefa trazida de outro dia) não ganha o resto dele', async () => {
      // Replanejamento: 40min de Matemática já estão no dia; sobram 80min,
      // que cabem a duas OUTRAS matérias.
      const tasks = await new ScheduleGeneratorService({} as never).buildTasksForSession(
        { ...session, scheduledMinutes: 120, occupiedMinutes: 40, occupiedBySubject: { 'ss-MATH': 40 } },
        userId, subjects, db(),
      );
      expect(subjectsOf(tasks)).toHaveLength(2);
      expect(subjectsOf(tasks)).not.toContain('ss-MATH');
    });

    it('com pesos muito diferentes, a matéria menor ainda recebe um bloco inteiro', async () => {
      // 1h para duas matérias, 75h contra 30h: a proporção pura daria 42 e 17.
      const pair = [
        { subjectId: 'ss-BIOLOGY', targetHours: 75, subject: { name: 'Biologia', code: 'BIOLOGY' } },
        { subjectId: 'ss-ARTS', targetHours: 30, subject: { name: 'Artes', code: 'ARTS' } },
      ];
      const tasks = await new ScheduleGeneratorService({} as never)
        .buildTasksForSession({ ...session, scheduledMinutes: 60 }, userId, pair, db());
      const minutes = (id: string) => tasks.filter((t) => t.subjectId === id).reduce((s, t) => s + (t.scheduledMinutes as number), 0);
      expect(minutes('ss-ARTS')).toBe(30);
      expect(minutes('ss-BIOLOGY')).toBe(30);
    });

    it('matéria com mais horas-alvo aparece em mais dias', async () => {
      const weighted = subjects.map((s, i) => (i === 0 ? { ...s, targetHours: 40 } : s));
      const received: Record<string, number> = {};
      const days: Record<string, number> = {};
      for (let day = 0; day < 6; day++) {
        const tasks = await new ScheduleGeneratorService({} as never)
          .buildTasksForSession({ ...session, scheduledMinutes: 60 }, userId, weighted, db(received));
        for (const task of tasks) {
          received[task.subjectId as string] = (received[task.subjectId as string] ?? 0) + (task.scheduledMinutes as number);
        }
        for (const id of subjectsOf(tasks)) days[id as string] = (days[id as string] ?? 0) + 1;
      }
      // Em seis dias de 1h (duas matérias por dia): Matemática, com 40 das 90
      // horas, entra em bem mais dias que cada uma das outras.
      expect(days['ss-MATH']).toBeGreaterThanOrEqual(4);
      expect(Math.max(...codes.slice(1).map((code) => days[`ss-${code}`] ?? 0))).toBeLessThanOrEqual(2);
      expect(Object.keys(days)).toHaveLength(6);
    });
  });

  describe('fases da reta e revisão espaçada (fase 3)', () => {
    const topic = (id: string) => ({ id, subjectId: 'qb-math', name: id });
    const mastery = (topicId: string, overrides: Record<string, unknown> = {}) => ({
      topicId, masteryScore: 20, status: TopicMasteryStatus.APRENDENDO,
      lastStudiedAt: new Date('2026-09-29'), nextReviewAt: new Date('2026-10-20'), ...overrides,
    });
    function mathDb(topics: any[], masteries: any[], nearbyTasks: any[] = []) {
      return {
        subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
        topic: { findMany: vi.fn().mockResolvedValue(topics) },
        topicMastery: { findMany: vi.fn().mockResolvedValue(masteries) },
        studyTask: { findMany: vi.fn().mockResolvedValue(nearbyTasks) },
        question: { findMany: vi.fn().mockResolvedValue([]) },
      } as any;
    }
    const run = (db: any, overrides: Record<string, unknown> = {}) =>
      new ScheduleGeneratorService({} as never).buildTasksForSession(
        { ...session, scheduledMinutes: 120, ...overrides }, userId, [mathStudySubject()], db,
      );

    it('na preparação, tópico nunca estudado pula a teoria e vai para questões', async () => {
      const tasks = await run(mathDb([topic('novo')], []), { phase: 'PREPARACAO' });
      expect(tasks[0]).toMatchObject({ topicId: 'novo', activityType: 'QUESTOES', title: 'Questões — novo' });
    });

    it('na preparação, tópico em prática vira simulado', async () => {
      const db = mathDb([topic('pratica')], [mastery('pratica', { status: TopicMasteryStatus.PRATICANDO, masteryScore: 60 })]);
      const tasks = await run(db, { phase: 'PREPARACAO' });
      expect(tasks[0]).toMatchObject({ topicId: 'pratica', activityType: 'SIMULADO', scheduledMinutes: 60 });
    });

    it('o mix da fase segura a teoria na consolidação mesmo com tópicos novos de prioridade maior', async () => {
      // Três tópicos nunca vistos (prioridade mais alta) e dois em
      // aprendizado. Consolidação = 15% teoria, 50% questões: entra UMA
      // teoria e o resto do dia vai para questões.
      const db = mathDb(
        [topic('novo-1'), topic('novo-2'), topic('novo-3'), topic('aprendendo-1'), topic('aprendendo-2')],
        [mastery('aprendendo-1'), mastery('aprendendo-2')],
      );
      const tasks = await run(db, { phase: 'CONSOLIDACAO' });
      expect(tasks.map((t) => t.activityType)).toEqual(['TEORIA', 'QUESTOES', 'QUESTOES']);
      // Na base (50% teoria) os mesmos dados dão duas teorias.
      const base = await run(db, { phase: 'BASE' });
      expect(base.filter((t) => t.activityType === 'TEORIA')).toHaveLength(2);
    });

    it('revisões vencidas respeitam a fatia de revisão da fase; as mais atrasadas entram primeiro', async () => {
      const due = (id: string, date: string) =>
        mastery(id, { status: TopicMasteryStatus.DOMINADO, masteryScore: 90, nextReviewAt: new Date(date) });
      const db = mathDb(
        [topic('r1'), topic('r2'), topic('r3'), topic('r4'), topic('novo')],
        [due('r1', '2026-09-28'), due('r2', '2026-09-20'), due('r3', '2026-09-25'), due('r4', '2026-09-29')],
      );
      // Base: 15% de 120min = 18min → só a revisão garantida (a mais antiga).
      const base = await run(db, { phase: 'BASE' });
      expect(base.filter((t) => t.activityType === 'REVISAO').map((t) => t.topicId)).toEqual(['r2']);
      // Consolidação: 35% de 120min = 42min → três revisões de 20min.
      const consolidacao = await run(db, { phase: 'CONSOLIDACAO' });
      expect(consolidacao.filter((t) => t.activityType === 'REVISAO').map((t) => t.topicId)).toEqual(['r2', 'r3', 'r1']);
    });

    it('revisão já marcada num dia vizinho não é marcada de novo', async () => {
      const db = mathDb(
        [topic('revisar'), topic('novo')],
        [mastery('revisar', { status: TopicMasteryStatus.DOMINADO, masteryScore: 90, nextReviewAt: new Date('2026-09-29') })],
        [{ topicId: 'revisar', activityType: 'REVISAO' }],
      );
      const tasks = await run(db);
      expect(tasks.map((t) => t.topicId)).toEqual(['novo']);
    });
  });

  describe('redação, onboarding e replanejamento (fases 4 e 5)', () => {
    const essaySubject = { subjectId: 'study-subject-essay', targetHours: 20, subject: { name: 'Redação', code: 'ESSAY' } };
    const essay = { title: 'Redação — Repertório', description: 'Leia e anote.' };
    function mathDb(topicNames: string[], extra: Record<string, unknown> = {}) {
      return {
        subject: { findUnique: vi.fn(({ where }: any) => Promise.resolve(where.name === 'Matemática' ? { id: 'qb-math', name: 'Matemática' } : null)) },
        topic: { findMany: vi.fn().mockResolvedValue(topicNames.map((name) => ({ id: name, subjectId: 'qb-math', name }))) },
        topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
        studyTask: { findMany: vi.fn().mockResolvedValue([]) },
        question: { findMany: vi.fn().mockResolvedValue([]) },
        ...extra,
      } as any;
    }
    const service = () => new ScheduleGeneratorService({} as never);

    it('no dia da redação ela entra primeiro e o resto do dia vai para as outras matérias', async () => {
      const tasks = await service().buildTasksForSession(
        { ...session, scheduledMinutes: 120, essay }, userId, [mathStudySubject(), essaySubject], mathDb(['a', 'b', 'c']),
      );
      expect(tasks[0]).toMatchObject({
        subjectId: 'study-subject-essay', topicId: null, activityType: 'REDACAO',
        title: 'Redação — Repertório', scheduledMinutes: 45,
      });
      const mathMinutes = tasks.filter((t) => t.subjectId === 'study-subject-math').reduce((s, t) => s + (t.scheduledMinutes as number), 0);
      expect(mathMinutes).toBe(75);
    });

    it('fora do dia da redação, Redação não toma fatia nenhuma', async () => {
      const tasks = await service().buildTasksForSession(
        { ...session, scheduledMinutes: 120 }, userId, [mathStudySubject(), essaySubject], mathDb(['a', 'b', 'c']),
      );
      expect(tasks.every((t) => t.subjectId === 'study-subject-math')).toBe(true);
      expect(tasks.reduce((s, t) => s + (t.scheduledMinutes as number), 0)).toBe(120);
    });

    it('o tópico-coringa "Geral" nunca vira tarefa', async () => {
      const tasks = await service().buildTasksForSession(session, userId, [mathStudySubject()], mathDb(['Geral', 'Porcentagem']));
      expect(tasks.map((t) => t.topicId)).toEqual(['Porcentagem']);
    });

    it('replanejamento: planeja só o tempo que sobrou e não repete o tópico que já está no dia', async () => {
      const tasks = await service().buildTasksForSession(
        { ...session, scheduledMinutes: 120, occupiedMinutes: 80, excludeTopicIds: ['a'] },
        userId, [mathStudySubject()], mathDb(['a', 'b', 'c']),
      );
      expect(tasks.map((t) => t.topicId)).toEqual(['b']);
      expect(tasks[0].scheduledMinutes).toBe(40);
    });

    it('replanejamento: a matéria da tarefa trazida desconta esse tempo da própria fatia', async () => {
      const subjects: Record<string, { id: string; name: string }> = {
        'Matemática': { id: 'qb-math', name: 'Matemática' },
        'Física': { id: 'qb-physics', name: 'Física' },
      };
      const db: any = {
        subject: { findUnique: vi.fn(({ where }: any) => Promise.resolve(subjects[where.name] ?? null)) },
        topic: { findMany: vi.fn().mockResolvedValue([
          ...['m1', 'm2', 'm3'].map((id) => ({ id, subjectId: 'qb-math', name: id })),
          ...['f1', 'f2', 'f3'].map((id) => ({ id, subjectId: 'qb-physics', name: id })),
        ]) },
        topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
        studyTask: { findMany: vi.fn().mockResolvedValue([]) },
        question: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const physics = { subjectId: 'study-subject-physics', targetHours: 10, subject: { name: 'Física', code: 'PHYSICS' } };
      // Dia de 2h, metade para cada. Uma tarefa de 40min de Matemática veio
      // de outro dia: Matemática fica com 40 + 20 = 60 e Física mantém 60.
      const tasks = await service().buildTasksForSession(
        {
          ...session, scheduledMinutes: 120, occupiedMinutes: 40,
          excludeTopicIds: ['m1'], occupiedBySubject: { 'study-subject-math': 40 },
        },
        userId, [mathStudySubject({ targetHours: 10 }), physics], db,
      );
      const minutes = (subjectId: string) =>
        tasks.filter((t) => t.subjectId === subjectId).reduce((s, t) => s + (t.scheduledMinutes as number), 0);
      expect(minutes('study-subject-math')).toBe(20);
      expect(minutes('study-subject-physics')).toBe(60);
    });

    it('dia já todo ocupado não ganha tarefa nova', async () => {
      const tasks = await service().buildTasksForSession(
        { ...session, scheduledMinutes: 60, occupiedMinutes: 60 }, userId, [mathStudySubject()], mathDb(['a']),
      );
      expect(tasks).toEqual([]);
    });

    it('área prioritária do onboarding dá mais tempo do dia às matérias da área', async () => {
      const subjects: Record<string, { id: string; name: string }> = {
        'Matemática': { id: 'qb-math', name: 'Matemática' },
        'História': { id: 'qb-history', name: 'História' },
      };
      const db: any = {
        subject: { findUnique: vi.fn(({ where }: any) => Promise.resolve(subjects[where.name] ?? null)) },
        topic: { findMany: vi.fn().mockResolvedValue([
          ...['m1', 'm2', 'm3'].map((id) => ({ id, subjectId: 'qb-math', name: id })),
          ...['h1', 'h2', 'h3'].map((id) => ({ id, subjectId: 'qb-history', name: id })),
        ]) },
        topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
        studyTask: { findMany: vi.fn().mockResolvedValue([]) },
        question: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const history = { subjectId: 'study-subject-history', targetHours: 10, subject: { name: 'História', code: 'HISTORY' } };
      const mathMinutes = async (priorityAreas: ('HUMANAS' | 'LINGUAGENS' | 'MATEMATICA')[]) => {
        const tasks = await service().buildTasksForSession(
          { ...session, scheduledMinutes: 160, priorityAreas }, userId, [mathStudySubject({ targetHours: 10 }), history], db,
        );
        return tasks
          .filter((t) => t.subjectId === 'study-subject-math')
          .reduce((s, t) => s + (t.scheduledMinutes as number), 0);
      };
      // Mesmas horas-alvo: 80min para cada. Com Humanas prioritária, História
      // passa a pesar 12,5 contra 10 e Matemática cede tempo (71 de 160).
      expect(await mathMinutes([])).toBe(80);
      expect(await mathMinutes(['HUMANAS', 'LINGUAGENS'])).toBe(71);
      // As duas áreas marcadas: o reforço vale para as duas e a divisão volta a ser igual.
      expect(await mathMinutes(['HUMANAS', 'MATEMATICA'])).toBe(80);
    });
  });

  describe('acabamento do dia', () => {
    const db = (nearby: unknown[]) => ({
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue(['a', 'b', 'c'].map((id) => ({ id, subjectId: 'qb-math', name: id }))) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue(nearby) },
      question: { findMany: vi.fn().mockResolvedValue([{ subjectId: 'qb-math', topicId: 'a' }]) },
    }) as any;
    const run = (database: any, scheduledMinutes: number) =>
      new ScheduleGeneratorService({} as never).buildTasksForSession({ ...session, scheduledMinutes }, userId, [mathStudySubject()], database);
    const nearbyTask = (status: string, date: string) => ({ topicId: 'a', activityType: 'TEORIA', status, session: { date: new Date(date) } });

    it('tópico com tarefa ainda por fazer não se repete, mesmo dias depois', async () => {
      // "a" é o de maior prioridade, mas já está pendente 5 dias antes.
      const tasks = await run(db([nearbyTask('PENDING', '2026-09-25')]), 40);
      expect(tasks.map((t) => t.topicId)).toEqual(['b']);
    });

    it('tópico concluído há mais de 3 dias volta à fila normal', async () => {
      const tasks = await run(db([nearbyTask('DONE', '2026-09-25')]), 40);
      expect(tasks.map((t) => t.topicId)).toEqual(['a']);
      const recent = await run(db([nearbyTask('DONE', '2026-09-29')]), 40);
      expect(recent.map((t) => t.topicId)).toEqual(['b']);
    });

    it('sobra pequena estica a última tarefa em vez de virar um bloco de 10 minutos', async () => {
      const tasks = await run(db([]), 95);
      expect(tasks.map((t) => t.scheduledMinutes)).toEqual([40, 40, 15]);
      // Revisão vencida de 20min + fatia: 20 + 40 + 40 e sobram 10 → vão para a última.
      const withReview = db([]);
      withReview.topicMastery.findMany.mockResolvedValue([
        { topicId: 'c', masteryScore: 90, status: TopicMasteryStatus.DOMINADO, lastStudiedAt: new Date('2026-09-20'), nextReviewAt: new Date('2026-09-29') },
      ]);
      const tasks2 = await run(withReview, 110);
      expect(tasks2.map((t) => t.scheduledMinutes)).toEqual([20, 40, 50]);
    });
  });

  it('não estoura o orçamento de minutos da sessão', async () => {
    const topics = Array.from({ length: 10 }, (_, i) => ({ id: `topic-${i}`, subjectId: 'qb-math', name: `Tópico ${i}` }));
    const db: any = {
      subject: { findUnique: vi.fn().mockResolvedValue({ id: 'qb-math', name: 'Matemática' }) },
      topic: { findMany: vi.fn().mockResolvedValue(topics) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([]) },
      studyTask: { findMany: vi.fn().mockResolvedValue([]) },
      question: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ScheduleGeneratorService({} as never);
    const tasks = await service.buildTasksForSession(session, userId, [mathStudySubject()], db);
    const total = tasks.reduce((sum, t) => sum + (t.scheduledMinutes as number), 0);
    expect(total).toBeLessThanOrEqual(session.scheduledMinutes);
  });
});
