import assert from 'node:assert/strict';
import { badgeCount, draftError, formatChatTime, timeAgo } from '../src/lib/group-chat.ts';

const now = new Date(2026, 10, 18, 15, 0);

// Horário das mensagens.
assert.equal(formatChatTime(new Date(2026, 10, 18, 14, 5).toISOString(), now), '14:05');
assert.equal(formatChatTime(new Date(2026, 10, 17, 9, 30).toISOString(), now), 'ontem 09:30');
assert.equal(formatChatTime(new Date(2026, 10, 12, 20, 0).toISOString(), now), '12/11 20:00');

// "Há quanto tempo" no sino.
assert.equal(timeAgo(new Date(2026, 10, 18, 14, 59, 40).toISOString(), now), 'agora');
assert.equal(timeAgo(new Date(2026, 10, 18, 14, 55).toISOString(), now), 'há 5 min');
assert.equal(timeAgo(new Date(2026, 10, 18, 12, 0).toISOString(), now), 'há 3 h');
assert.equal(timeAgo(new Date(2026, 10, 16, 15, 0).toISOString(), now), 'há 2 dias');

// Contador do sino.
assert.equal(badgeCount(0), null);
assert.equal(badgeCount(3), '3');
assert.equal(badgeCount(12), '9+');

// Rascunho.
assert.equal(draftError('   '), 'Escreva uma mensagem.');
assert.equal(draftError('a'.repeat(1001)), 'Até 1000 caracteres.');
assert.equal(draftError('Bora revisar?'), null);

console.log('comunicação do grupo: horários, sino e rascunho conferidos.');
