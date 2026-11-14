import assert from 'node:assert/strict';
import {
  atItemLimit,
  categoryLabel,
  isCustomCategory,
  missingRepertoireFields,
  repertoireInsertText,
  repertoireSections,
  suggestionToPayload,
  toQueryString,
  usageLabel,
  type Repertoire,
} from '../src/lib/notebooks.ts';

const base: Repertoire = {
  id: 'r1',
  userId: 'u1',
  title: 'Modernidade líquida',
  summary: 'Relações frágeis e passageiras na sociedade de consumo.',
  category: 'SOCIOLOGIA',
  author: 'Zygmunt Bauman',
  referenceType: 'CONCEITO',
  source: null,
  year: 2000,
  theme: 'CULTURA',
  keywords: [],
  relatedThemes: ['Consumo', 'Redes sociais'],
  context: null,
  importance: null,
  essayUse: 'Para discutir laços sociais frágeis.',
  example: null,
  notes: null,
  isStudied: false,
  isFavorite: false,
  isPlatform: false,
  origin: 'MANUAL',
  platformSourceId: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

// Categorias fixas viram rótulo; a categoria própria fica com o nome do aluno.
assert.equal(categoryLabel('CINEMA_SERIES'), 'Cinema e séries');
assert.equal(categoryLabel('Minhas leituras'), 'Minhas leituras');
assert.equal(isCustomCategory('Minhas leituras'), true);
assert.equal(isCustomCategory('FILOSOFIA'), false);

// Seções na ordem da especificação; as vazias somem.
const titles = repertoireSections(base).map((s) => s.title);
assert.deepEqual(titles, ['1. Autor, obra ou documento', '3. Ideia central', '7. Temas de redação', 'Como usar na redação']);
assert.match(repertoireSections({ ...base, year: -350 })[0].body, /Ano: 350 a\.C\./);

assert.deepEqual(missingRepertoireFields(base), ['contexto', 'problemas que explica', 'relação com o Brasil', 'exemplo de uso', 'cuidados de uso', 'fonte']);

// Inserir na redação: o exemplo pronto, senão uma menção ao autor.
assert.equal(repertoireInsertText(base), 'Segundo Zygmunt Bauman, em "Modernidade líquida", ');
assert.equal(repertoireInsertText({ ...base, example: '  Como alerta Bauman, ...  ' }), 'Como alerta Bauman, ...');
assert.equal(repertoireInsertText({ ...base, author: null }), 'Como mostra "Modernidade líquida", ');

// Sugestão da LuminIA vira rascunho com origem AI e o "conferir" nas anotações.
const draft = suggestionToPayload(
  { title: 'Lei X', author: null, category: 'LEGISLACAO', referenceType: 'LEI', context: 'Contexto.', relation: 'Garante o direito discutido.', howToArgue: 'Contraste.', example: 'Ex.', verify: 'número do artigo' },
  'Educação',
);
assert.equal(draft.origin, 'AI');
assert.deepEqual(draft.relatedThemes, ['Educação']);
assert.equal(draft.notes, 'Conferir: número do artigo');

assert.equal(usageLabel(12, { tier: 'FREE', itemLimit: 20, collectionLimit: 2 }), '12 de 20');
assert.equal(usageLabel(12, { tier: 'PREMIUM', itemLimit: 2000, collectionLimit: 100 }), '12');
assert.equal(atItemLimit(20, { tier: 'FREE', itemLimit: 20, collectionLimit: 2 }), true);
assert.equal(atItemLimit(20, { tier: 'PREMIUM', itemLimit: 2000, collectionLimit: 100 }), false);

assert.equal(toQueryString({ q: 'bauman', favorite: true, category: '', scope: undefined, toMemorize: false }), '?q=bauman&favorite=true');
assert.equal(toQueryString({}), '');

console.log('cadernos: ok');

// Markdown simples da LuminIA: títulos, listas e negrito, sem HTML.
import { parseAiBlocks, splitBold } from '../src/lib/notebooks.ts';
assert.deepEqual(parseAiBlocks('## O que é\nUma ideia\ncontinuada.\n\n- um\n- dois\n1. primeiro'), [
  { kind: 'heading', text: 'O que é' },
  { kind: 'paragraph', text: 'Uma ideia continuada.' },
  { kind: 'list', ordered: false, items: ['um', 'dois'] },
  { kind: 'list', ordered: true, items: ['primeiro'] },
]);
assert.deepEqual(splitBold('O **Big Brother** vigia'), [
  { text: 'O ', bold: false },
  { text: 'Big Brother', bold: true },
  { text: ' vigia', bold: false },
]);
assert.equal(splitBold('<script>x</script>')[0].text, '<script>x</script>');
console.log('cadernos (texto da LuminIA): ok');

// ---- Especificação completa (13/11/2026): 10 itens, guia das 5 perguntas e mapa de aplicação
import { byArgumentFunction, practiceGuide, AXIS_LABEL, FUNCTION_LABEL } from '../src/lib/notebooks.ts';
const full = { ...base, axes: ['MIDIA_COMPORTAMENTO'], argumentFunctions: ['COMPORTAMENTOS_COLETIVOS'], concepts: ['liquidez'], socialProblems: 'Solidão nas redes.', brazilRelation: 'Uso intenso de redes no Brasil.', exampleSlot: 'D2', example: 'Parágrafo modelo.', connections: 'Byung-Chul Han.', pitfalls: 'Não use como palavra solta.', quote: null, quoteSource: null } as Repertoire;
const fullTitles = repertoireSections(full).map((s) => s.title);
assert.deepEqual(fullTitles.slice(0, 7), ['1. Autor, obra ou documento', '3. Ideia central', '4. Conceitos fundamentais', '5. Problemas sociais que ajuda a explicar', '6. Relação com a realidade brasileira', '7. Temas de redação', '8. Exemplo de aplicação (D2)']);
assert.match(repertoireSections(full)[0].body, /Eixos: Mídia, comunicação e comportamento social/);
const guide = practiceGuide(full);
assert.equal(guide.length, 5);
assert.equal(guide[0].question, 'O que esse repertório defende?');
assert.match(guide[4].answer!, /Parágrafo modelo\.[\s\S]*Cuidado: Não use como palavra solta\./);
assert.equal(practiceGuide({ ...full, socialProblems: null }).find((g) => g.question.startsWith('Qual problema'))!.answer, null);
const map = byArgumentFunction([full, { ...full, argumentFunctions: ['OMISSAO_ESTATAL'] }]);
assert.equal(map.length, 8);
assert.equal(map.find((m) => m.fn === 'COMPORTAMENTOS_COLETIVOS')!.items.length, 1);
assert.equal(Object.keys(AXIS_LABEL).length, 10);
assert.equal(Object.keys(FUNCTION_LABEL).length, 8);
console.log('cadernos (especificação completa): ok');

// ---- Parágrafo do cursor (análise de uso do repertório no editor)
import { paragraphAt } from '../src/lib/notebooks.ts';
const essay = 'Introdução aqui.\nSegundo Bauman, vivemos tempos líquidos.\n\nConclusão.';
assert.equal(paragraphAt(essay, essay.indexOf('Bauman')), 'Segundo Bauman, vivemos tempos líquidos.');
assert.equal(paragraphAt(essay, essay.indexOf('\n\n') + 1), 'Segundo Bauman, vivemos tempos líquidos.');
assert.equal(paragraphAt(essay, essay.length), 'Conclusão.');
assert.equal(paragraphAt('', 0), '');
console.log('cadernos (parágrafo do cursor): ok');
