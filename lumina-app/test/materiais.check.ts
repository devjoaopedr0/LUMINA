import assert from 'node:assert/strict';
import { formatSize, groupByClass, needsFile, validateUpload, type Material } from '../src/lib/materials.ts';

assert.equal(needsFile('APOSTILA'), true);
assert.equal(needsFile('VIDEO'), false);

const pdf = { size: 1000, type: 'application/pdf' };
assert.equal(validateUpload({ title: 'Ap', kind: 'PDF', url: '', file: pdf }), 'Dê um título com pelo menos 3 letras.');
assert.equal(validateUpload({ title: 'Apostila', kind: 'PDF', url: '', file: null }), 'Escolha o arquivo em PDF.');
assert.match(validateUpload({ title: 'Slides', kind: 'SLIDES', url: '', file: { size: 10, type: 'application/vnd.ms-powerpoint' } })!, /só PDF/);
assert.match(validateUpload({ title: 'Apostila', kind: 'PDF', url: '', file: { size: 16 * 1024 * 1024, type: 'application/pdf' } })!, /15 MB/);
assert.equal(validateUpload({ title: 'Apostila', kind: 'PDF', url: '', file: pdf }), null);
assert.match(validateUpload({ title: 'Aula', kind: 'VIDEO', url: 'youtube.com/x', file: null })!, /http/);
assert.equal(validateUpload({ title: 'Aula', kind: 'VIDEO', url: 'https://youtube.com/x', file: null }), null);

assert.equal(formatSize(2048), '2 KB');
assert.equal(formatSize(1.5 * 1024 * 1024), '1,5 MB');
assert.equal(formatSize(null), '');

const m = (id: string, classId: string | null, className: string | null) => ({ id, classId, className } as Material);
const groups = groupByClass([m('1', 't1', 'Turma A'), m('2', null, null), m('3', 't1', 'Turma A')]);
assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [['Turma A', ['1', '3']], ['Minha biblioteca (só você vê)', ['2']]]);
console.log('central de materiais: ok');
