import assert from 'node:assert/strict';
import {
  classesSeveridade,
  filtrarSinaisCriticos,
  formatarMinutos,
  formatarPercentual,
  gerarCsvAlunos,
  ordenarSinais,
  resumoParticipacao,
  rotuloRisco,
  rotuloSeveridade,
  rotuloSinal,
} from '../src/lib/teacher-analytics.ts';
import type { TeacherAnalyticsResult, TeacherAnalyticsSignal } from '../src/lib/api.ts';

/**
 * Checks de leitura do painel do professor (fase 3). O backend decide os
 * números; aqui se prova que a interface não transforma ausência de dados em
 * 0%, ordena os sinais por gravidade e exporta CSV sem quebrar nomes.
 */

const sinal = (
  id: string,
  severity: TeacherAnalyticsSignal['severity'],
  metric: number | null,
): TeacherAnalyticsSignal => ({
  id,
  kind: 'STUDENT_LOW_ACCURACY',
  severity,
  classId: 'turma-1',
  className: 'Turma 1',
  studentId: 'aluno-1',
  studentName: 'Ana',
  questionKey: null,
  subject: null,
  title: 'Ana: desempenho abaixo de 60%',
  detail: '50% de acerto em 10 respostas.',
  recommendation: 'Recomende revisão do conteúdo e acompanhe uma nova tentativa.',
  metric,
});

const resultado: TeacherAnalyticsResult = {
  generatedAt: '2026-11-09T12:00:00.000Z',
  period: {
    days: 30,
    from: '2026-10-10T12:00:00.000Z',
    to: '2026-11-09T12:00:00.000Z',
  },
  summary: {
    classCount: 1,
    studentCount: 2,
    activeStudentCount: 1,
    participationRate: 50,
    submissionCount: 2,
    answerCount: 10,
    correctCount: 5,
    accuracy: 50,
    studyMinutes: 45,
    studentsAtRisk: 1,
    questionCount: 4,
  },
  classes: [
    {
      id: 'turma-1',
      name: 'Turma 1',
      joinCode: 'ABC123',
      studentCount: 2,
      activeStudentCount: 1,
      participationRate: 50,
      submissionCount: 2,
      answerCount: 10,
      correctCount: 5,
      accuracy: 50,
      studyMinutes: 45,
      studentsAtRisk: 1,
      lastActivityAt: '2026-11-08T12:00:00.000Z',
      students: [
        {
          id: 'aluno-1',
          name: 'Ana "Lima"',
          email: 'ana@lumina.test',
          joinedAt: '2026-09-01T12:00:00.000Z',
          submissions: 1,
          answerCount: 10,
          correctCount: 5,
          accuracy: 50,
          studyMinutes: 45,
          lastActivityAt: '2026-11-08T12:00:00.000Z',
          errorStreak: 2,
          riskLevel: 'MEDIUM',
          riskReasons: [
            { kind: 'STUDENT_LOW_ACCURACY', label: 'Desempenho abaixo de 60%', severity: 'MEDIUM' },
          ],
        },
        {
          id: 'aluno-2',
          name: 'Bia',
          email: 'bia@lumina.test',
          joinedAt: '2026-09-01T12:00:00.000Z',
          submissions: 0,
          answerCount: 0,
          correctCount: 0,
          accuracy: null,
          studyMinutes: 0,
          lastActivityAt: null,
          errorStreak: 0,
          riskLevel: 'HIGH',
          riskReasons: [
            { kind: 'STUDENT_INACTIVITY', label: 'Sem atividade há mais de 7 dias', severity: 'HIGH' },
          ],
        },
      ],
      difficultQuestions: [],
    },
  ],
  questions: [],
  subjects: [],
  evolution: [],
  signals: [],
};

assert.equal(formatarPercentual(null), '—');
assert.equal(formatarPercentual(0), '0%');
assert.equal(formatarPercentual(73), '73%');
assert.equal(formatarMinutos(0), '0 min');
assert.equal(formatarMinutos(45), '45 min');
assert.equal(formatarMinutos(60), '1h');
assert.equal(formatarMinutos(75), '1h 15min');
assert.equal(rotuloSeveridade('HIGH'), 'Alta');
assert.equal(rotuloSeveridade('MEDIUM'), 'Média');
assert.equal(rotuloSeveridade('LOW'), 'Baixa');
assert.match(classesSeveridade('HIGH'), /red/);
assert.equal(rotuloSinal('CLASS_LOW_ACCURACY'), 'Turma em atenção');
assert.equal(rotuloSinal('STUDENT_INACTIVITY'), 'Inatividade');
assert.equal(rotuloSinal('DIFFICULT_QUESTION'), 'Questão difícil');
assert.equal(rotuloRisco('NONE'), 'Sem sinal');
assert.equal(resumoParticipacao(2, 4), '2 de 4 alunos com atividade no período');
assert.equal(resumoParticipacao(0, 0), 'Nenhum aluno na turma');

const ordenados = ordenarSinais([
  sinal('baixo', 'LOW', 90),
  sinal('medio', 'MEDIUM', 65),
  sinal('alto', 'HIGH', 40),
]);
assert.deepEqual(ordenados.map((item) => item.id), ['alto', 'medio', 'baixo']);
assert.deepEqual(filtrarSinaisCriticos(ordenados).map((item) => item.id), ['alto', 'medio']);

const csv = gerarCsvAlunos(resultado);
assert.match(csv, /^"Turma","Aluno","E-mail"/);
assert.match(csv, /"Turma 1","Ana ""Lima""","ana@lumina\.test","10","5","50%","45","Médio"/);
assert.match(csv, /"Bia","bia@lumina\.test","0","0","","0","Alto","Sem atividade há mais de 7 dias"/);

console.log('acompanhamento pedagógico: checks ok');
