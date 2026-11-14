import assert from 'node:assert/strict';
import { areaForSubject, isSkillCode, skillBand, skillFromMatrix, skillsToPractice, type EnemMatrix, type SkillMasteryReport } from '../src/lib/enem-skills.ts';

// Área pela matéria: mesma regra do backend.
assert.equal(areaForSubject('Matemática'), 'MT');
assert.equal(areaForSubject('química'), 'CN');
assert.equal(areaForSubject('Filosofia'), 'CH');
assert.equal(areaForSubject('Literatura'), 'LC');
assert.equal(areaForSubject('Robótica'), null);

assert.ok(isSkillCode('MT-H30'));
assert.ok(!isSkillCode('MT-H31'));
assert.ok(!isSkillCode('mt-h3'));

// Faixa: sem cor abaixo do mínimo de respostas.
assert.equal(skillBand({ attempts: 0, accuracy: null }, 3), 'none');
assert.equal(skillBand({ attempts: 2, accuracy: 100 }, 3), 'few');
assert.equal(skillBand({ attempts: 5, accuracy: 80 }, 3), 'mastered');
assert.equal(skillBand({ attempts: 5, accuracy: 60 }, 3), 'progress');
assert.equal(skillBand({ attempts: 5, accuracy: 40 }, 3), 'attention');
assert.equal(skillBand({ attempts: 5, accuracy: 39 }, 3), 'critical');

const matrix: EnemMatrix = { source: 'x', areas: [{ area: 'MT', name: 'Matemática e suas Tecnologias', competencies: [{ n: 4, text: 'C4' }], skills: [{ n: 17, competency: 4, text: 'Analisar informações' }] }] };
assert.deepEqual(skillFromMatrix(matrix, 'MT-H17'), { area: 'MT', areaName: 'Matemática e suas Tecnologias', competency: 4, text: 'Analisar informações', code: 'MT-H17' });
assert.equal(skillFromMatrix(matrix, 'MT-H18'), null);
assert.equal(skillFromMatrix(null, 'MT-H17'), null);

// Praticar: primeiro as fracas com amostra, depois as nunca respondidas com questões.
const row = (n: number, attempts: number, accuracy: number | null, available: number) => ({ code: `MT-H${n}`, n, text: '', attempts, correct: 0, accuracy, lastAt: null, available, provisional: false });
const report: SkillMasteryReport = {
  source: 'x', minAttempts: 3, classifiedQuestions: 10, pendingValidation: 0,
  areas: [{ area: 'MT', name: 'MT', attempts: 0, correct: 0, competencies: [{ n: 1, text: '', attempts: 0, correct: 0, skills: [row(1, 5, 50, 3), row(2, 4, 20, 2), row(3, 2, 0, 5), row(4, 0, null, 9), row(5, 0, null, 0), row(6, 6, 90, 4)] }] }],
};
assert.deepEqual(skillsToPractice(report, 'MT').map((s) => s.n), [2, 1, 4]);
console.log('habilidades do ENEM: ok');
