import assert from 'node:assert/strict';
import {
  buildSimilarQuestionPayload,
  SIMILAR_QUESTION_ENDPOINT,
} from '../src/lib/similar-question-payload.ts';

const payload = JSON.parse(buildSimilarQuestionPayload(' question-1 '));

assert.deepEqual(payload, { questionId: 'question-1' });
assert.equal(Object.keys(payload).length, 1, 'o cliente manda apenas o id');
assert.equal(SIMILAR_QUESTION_ENDPOINT, '/ai/questions/similar');

assert.throws(() => buildSimilarQuestionPayload('   '), /referência/);

console.log('LuminIA: pedido de questão parecida conferido.');
