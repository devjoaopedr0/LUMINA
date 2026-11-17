import assert from 'node:assert/strict';
import { csvCell, minutes, percent, reportCsv, reportFileName, type InstitutionReport } from '../src/lib/reports.ts';

assert.equal(percent(null), '—');
assert.equal(percent(57), '57%');
assert.equal(minutes(45), '45 min');
assert.equal(minutes(120), '2 h');
assert.equal(minutes(135), '2 h 15 min');

// CSV: separador ";", aspas escapadas e fórmula neutralizada.
assert.equal(csvCell('Turma "A"; manhã'), '"Turma ""A""; manhã"');
assert.equal(csvCell('=SOMA(A1)'), "'=SOMA(A1)");
assert.equal(csvCell(null), '');

const inst = {
  type: 'INSTITUTION', title: 'Escola Teste', period: { from: '', to: '', days: 31, label: '2026-10', name: 'outubro de 2026' },
  summary: {}, subjects: [], signalsBySeverity: {}, recoveryPlans: { active: 0, completed: 0, cancelled: 0 },
  classes: [{ id: '1', name: '3º A', studentCount: 30, activeStudentCount: 20, participationRate: 67, accuracy: null, studyMinutes: 90, studentsAtRisk: 2 }],
} as unknown as InstitutionReport;
const csv = reportCsv(inst);
assert.ok(csv.startsWith('﻿Turma;Alunos;Ativos'));
assert.ok(csv.includes('3º A;30;20;67;;90;2'));
assert.equal(reportFileName(inst, 'csv'), 'relatorio-institucional-escola-teste-2026-10.csv');
console.log('relatórios: ok');
