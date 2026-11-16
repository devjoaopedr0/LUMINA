import assert from 'node:assert/strict';
import { bySubject, calendarGrid, isoDate, mondayOf, subjectColor, topicOf, type CalendarTask } from '../src/lib/calendar.ts';

// Semana de segunda a domingo, como na referência.
const week = calendarGrid('week', new Date(2026, 10, 18)); // qua 18/11/2026
assert.deepEqual(week.map(isoDate), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
assert.equal(isoDate(mondayOf(new Date(2026, 10, 22))), '2026-11-16'); // domingo pertence à semana que começou na segunda

// Mês com as semanas das bordas: novembro/2026 começa num domingo → grade de 26/10 a 06/12 (42 dias).
const nov = calendarGrid('month', new Date(2026, 10, 18));
assert.equal(isoDate(nov[0]), '2026-10-26');
assert.equal(isoDate(nov[nov.length - 1]), '2026-12-06');
assert.equal(nov.length, 42);
assert.equal(calendarGrid('month', new Date(2026, 11, 1)).length, 35);

// Assunto a partir do título da tarefa.
assert.equal(topicOf({ title: 'Matemática: Teoria — Frações', subject: 'Matemática' }), 'Frações');
assert.equal(topicOf({ title: 'Matemática: estudo programado', subject: 'Matemática' }), 'estudo programado');

// Agrupa por matéria, soma minutos e marca feito só quando tudo foi feito.
const t = (subject: string, title: string, minutes: number, status: CalendarTask['status'] = 'PENDING'): CalendarTask => ({ id: null, subject, title, activityType: 'TEORIA', minutes, status });
const groups = bySubject([t('Matemática', 'Matemática: Teoria — Frações', 30, 'DONE'), t('Matemática', 'Matemática: Revisão — Conjuntos', 20, 'DONE'), t('Física', 'Física: Teoria — Cinemática', 30)]);
assert.deepEqual(groups.map((g) => [g.subject, g.minutes, g.topics.join(','), g.done]), [['Matemática', 50, 'Frações,Conjuntos', true], ['Física', 30, 'Cinemática', false]]);

// Mesma matéria, mesma cor.
assert.equal(subjectColor('Química'), subjectColor('Química'));
console.log('calendário do cronograma: ok');
