import assert from 'node:assert/strict';
import {
  adicionarOpcao,
  initialTranscriptionState,
  MAX_OPTIONS,
  positionLetter,
  prepararTranscricaoParaEnvio,
  removerOpcao,
  validarTranscricao,
  type TranscribedQuestion,
} from '../src/lib/question-transcription.ts';
import type { WebSearchHit } from '../src/lib/api.ts';

const hit: WebSearchHit = {
  title: 'ENEM 2023 — Funções exponenciais',
  link: 'https://exemplo.org/questao',
  snippet: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
  classification: {
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    exam: 'ENEM',
    year: 2023,
    difficulty: 'MEDIA',
  },
};

const base = initialTranscriptionState(hit);
assert.equal(base.subject, 'Matemática');
assert.equal(base.year, '2023');
assert.equal(base.stem, 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:');
assert.deepEqual(base.options, ['', '']);
assert.deepEqual(base.optionExplanations, ['', '']);

// Trecho curto demais não entra como enunciado: é só um pedaço de resultado.
assert.equal(initialTranscriptionState({ ...hit, snippet: 'oi' }).stem, '');

// Sem classificação, o formulário abre em branco (não inventa matéria).
const semClassificacao = initialTranscriptionState({ title: 'x', link: 'https://exemplo.org/x' });
assert.equal(semClassificacao.subject, '');
assert.equal(semClassificacao.difficulty, 'MEDIA');

assert.equal(positionLetter(1), 'A');
assert.equal(positionLetter(4), 'D');
assert.equal(positionLetter(7), '7');

// --- Alinhamento entre alternativa e justificativa ---------------------------
const preenchida = (quantas: number): TranscribedQuestion => {
  let atual = base;
  while (atual.options.length < quantas) atual = adicionarOpcao(atual);
  return {
    ...atual,
    options: Array.from({ length: quantas }, (_, i) => `alternativa ${i + 1}`),
    optionExplanations: Array.from({ length: quantas }, (_, i) => `porque ${i + 1}`),
  };
};

const comDuas = preenchida(2);
assert.deepEqual(adicionarOpcao(comDuas).options, ['alternativa 1', 'alternativa 2', '']);
assert.deepEqual(adicionarOpcao(comDuas).optionExplanations, ['porque 1', 'porque 2', '']);

// Remover a primeira leva a justificativa junto — o que sobra é o par da
// alternativa 2, não a alternativa 2 com a justificativa da 1.
const semPrimeira = removerOpcao(preenchida(3), 0);
assert.deepEqual(semPrimeira.options, ['alternativa 2', 'alternativa 3']);
assert.deepEqual(semPrimeira.optionExplanations, ['porque 2', 'porque 3']);
assert.equal(semPrimeira.correctIndex, 0);

// Gabarito depois da alternativa removida anda uma posição para trás.
const gabaritoNoTerceiro = preenchida(3);
const removeAntes = removerOpcao({ ...gabaritoNoTerceiro, correctIndex: 2 }, 0);
assert.equal(removeAntes.correctIndex, 1);
assert.equal(removeAntes.options.length, removeAntes.optionExplanations.length);
assert.deepEqual(removeAntes.optionExplanations, ['porque 2', 'porque 3']);

// Remover a alternativa correta devolve o gabarito ao início.
const removeACorreta = removerOpcao({ ...gabaritoNoTerceiro, correctIndex: 1 }, 1);
assert.equal(removeACorreta.correctIndex, 0);
assert.deepEqual(removeACorreta.optionExplanations, ['porque 1', 'porque 3']);

// Índice fora da lista não mexe em nada, e nunca se cai abaixo de duas
// alternativas (o botão "Remover" some, mas a regra também é do estado).
const tres = preenchida(3);
assert.deepEqual(removerOpcao(tres, 7), tres);
assert.deepEqual(removerOpcao(tres, -1), tres);
const duas = removerOpcao(tres, 0);
assert.equal(duas.options.length, 2);
assert.deepEqual(removerOpcao(duas, 0), duas, 'não remove a última alternativa antes de duas');

let cheio = preenchida(2);
while (cheio.options.length < MAX_OPTIONS) cheio = adicionarOpcao(cheio);
assert.equal(cheio.options.length, MAX_OPTIONS);
const excedido = adicionarOpcao(cheio);
assert.equal(excedido.options.length, MAX_OPTIONS);
assert.equal(excedido.optionExplanations.length, MAX_OPTIONS);

// --- Recorte do envio -------------------------------------------------------
// A justificativa da alternativa em branco é órfã: tem de sumir junto com ela.
const comBrancoNoMeio = {
  ...preenchida(4),
  options: ['4', '', '16', '32'],
  optionExplanations: [
    'leitura errada do expoente',
    'justificativa da alternativa em branco',
    'explicacao do 16',
    'explicacao do 32',
  ],
  correctIndex: 2,
};
const enviado = prepararTranscricaoParaEnvio(comBrancoNoMeio);
assert.deepEqual(enviado.options, ['4', '16', '32']);
assert.deepEqual(enviado.optionExplanations, [
  'leitura errada do expoente',
  'explicacao do 16',
  'explicacao do 32',
]);
assert.equal(enviado.correctIndex, 1, 'o gabarito aponta para a posição depois do recorte');
assert.equal(enviado.stem, base.stem);
assert.equal(enviado.topic, 'Funções exponenciais');
assert.equal(enviado.year, '2023');

assert.equal(
  prepararTranscricaoParaEnvio({ ...preenchida(3), correctIndex: 2, options: ['a', 'b', ''] })
    .correctIndex,
  -1,
  'gabarito em alternativa descartada vira -1, e a validação impede isso antes',
);

// --- Validação --------------------------------------------------------------
assert.equal(validarTranscricao(enviado), null);
assert.match(validarTranscricao({ ...enviado, subject: 'M' })!, /disciplina/i);
assert.match(validarTranscricao({ ...enviado, stem: 'oi' })!, /enunciado/i);
assert.match(
  validarTranscricao({ ...enviado, options: ['só uma'], optionExplanations: [''] })!,
  /alternativas/i,
);
assert.match(
  validarTranscricao({
    ...enviado,
    options: ['a', 'b', ''],
    optionExplanations: ['', '', ''],
    correctIndex: 2,
  })!,
  /correta/i,
  'alternativa vazia marcada como gabarito é recusada',
);

console.log(
  'Transcription checks passed: alignment, gabarito, blank option cleanup, validation, limits.',
);
