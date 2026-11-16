import assert from 'node:assert/strict';
import { parseInline, parseRichText, plainText } from '../src/lib/rich-text.ts';

// A resposta real que chegou crua no chat (Bhaskara), com quebras de linha.
const bhaskara = [
  'A fórmula de Bhaskara serve para achar as raízes de uma equação do segundo grau. A fórmula é:',
  '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
  'Onde:',
  '- **a, b e c** são os coeficientes da equação $ax^2 + bx + c = 0$.',
  '- O sinal **$\\pm$** significa que dá duas respostas.',
  '',
  '**Exemplo prático:** Vamos resolver $x^2 - 5x + 6 = 0$.',
  '1. $x = \\frac{5 + 1}{2} = 3$',
  '2. $x = \\frac{5 - 1}{2} = 2$',
  'Então as raízes são **3** e **2**.',
].join('\n');

const blocks = parseRichText(bhaskara);
assert.deepEqual(blocks.map((b) => b.kind), ['paragraph', 'math', 'paragraph', 'list', 'paragraph', 'list', 'paragraph']);
assert.equal(blocks[1].kind === 'math' && blocks[1].tex, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
const bullets = blocks[3];
assert.ok(bullets.kind === 'list' && !bullets.ordered && bullets.items.length === 2);
assert.deepEqual(bullets.kind === 'list' && bullets.items[0].map((p) => p.kind), ['bold', 'text', 'math', 'text']);
const steps = blocks[5];
assert.ok(steps.kind === 'list' && steps.ordered && steps.start === 1 && steps.items.length === 2);

// Fórmula em destaque no meio da linha (como no texto colado, sem quebras).
const inlineDisplay = parseRichText('A fórmula é: $$x = 1$$ Onde: a é o coeficiente.');
assert.deepEqual(inlineDisplay.map((b) => b.kind), ['paragraph', 'math', 'paragraph']);

// \( \) e \[ \] também valem.
assert.deepEqual(parseRichText('Seja \\(a > 0\\).\n\\[y = ax\\]').map((b) => b.kind), ['paragraph', 'math']);

// Dinheiro não vira fórmula.
assert.deepEqual(parseInline('Custa R$ 5 e R$ 6 por km.').map((p) => p.kind), ['text']);
assert.deepEqual(parseInline('Custa R$5 e o total é $2x$.').map((p) => p.kind), ['text', 'math', 'text']);

// Itálico e código.
assert.deepEqual(parseInline('Use *sempre* o `delta`.').map((p) => p.kind), ['text', 'italic', 'text', 'code', 'text']);

// Texto puro para copiar.
assert.match(plainText(blocks), /^A fórmula de Bhaskara/);
assert.match(plainText(blocks), /1\. x = \\frac\{5 \+ 1\}\{2\} = 3/);
console.log('LuminIA (formato da resposta): ok');

// ---- Imagem no chat: só a mensagem atual leva a imagem; o histórico só avisa.
import { buildAiChatPayload, IMAGE_NOTE } from '../src/lib/ai-chat-payload.ts';
import { dataUrlBytes, fitSize } from '../src/lib/chat-image.ts';
{
  const body = JSON.parse(buildAiChatPayload('E essa?', [
    { role: 'user', content: 'Resolve isso', image: 'data:image/jpeg;base64,AAAA' },
    { role: 'assistant', content: 'É Bhaskara.' },
  ], { image: 'data:image/jpeg;base64,BBBB' }));
  assert.equal(body.image, 'data:image/jpeg;base64,BBBB');
  assert.equal(body.history[0].content, `Resolve isso\n\n${IMAGE_NOTE}`);
  assert.ok(!('image' in body.history[0]));
  assert.ok(!('image' in JSON.parse(buildAiChatPayload('oi', []))));
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.equal(dataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
  console.log('LuminIA (imagem no chat): ok');
}
