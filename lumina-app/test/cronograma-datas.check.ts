import assert from 'node:assert/strict';
import { brDate, localToday, profileGoalText, scheduleDateError, type ScheduleLimits } from '../src/lib/schedule-dates.ts';

const today = '2026-11-16';
const limits: ScheduleLimits = { minStart: today, maxEnd: '2027-04-12', topics: 60, contentMinutes: 8400, weeklyMinutes: 600, contentDays: 98 };

assert.equal(localToday(new Date(2026, 10, 16, 23, 30)), '2026-11-16'); // relógio da máquina, fuso local
assert.equal(brDate('2027-04-12'), '12/04/2027');

assert.equal(scheduleDateError({ startDate: '', endDate: '2026-12-01' }, today), 'Preencha as datas de início e de término.');
assert.match(scheduleDateError({ startDate: '2026-11-15', endDate: '2026-12-01' }, today)!, /não pode ser antes de hoje \(16\/11\/2026\)/);
assert.equal(scheduleDateError({ startDate: '2026-11-16', endDate: '2026-12-01' }, today), null);
// Edição: manter o início antigo (já passado) pode.
assert.equal(scheduleDateError({ startDate: '2026-09-01', endDate: '2026-12-01', keepStart: '2026-09-01' }, today), null);
assert.match(scheduleDateError({ startDate: '2026-11-20', endDate: '2026-11-18' }, today)!, /igual ou posterior/);
assert.match(scheduleDateError({ startDate: '2026-11-16', endDate: '2026-11-10', keepStart: '2026-11-16' }, today)!, /término não pode ser antes de hoje/);
assert.match(scheduleDateError({ startDate: '2026-11-16', endDate: '2027-06-01', limits }, today)!, /\(60 assuntos\) cabe até 12\/04\/2027/);
assert.equal(scheduleDateError({ startDate: '2026-11-16', endDate: '2027-04-12', limits }, today), null);

assert.equal(profileGoalText('Medicina', 'UFC'), 'Medicina na UFC');
assert.equal(profileGoalText('Direito', ''), 'Direito');
assert.equal(profileGoalText('', 'UFC'), null);
console.log('cronograma (datas e objetivo): ok');
