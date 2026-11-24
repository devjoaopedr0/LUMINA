import assert from 'node:assert/strict';
import {
  formatRankingValue,
  goalPayloadFromForm,
  goalPeriod,
  goalProgressText,
} from '../src/lib/group-engagement.ts';

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

// Valores do placar.
assert.equal(formatRankingValue('consistency', 43), '43%');
assert.equal(formatRankingValue('hours', 750), '12 h 30 min');
assert.equal(formatRankingValue('hours', 45), '45 min');
assert.equal(formatRankingValue('streak', 1), '1 dia');
assert.equal(formatRankingValue('streak', 5), '5 dias');

// Metas: horas viram minutos; dias ficam dias.
assert.deepEqual(goalPayloadFromForm(form({ title: ' Semana forte ', metric: 'GROUP_MINUTES', target: '20', days: '7' })), { title: 'Semana forte', metric: 'GROUP_MINUTES', target: 1200, days: 7 });
assert.deepEqual(goalPayloadFromForm(form({ title: 'Ritmo', metric: 'GROUP_STUDY_DAYS', target: '30', days: '7' })), { title: 'Ritmo', metric: 'GROUP_STUDY_DAYS', target: 30, days: 7 });
assert.ok('error' in goalPayloadFromForm(form({ title: 'x', metric: 'GROUP_MINUTES', target: '20', days: '7' })));
assert.ok('error' in goalPayloadFromForm(form({ title: 'Meta', metric: 'GROUP_MINUTES', target: '0', days: '7' })));
assert.ok('error' in goalPayloadFromForm(form({ title: 'Meta', metric: 'GROUP_MINUTES', target: '5', days: '40' })));

// Textos de progresso e período.
assert.equal(goalProgressText({ metric: 'GROUP_MINUTES', value: 360, target: 1200 }), '6 h de 20 h');
assert.equal(goalProgressText({ metric: 'GROUP_STUDY_DAYS', value: 4, target: 30 }), '4 de 30 dias');
assert.equal(goalPeriod('2026-11-18', '2026-11-24'), '18/11 a 24/11');

console.log('engajamento do grupo: placar, metas e textos conferidos.');
