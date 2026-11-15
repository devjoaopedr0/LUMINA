import assert from 'node:assert/strict';
import {
  classesSeveridade,
  filtrarQuestoesDificeis,
  filtrarSinaisCriticos,
  formatarDataHora,
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
          riskLevel: 'MEDIUM',
          riskReasons: [
            { kind: 'STUDENT_INACTIVITY', label: 'Sem atividade nesta turma no período', severity: 'MEDIUM' },
          ],
        },
      ],
      difficultQuestions: [],
    },
  ],
  questions: [
    { key: 'q-1', questionId: 'q-1', stem: 'Questão 1', subject: 'Matemática', simulationCount: 1, attempts: 4, correctCount: 2, blankCount: 0, accuracy: 50 },
    { key: 'q-2', questionId: 'q-2', stem: 'Questão 2', subject: 'Matemática', simulationCount: 1, attempts: 5, correctCount: 4, blankCount: 0, accuracy: 80 },
    { key: 'q-3', questionId: 'q-3', stem: 'Questão 3', subject: 'Matemática', simulationCount: 1, attempts: 3, correctCount: 0, blankCount: 0, accuracy: 0 },
    { key: 'q-4', questionId: 'q-4', stem: 'Questão 4', subject: 'Matemática', simulationCount: 1, attempts: 2, correctCount: 0, blankCount: 0, accuracy: 0 },
    { key: 'q-5', questionId: 'q-5', stem: 'Questão 5', subject: 'Matemática', simulationCount: 1, attempts: 4, correctCount: 3, blankCount: 0, accuracy: 75 },
    { key: 'q-6', questionId: null, stem: 'Questão 6', subject: 'Matemática', simulationCount: 1, attempts: 4, correctCount: 0, blankCount: 0, accuracy: null },
  ],
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
assert.equal(formatarDataHora(null), 'Sem atividade');
assert.match(formatarDataHora('2026-11-08T12:00:00.000Z'), /08\/11\/2026.*09:00/);

assert.deepEqual(
  filtrarQuestoesDificeis(resultado.questions).map((question) => question.key),
  ['q-1', 'q-3'],
);
assert.deepEqual(
  filtrarQuestoesDificeis(resultado.questions, 1).map((question) => question.key),
  ['q-1'],
);

const ordenados = ordenarSinais([
  sinal('baixo', 'LOW', 90),
  sinal('medio', 'MEDIUM', 65),
  sinal('alto', 'HIGH', 40),
]);
assert.deepEqual(ordenados.map((item) => item.id), ['alto', 'medio', 'baixo']);
assert.deepEqual(filtrarSinaisCriticos(ordenados).map((item) => item.id), ['alto', 'medio']);
assert.deepEqual(
  ordenarSinais([
    sinal('menos-grave', 'MEDIUM', -3),
    sinal('mais-grave', 'MEDIUM', -10),
  ]).map((item) => item.id),
  ['mais-grave', 'menos-grave'],
);

const csv = gerarCsvAlunos(resultado);
assert.match(csv, /^"Turma";"Aluno";"E-mail"/);
assert.match(csv, /"Turma 1";"Ana ""Lima""";"ana@lumina\.test";"10";"5";"50%";"45";"Médio";"Desempenho abaixo de 60%"/);
assert.match(csv, /"Bia";"bia@lumina\.test";"0";"0";"";"0";"Médio";"Sem atividade nesta turma no período"/);

const resultadoComFormula: TeacherAnalyticsResult = {
  ...resultado,
  classes: [
    {
      ...resultado.classes[0],
      students: [
        {
          ...resultado.classes[0].students[0],
          name: '=1+1',
          email: '+soma@lumina.test',
        },
      ],
    },
  ],
};
const csvComFormula = gerarCsvAlunos(resultadoComFormula);
assert.match(csvComFormula, /"'=1\+1"/);
assert.match(csvComFormula, /"'\+soma@lumina\.test"/);

console.log('acompanhamento pedagógico: checks ok');

// ---- Alertas persistidos (item 41)
import { abaDoAlerta, acoesDoAlerta, alertasDaAba } from '../src/lib/teacher-analytics.ts';
{
  const base = { kind: 'STUDENT_INACTIVITY', classId: null, className: null, studentId: null, studentName: null, questionKey: null, title: '', detail: '', recommendation: '', autoResolved: false, reopenCount: 0, note: null, history: [], firstSeenAt: '2026-11-01T00:00:00Z', closedAt: null } as const;
  const items = [
    { ...base, id: '1', status: 'OPEN', severity: 'MEDIUM', lastSeenAt: '2026-11-10T00:00:00Z' },
    { ...base, id: '2', status: 'OPEN', severity: 'HIGH', lastSeenAt: '2026-11-09T00:00:00Z' },
    { ...base, id: '3', status: 'ACKNOWLEDGED', severity: 'LOW', lastSeenAt: '2026-11-09T00:00:00Z' },
    { ...base, id: '4', status: 'DISMISSED', severity: 'HIGH', lastSeenAt: '2026-11-08T00:00:00Z' },
    { ...base, id: '5', status: 'RESOLVED', severity: 'LOW', lastSeenAt: '2026-11-11T00:00:00Z' },
  ] as Parameters<typeof alertasDaAba>[0];
  assert.deepEqual(alertasDaAba(items, 'abertos').map((a) => a.id), ['2', '1']);
  assert.deepEqual(alertasDaAba(items, 'acompanhamento').map((a) => a.id), ['3']);
  assert.deepEqual(alertasDaAba(items, 'encerrados').map((a) => a.id), ['5', '4']);
  assert.equal(abaDoAlerta('DISMISSED'), 'encerrados');
  assert.deepEqual(acoesDoAlerta('OPEN').map((a) => a.to), ['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']);
  assert.deepEqual(acoesDoAlerta('RESOLVED').map((a) => a.to), ['OPEN']);
  console.log('acompanhamento (alertas persistidos): ok');
}
