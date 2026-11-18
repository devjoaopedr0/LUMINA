import assert from 'node:assert/strict';
import { formatClock, formatRoomDuration, leftMessage, liveSeconds } from '../src/lib/group-rooms.ts';

// Cronômetro ao vivo: anda só quando está estudando e só com o intervalo decorrido.
assert.equal(liveSeconds(120, true, 1_000, 31_500), 150);
assert.equal(liveSeconds(120, false, 1_000, 31_500), 120);
assert.equal(liveSeconds(null, true, 1_000, 31_500), null);
assert.equal(liveSeconds(10, true, 5_000, 4_000), 10, 'relógio do aparelho atrasado não faz o tempo voltar');

// Formatos.
assert.equal(formatClock(42), '0:42');
assert.equal(formatClock(12 * 60 + 5), '12:05');
assert.equal(formatClock(3789), '1:03:09');
assert.equal(formatClock(null), '—');
assert.equal(formatRoomDuration(45 * 60), '45 min');
assert.equal(formatRoomDuration(80 * 60), '1 h 20 min');
assert.equal(formatRoomDuration(120 * 60), '2 h');

// Mensagem ao sair.
assert.match(leftMessage(35), /35 min foram para o seu histórico/);
assert.match(leftMessage(0), /Menos de 1 minuto/);

console.log('salas do grupo: cronômetro, formatos e mensagens conferidos.');
