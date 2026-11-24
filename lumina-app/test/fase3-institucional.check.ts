import assert from 'node:assert/strict';
import { formatChange, pct, trendTone, versusText } from '../src/lib/institution.ts';

// Variações.
assert.equal(formatChange(7, 'pp'), '+7 p.p.');
assert.equal(formatChange(-6.5, 'pp'), '−6,5 p.p.');
assert.equal(formatChange(25, 'min'), '+25 min');
assert.equal(formatChange(0, 'count'), '±0');
assert.equal(formatChange(null, 'pp'), '—');

// Cores: em "alunos em risco", subir é ruim.
assert.equal(trendTone('up'), 'good');
assert.equal(trendTone('up', true), 'bad');
assert.equal(trendTone('down', true), 'good');
assert.equal(trendTone('same'), 'neutral');
assert.equal(trendTone(null), 'neutral');

// Porcentagem.
assert.equal(pct(62), '62%');
assert.equal(pct(61.5), '61,5%');
assert.equal(pct(null), '—');

// Aluno × média da turma (sem ranking).
assert.equal(versusText({ mine: 68, average: 61.5, difference: 6.5 }, 'pp'), '6,5 p.p. acima da média da turma.');
assert.equal(versusText({ mine: 50, average: 60, difference: -10 }, 'pp'), '10 p.p. abaixo da média da turma.');
assert.equal(versusText({ mine: 61, average: 61.4, difference: -0.4 }, 'pp'), 'Na média da turma.');
assert.equal(versusText({ mine: 200, average: 150, difference: 50 }, 'min'), '50 min acima da média da turma.');
assert.equal(versusText({ mine: null, average: 60, difference: null }, 'pp'), 'Ainda sem dados suficientes para comparar.');

console.log('fase 3: comparação, cores e frases conferidas.');
