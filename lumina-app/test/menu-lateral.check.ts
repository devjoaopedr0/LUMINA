import assert from 'node:assert/strict';
import { isNavItemVisible } from '../src/lib/navigation.ts';

const turma = { onlyWithClasses: true };
const revisoes = { reviewersOnly: true };
const comum = {};

// Sem saber quem é (carregando): só os itens comuns.
assert.equal(isNavItemVisible(comum, { accountType: null, hasClasses: null }), true);
assert.equal(isNavItemVisible(turma, { accountType: null, hasClasses: null }), false);
assert.equal(isNavItemVisible(revisoes, { accountType: null, hasClasses: null }), false);

// Aluno independente: item de turma só depois de confirmar que tem turma.
assert.equal(isNavItemVisible(turma, { accountType: 'STUDENT_INDEPENDENT', hasClasses: null }), false);
assert.equal(isNavItemVisible(turma, { accountType: 'STUDENT_INDEPENDENT', hasClasses: false }), false);
assert.equal(isNavItemVisible(turma, { accountType: 'STUDENT_INDEPENDENT', hasClasses: true }), true);
assert.equal(isNavItemVisible(revisoes, { accountType: 'STUDENT_INDEPENDENT', hasClasses: true }), false);

// Aluno de escola e professor.
assert.equal(isNavItemVisible(turma, { accountType: 'STUDENT_INSTITUTION', hasClasses: null }), true);
assert.equal(isNavItemVisible(revisoes, { accountType: 'STUDENT_INSTITUTION', hasClasses: null }), false);
assert.equal(isNavItemVisible(revisoes, { accountType: 'TEACHER', hasClasses: null }), true);
assert.equal(isNavItemVisible(turma, { accountType: 'TEACHER', hasClasses: null }), true);
console.log('menu lateral: ok');
