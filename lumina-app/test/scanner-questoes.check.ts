import assert from 'node:assert/strict';
import { dataUrlBytes, fitWithin, SCAN_ACCEPTED_TYPES } from '../src/lib/question-scan-image.ts';

// Foto de celular (4000x3000) cai para 1800 no lado maior, mantendo a proporção.
assert.deepEqual(fitWithin(4000, 3000), { width: 1800, height: 1350 });
assert.deepEqual(fitWithin(3000, 4000), { width: 1350, height: 1800 });
// Imagem pequena não cresce.
assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
assert.deepEqual(fitWithin(0, 600), { width: 0, height: 0 });

// Tamanho da data URL em bytes reais (o servidor aceita até 3 MB).
assert.equal(dataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
assert.equal(dataUrlBytes('data:image/jpeg;base64,AAA='), 2);
assert.equal(dataUrlBytes('data:image/jpeg;base64,AA=='), 1);

// PDF saiu da lista: o modelo de visão lê imagem.
assert.equal(SCAN_ACCEPTED_TYPES.includes('application/pdf'), false);

console.log('scanner de questões: ok');
