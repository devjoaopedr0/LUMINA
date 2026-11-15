import assert from 'node:assert/strict';
import { currentStep, masteryDelta, planProgress, poolSummary, type RecoveryStep } from '../src/lib/recovery-plans.ts';

const step = (kind: RecoveryStep['kind'], state: RecoveryStep['state'], ids: string[] = []): RecoveryStep => ({ kind, title: kind, questionIds: ids, target: ids.length, state, answered: 0, correct: 0, results: {} });

// Progresso: vídeo e etapas puladas não contam.
const steps = [step('VIDEO', 'AVAILABLE'), step('EASY', 'DONE', ['a']), step('MEDIUM', 'AVAILABLE', ['b']), step('HARD', 'SKIPPED'), step('REVIEW', 'LOCKED'), step('REASSESS', 'LOCKED')];
assert.equal(planProgress({ steps }), 25);
assert.equal(currentStep({ steps })?.kind, 'MEDIUM');
assert.equal(currentStep({ steps: [step('VIDEO', 'AVAILABLE'), step('REVIEW', 'WAITING', ['a'])] }), null);
assert.equal(planProgress({ steps: [] }), 0);

assert.equal(masteryDelta({ baselineMastery: 30, currentMastery: 55 }), 25);
assert.equal(masteryDelta({ baselineMastery: null, currentMastery: 55 }), null);

assert.equal(poolSummary({ topic: 6, skill: 0, subject: 0, skills: [] }), null);
assert.equal(poolSummary({ topic: 2, skill: 3, subject: 5, skills: ['MT-H3'] }), 'O banco tem poucas questões deste assunto; o plano usa 2 do assunto, 3 da mesma habilidade do ENEM, 5 da matéria.');
console.log('plano de recuperação: ok');
