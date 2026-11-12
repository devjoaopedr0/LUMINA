import { describe, expect, it } from 'vitest';
import {
  buildTeacherAnalytics,
  TeacherAnalyticsClassInput,
  TeacherAnalyticsSimulation,
  TeacherAnalyticsStudyLog,
} from './teacher-analytics';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const OLD = new Date('2026-09-01T12:00:00.000Z');
const RECENT = new Date('2026-11-08T12:00:00.000Z');

function item(position: number, questionId: string | null = null, correctPosition = 1) {
  return {
    position,
    questionId,
    stem: `Questão ${position} sobre funções`,
    subject: 'Matemática',
    correctPosition,
  };
}

function simulation(
  id: string,
  submissions: Array<{
    userId: string;
    correct: number;
    total: number;
    submittedAt: Date;
    answers: unknown;
  }>,
  items = [item(1), item(2), item(3), item(4), item(5)],
): TeacherAnalyticsSimulation {
  return { id, title: `Atividade ${id}`, items, submissions };
}

function classRoom(
  id: string,
  members: TeacherAnalyticsClassInput['members'],
  simulations: TeacherAnalyticsSimulation[] = [],
): TeacherAnalyticsClassInput {
  return { id, name: `Turma ${id}`, joinCode: `CODIGO-${id}`, members, simulations };
}

function member(id: string, name: string): TeacherAnalyticsClassInput['members'][number] {
  return {
    joinedAt: OLD,
    user: { id, name, email: `${id}@lumina.test` },
  };
}

describe('buildTeacherAnalytics', () => {
  it('consolida participação, desempenho, tempo, riscos e questões difíceis', () => {
    const rows = [
      simulation('sim-1', [
        {
          userId: 'alice',
          correct: 3,
          total: 5,
          submittedAt: RECENT,
          answers: [
            { position: 1, selectedPosition: 1 },
            { position: 2, selectedPosition: 1 },
            { position: 3, selectedPosition: 1 },
            { position: 4, selectedPosition: 2 },
            { position: 5, selectedPosition: 2 },
          ],
        },
        {
          userId: 'bob',
          correct: 0,
          total: 5,
          submittedAt: RECENT,
          answers: [
            { position: 1, selectedPosition: 2 },
            { position: 2, selectedPosition: 2 },
            { position: 3, selectedPosition: 2 },
            { position: 4, selectedPosition: 2 },
            { position: 5, selectedPosition: 2 },
          ],
        },
        {
          userId: 'diego',
          correct: 2,
          total: 5,
          submittedAt: RECENT,
          answers: [
            { position: 1, selectedPosition: 1 },
            { position: 2, selectedPosition: 1 },
            { position: 3, selectedPosition: 2 },
            { position: 4, selectedPosition: 2 },
            { position: 5, selectedPosition: 2 },
          ],
        },
      ]),
    ];
    const logs: TeacherAnalyticsStudyLog[] = [
      { userId: 'alice', durationMinutes: 30, startTime: RECENT },
    ];

    const result = buildTeacherAnalytics({
      classes: [
        classRoom(
          'turma-1',
          [
            member('alice', 'Alice'),
            member('bob', 'Bob'),
            member('carol', 'Carol'),
            member('diego', 'Diego'),
          ],
          rows,
        ),
      ],
      studyLogs: logs,
      now: NOW,
      days: 30,
    });

    expect(result.summary).toMatchObject({
      classCount: 1,
      studentCount: 4,
      activeStudentCount: 3,
      participationRate: 75,
      submissionCount: 3,
      answerCount: 15,
      correctCount: 5,
      accuracy: 33,
      studyMinutes: 30,
      studentsAtRisk: 3,
      questionCount: 5,
    });
    expect(result.classes[0]).toMatchObject({
      studentCount: 4,
      activeStudentCount: 3,
      participationRate: 75,
      accuracy: 33,
      studyMinutes: 30,
      studentsAtRisk: 3,
    });
    expect(result.classes[0].students.find((student) => student.id === 'alice')).toMatchObject({
      accuracy: 60,
      studyMinutes: 30,
      riskLevel: 'NONE',
    });
    expect(result.classes[0].students.find((student) => student.id === 'bob')).toMatchObject({
      accuracy: 0,
      errorStreak: 5,
      riskLevel: 'HIGH',
    });
    expect(result.classes[0].students.find((student) => student.id === 'carol')).toMatchObject({
      submissions: 0,
      lastActivityAt: null,
      riskLevel: 'MEDIUM',
    });
    expect(result.classes[0].students.find((student) => student.id === 'diego')?.riskReasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'STUDENT_LOW_ACCURACY' })]),
    );
    expect(result.questions).toHaveLength(5);
    expect(result.questions.find((question) => question.key === 'sim-1:4')).toMatchObject({
      attempts: 3,
      correctCount: 0,
      accuracy: 0,
    });
    expect(result.classes[0].difficultQuestions.length).toBeGreaterThan(0);
    expect(result.subjects).toEqual([
      { subject: 'Matemática', attempts: 15, correctCount: 5, accuracy: 33 },
    ]);
    expect(result.evolution).toHaveLength(1);
    expect(result.evolution[0]).toMatchObject({
      day: '2026-11-08',
      submissions: 3,
      answers: 15,
      correctCount: 5,
      accuracy: 33,
      studyMinutes: 30,
    });
    expect(result.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining([
        'CLASS_LOW_ACCURACY',
        'STUDENT_LOW_ACCURACY',
        'STUDENT_INACTIVITY',
        'STUDENT_ERROR_STREAK',
        'DIFFICULT_QUESTION',
      ]),
    );

    const bob = result.classes[0].students.find((student) => student.id === 'bob');
    const bobStreak = result.signals.find(
      (signal) => signal.kind === 'STUDENT_ERROR_STREAK' && signal.studentId === 'bob',
    );
    const carolInactivity = result.signals.find(
      (signal) => signal.kind === 'STUDENT_INACTIVITY' && signal.studentId === 'carol',
    );
    expect(bob?.errorStreak).toBe(5);
    expect(bobStreak?.metric).toBe(-5);
    expect(carolInactivity?.severity).toBe('MEDIUM');
    expect(carolInactivity?.metric).toBeLessThanOrEqual(-7);
  });

  it('ignora submissões de ex-alunos e professores nas métricas da turma', () => {
    const answers = [
      { position: 1, selectedPosition: 1 },
      { position: 2, selectedPosition: 2 },
    ];
    const result = buildTeacherAnalytics({
      classes: [
        classRoom('turma-1', [member('ana', 'Ana')], [
          simulation(
            'sim-1',
            [
              { userId: 'ana', correct: 1, total: 2, submittedAt: RECENT, answers },
              { userId: 'ex-aluno', correct: 2, total: 2, submittedAt: RECENT, answers },
              { userId: 'professor', correct: 2, total: 2, submittedAt: RECENT, answers },
            ],
            [item(1), item(2)],
          ),
        ]),
      ],
      studyLogs: [],
      now: NOW,
      days: 30,
    });

    expect(result.summary).toMatchObject({
      studentCount: 1,
      submissionCount: 1,
      answerCount: 2,
      correctCount: 1,
      accuracy: 50,
      questionCount: 2,
    });
    expect(result.classes[0]).toMatchObject({
      studentCount: 1,
      submissionCount: 1,
      answerCount: 2,
      correctCount: 1,
      accuracy: 50,
    });
    expect(result.questions.find((question) => question.key === 'sim-1:1')).toMatchObject({
      attempts: 1,
      correctCount: 1,
      accuracy: 100,
    });
    expect(result.evolution[0]).toMatchObject({
      submissions: 1,
      answers: 2,
      correctCount: 1,
      accuracy: 50,
    });
  });

  it('não atribui tempo de estudo anterior ao ingresso na turma', () => {
    const joinedAt = new Date('2026-11-05T12:00:00.000Z');
    const result = buildTeacherAnalytics({
      classes: [
        classRoom('turma-1', [
          {
            joinedAt,
            user: { id: 'ana', name: 'Ana', email: 'ana@lumina.test' },
          },
        ]),
      ],
      studyLogs: [
        { userId: 'ana', durationMinutes: 20, startTime: new Date('2026-11-04T12:00:00.000Z') },
        { userId: 'ana', durationMinutes: 30, startTime: new Date('2026-11-06T12:00:00.000Z') },
      ],
      now: NOW,
      days: 30,
    });

    expect(result.summary.studyMinutes).toBe(30);
    expect(result.classes[0].studyMinutes).toBe(30);
    expect(result.classes[0].students[0].studyMinutes).toBe(30);
  });

  it('usa null quando não há respostas e não inventa sinal', () => {
    const result = buildTeacherAnalytics({
      classes: [classRoom('turma-vazia', [member('ana', 'Ana')])],
      studyLogs: [],
      now: NOW,
      days: 30,
    });

    expect(result.summary.accuracy).toBeNull();
    expect(result.summary.participationRate).toBe(0);
    expect(result.classes[0].accuracy).toBeNull();
    expect(result.classes[0].students[0].accuracy).toBeNull();
    expect(result.classes[0].students[0].riskReasons).toEqual([
      expect.objectContaining({ kind: 'STUDENT_INACTIVITY' }),
    ]);
    expect(result.signals.filter((signal) => signal.kind === 'DIFFICULT_QUESTION')).toEqual([]);
  });

  it('agrega a mesma questão em atividades diferentes pelo questionId', () => {
    const answers = [{ position: 1, selectedPosition: 1 }];
    const result = buildTeacherAnalytics({
      classes: [
        classRoom('turma-1', [member('ana', 'Ana')], [
          simulation('sim-1', [{ userId: 'ana', correct: 1, total: 1, submittedAt: RECENT, answers }], [
            item(1, 'questao-1'),
          ]),
          simulation('sim-2', [{ userId: 'ana', correct: 0, total: 1, submittedAt: RECENT, answers: [{ position: 1, selectedPosition: 2 }] }], [
            item(1, 'questao-1', 1),
          ]),
        ]),
      ],
      studyLogs: [],
      now: NOW,
      days: 30,
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      key: 'questao-1',
      simulationCount: 2,
      attempts: 2,
      correctCount: 1,
      accuracy: 50,
    });
  });
});
