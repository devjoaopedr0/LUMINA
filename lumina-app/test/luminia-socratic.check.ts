import assert from 'node:assert/strict';
import { buildAiChatPayload } from '../src/lib/ai-chat-payload.ts';

const history = [
  { id: 'welcome', role: 'assistant' as const, content: 'Olá!' },
  { id: 'turn-1', role: 'user' as const, content: 'Não entendi funções.' },
];

const socratic = JSON.parse(
  buildAiChatPayload('Me conduza por perguntas.', history, {
    questionId: 'question-1',
    mode: 'SOCRATIC',
  }),
);

assert.deepEqual(socratic, {
  message: { role: 'user', content: 'Me conduza por perguntas.' },
  history: [
    { role: 'assistant', content: 'Olá!' },
    { role: 'user', content: 'Não entendi funções.' },
  ],
  questionId: 'question-1',
  mode: 'SOCRATIC',
});
assert.equal('id' in socratic.history[0], false, 'o DTO do backend recusa ids no histórico');

const direct = JSON.parse(
  buildAiChatPayload('Explique direto.', [], { scheduleTaskId: 'task-1' }),
);
assert.equal('mode' in direct, false, 'o modo padrão continua sendo resposta direta');
assert.equal(direct.scheduleTaskId, 'task-1');

console.log('LuminIA: modo socrático e payload do chat conferidos.');
