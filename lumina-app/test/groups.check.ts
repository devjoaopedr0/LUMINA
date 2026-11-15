import assert from 'node:assert/strict';
import {
  assignableRoles,
  canRemove,
  formatLastActivity,
  formatStudyMinutes,
  groupInviteUrl,
  groupPayloadFromForm,
  initials,
  sharesNothing,
} from '../src/lib/groups.ts';

// Papéis: mesma regra do backend.
assert.deepEqual(assignableRoles('OWNER', 'MEMBER'), ['ADMIN', 'MODERATOR', 'MEMBER']);
assert.deepEqual(assignableRoles('ADMIN', 'MEMBER'), ['MODERATOR', 'MEMBER']);
assert.deepEqual(assignableRoles('ADMIN', 'ADMIN'), []);
assert.deepEqual(assignableRoles('MODERATOR', 'MEMBER'), []);
assert.deepEqual(assignableRoles('OWNER', 'OWNER'), []);
assert.equal(canRemove('MODERATOR', 'MEMBER'), true);
assert.equal(canRemove('MODERATOR', 'MODERATOR'), false);
assert.equal(canRemove('ADMIN', 'OWNER'), false);
assert.equal(canRemove('MEMBER', 'MEMBER'), false);

// Tempo e datas.
assert.equal(formatStudyMinutes(null), '—');
assert.equal(formatStudyMinutes(45), '45 min');
assert.equal(formatStudyMinutes(120), '2h');
assert.equal(formatStudyMinutes(135), '2h 15min');
const now = new Date(2026, 10, 14, 15, 0);
assert.equal(formatLastActivity(new Date(2026, 10, 14, 8, 0).toISOString(), now), 'hoje');
assert.equal(formatLastActivity(new Date(2026, 10, 13, 22, 0).toISOString(), now), 'ontem');
assert.equal(formatLastActivity(null, now), '—');

// Privacidade: sem nada ligado, a tela mostra só nome e foto.
const hidden = { todayMinutes: null, weekMinutes: null, totalMinutes: null, subjects: null, streakDays: null, lastActivityAt: null };
assert.equal(sharesNothing(hidden), true);
assert.equal(sharesNothing({ ...hidden, streakDays: 0 }), false);

assert.equal(initials('Ana Maria Souza'), 'AS');
assert.equal(initials('Bia'), 'B');
assert.equal(groupInviteUrl('https://app.lumina.dev', 'a.b+c'), 'https://app.lumina.dev/app/grupos/entrar?convite=a.b%2Bc');

// Formulário: vazios viram null; limite só quando é número válido.
const form = (entries: Record<string, string>) => ({ get: (name: string) => entries[name] ?? null });
assert.deepEqual(groupPayloadFromForm(form({ name: '  ENEM 2027 ', purpose: ' ', maxMembers: '12', requiresApproval: 'on' })), {
  name: 'ENEM 2027', description: null, purpose: null, rules: null, requiresApproval: true, maxMembers: 12,
});
assert.equal('maxMembers' in groupPayloadFromForm(form({ name: 'X', maxMembers: '' })), false);

console.log('groups: ok');
