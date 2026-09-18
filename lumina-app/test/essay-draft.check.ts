import assert from 'node:assert/strict';
import { createEssaySaver, essayWordCount, parseLocalDraft, sameDraft, type SavedEssay } from '../src/lib/essay-draft.ts';

const initial: SavedEssay = { title: 'Teste', theme: 'Leitura', content: '', version: 0 };
assert.equal(essayWordCount('  Olá, Brasil!\n\nEducação e bem-estar.  '), 5);
assert.equal(essayWordCount(' ... \n'), 0);
assert.equal(parseLocalDraft('invalid'), null);
assert.equal(parseLocalDraft(JSON.stringify({ ...initial, schema: 2 })), null);
assert.equal(parseLocalDraft(JSON.stringify({ ...initial, schema: 1, content: 'a'.repeat(30001) })), null);
assert.deepEqual(parseLocalDraft(JSON.stringify({ ...initial, schema: 1 })), initial);

// Digitação durante requisição: resultado anterior não substitui o texto novo.
let resolveSave!: (saved: SavedEssay) => void;
const calls: SavedEssay[] = [];
const saver = createEssaySaver(initial, data => {
  calls.push(data);
  return new Promise(resolve => { resolveSave = resolve; });
}, () => {});
saver.edit({ ...initial, content: 'Primeiro parágrafo' });
const pending = saver.save();
saver.edit({ ...initial, content: 'Primeiro parágrafo e conclusão' });
assert.equal(await saver.save(), false);
assert.equal(calls.length, 1);
resolveSave({ ...calls[0], version: 1 });
assert.equal(await pending, true);
assert.equal(saver.getState().draft.content, 'Primeiro parágrafo e conclusão');
assert.equal(saver.getState().saved.content, 'Primeiro parágrafo');
assert.equal(saver.getState().version, 1);
const next = saver.save();
assert.equal(calls[1].version, 1);
resolveSave({ ...calls[1], version: 2 });
await next;
assert(sameDraft(saver.getState().draft, saver.getState().saved));
assert.equal(await saver.save(), true);
assert.equal(calls.length, 2);

// Falha de rede mantém texto e versão para repetir a mesma gravação.
let offline = true;
const retry = createEssaySaver(initial, async data => {
  if (offline) throw new Error('offline');
  return { ...data, version: data.version + 1 };
}, () => {});
retry.edit({ ...initial, content: 'Meu texto' });
assert.equal(await retry.save(), false);
assert.equal(retry.getState().version, 0);
assert.equal(retry.getState().draft.content, 'Meu texto');
offline = false;
assert.equal(await retry.save(), true);
assert.equal(retry.getState().version, 1);

// Conflito não pode ser ignorado por um clique em tentar novamente.
let conflicts = 0;
const conflict = createEssaySaver(initial, async () => {
  conflicts++;
  throw Object.assign(new Error('conflict'), { status: 409 });
}, () => {});
conflict.edit({ ...initial, content: 'Texto local' });
await conflict.save();
assert.equal(conflict.getState().conflict, true);
assert.equal(await conflict.save(), false);
assert.equal(conflicts, 1);
conflict.rebase({ ...initial, version: 7, content: 'Texto remoto' });
assert.equal(conflict.getState().version, 7);
assert.equal(conflict.getState().draft.content, 'Texto local');
assert.equal(conflict.getState().saved.content, 'Texto remoto');
assert.equal(conflict.getState().conflict, false);
conflict.markConflict();
assert.equal(await conflict.save(), false);
assert.equal(conflicts, 1);
console.log('Essay draft checks passed: recovery, concurrent typing, retries, conflicts, word count.');
