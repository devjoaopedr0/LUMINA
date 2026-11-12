import assert from 'node:assert/strict';
import {
  PLAN_COMPARISON,
  billingStatusText,
  formatPrice,
  maskCpfCnpj,
  planOriginText,
  usageRatio,
  usageText,
  type UsageSnapshot,
} from '../src/lib/plans.ts';

const usage = (over: Partial<UsageSnapshot>): UsageSnapshot => ({
  feature: 'LUMINIA_MESSAGE',
  window: 'day',
  limit: 10,
  used: 3,
  remaining: 7,
  period: '2026-11-11',
  resetsAt: '2026-11-12T03:00:00.000Z',
  ...over,
});

assert.equal(usageText(usage({})), '3 de 10 hoje');
assert.equal(usageText(usage({ window: 'month', limit: 2, used: 1 })), '1 de 2 neste mês');
assert.equal(usageText(usage({ window: 'month', limit: null, used: 5 })), '5 neste mês (sem limite)');
assert.equal(usageText(usage({ limit: 0, used: 0 })), 'Não incluso no seu plano');
assert.equal(usageRatio(usage({ used: 12 })), 1);
assert.equal(usageRatio(usage({ limit: null })), 0);

assert.equal(formatPrice(2990).replace(/\s/g, ' '), 'R$ 29,90');
assert.equal(formatPrice(null), '');

assert.equal(maskCpfCnpj('52998224725'), '529.982.247-25');
assert.equal(maskCpfCnpj('11222333000181'), '11.222.333/0001-81');
assert.equal(maskCpfCnpj('529.98'), '529.98');

const founder = planOriginText({
  tier: 'PREMIUM',
  source: 'FOUNDER',
  accessUntil: '2027-03-11T15:00:00.000Z',
  access: { founderNumber: 7 } as never,
});
assert.equal(founder, 'Você é fundador nº 7 da Lumina: Premium sem cobrança até 11/03/2027.');
assert.equal(planOriginText({ tier: 'FREE', source: 'NONE', accessUntil: null, access: null }), 'Você está no plano Gratuito.');

const pendingNoLink = { status: 'PENDING', invoiceUrl: null, currentPeriodEnd: null } as never;
assert.match(billingStatusText(pendingNoLink), /link da cobrança aparece/);

// A tabela precisa cobrir os quatro recursos com limite.
assert.deepEqual(PLAN_COMPARISON.map((row) => row.feature).sort(), ['ESSAY_CORRECTION', 'FLASHCARD_AI', 'LUMINIA_MESSAGE', 'SIMULATION']);

console.log('planos: ok');
