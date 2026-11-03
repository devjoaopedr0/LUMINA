import { HttpStatus } from '@nestjs/common';
import { EssayCorrectionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiService, parseModelRef } from '../../ai/ai.service';
import { CorrectionQuotaExceededException, EssayCorrectionService } from '../essay-correction.service';
import { buildQuota, monthlyCorrectionLimit, periodStart, quotaExceededMessage, quotaPeriod, quotaResetsAt } from './correction-quota';

describe('Cota mensal: período e mensagens', () => {
  it('usa o mês de Brasília, não o de UTC', () => {
    // 01/12 01:00 UTC = 30/11 22:00 em Brasília: ainda é novembro.
    expect(quotaPeriod(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11');
    expect(quotaPeriod(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12');
  });

  it('renova à meia-noite de Brasília do dia 1º, inclusive na virada do ano', () => {
    expect(quotaResetsAt('2026-11').toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(quotaResetsAt('2026-12').toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(periodStart('2026-11').toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('limite padrão 4, configurável só com inteiro positivo', () => {
    expect(monthlyCorrectionLimit(undefined)).toBe(4);
    expect(monthlyCorrectionLimit('10')).toBe(10);
    expect(monthlyCorrectionLimit('0')).toBe(4);
    expect(monthlyCorrectionLimit('abc')).toBe(4);
    expect(monthlyCorrectionLimit('2.5')).toBe(4);
  });

  it('restante nunca fica negativo e a mensagem diz quando renova', () => {
    const quota = buildQuota(4, 6, '2026-12');
    expect(quota.remaining).toBe(0);
    expect(quotaExceededMessage(quota)).toBe('Você já usou as 4 correções por IA de dezembro. Elas renovam em 1º de janeiro.');
  });
});

/** Prisma em memória, só com o que a reserva da cota usa. */
function fakePrisma(opts: { used?: number; inProgress?: boolean } = {}) {
  const usages: { id: string; userId: string; period: string; refundedAt: Date | null }[] = Array.from({ length: opts.used ?? 0 }, (_, i) => ({
    id: `u${i}`,
    userId: 'aluno',
    period: quotaPeriod(),
    refundedAt: null,
  }));
  let correction: { status: EssayCorrectionStatus; updatedAt: Date } | null = opts.inProgress ? { status: EssayCorrectionStatus.IN_PROGRESS, updatedAt: new Date() } : null;
  const countActive = ({ where }: { where: { userId: string; period: string } }) =>
    usages.filter((u) => u.userId === where.userId && u.period === where.period && !u.refundedAt).length;
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    essayCorrection: {
      findUnique: async () => correction,
      upsert: async () => {
        correction = { status: EssayCorrectionStatus.IN_PROGRESS, updatedAt: new Date() };
        return correction;
      },
    },
    essayCorrectionUsage: {
      count: async (args: { where: { userId: string; period: string } }) => countActive(args),
      create: async ({ data }: { data: { userId: string; period: string } }) => {
        const row = { id: `u${usages.length}`, ...data, refundedAt: null };
        usages.push(row);
        return row;
      },
    },
  };
  const prisma = {
    usages,
    tx,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    essay: {
      findFirst: async ({ include }: { include?: unknown }) =>
        include
          ? { id: 'e1', userId: 'aluno', version: 1, content: 'palavra '.repeat(200), theme: 'Tema', correction }
          : { id: 'e1', version: 1, correction: correction ? { ...correction, id: 'c1', essayVersion: 1, details: [], auditJson: {}, totalScore: 0 } : null },
    },
    essayCorrection: { update: async () => ({}) },
    essayCorrectionUsage: {
      count: async (args: { where: { userId: string; period: string } }) => countActive(args),
      updateMany: async ({ where }: { where: { id: string } }) => {
        const row = usages.find((u) => u.id === where.id && !u.refundedAt);
        if (row) row.refundedAt = new Date();
        return { count: row ? 1 : 0 };
      },
    },
  };
  return prisma;
}

function serviceWith(prisma: ReturnType<typeof fakePrisma>, grade: () => Promise<unknown>) {
  const service = new EssayCorrectionService(prisma as never, {} as never);
  vi.spyOn(service, 'gradeText').mockImplementation(grade as never);
  return service;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Cota mensal: reserva e devolução', () => {
  it('a 5ª correção do mês é recusada com 429 e a cota no corpo', async () => {
    const prisma = fakePrisma({ used: 4 });
    const service = serviceWith(prisma, async () => ({ method: 'dois-avaliadores' }));
    const error = await service.requestCorrection('aluno', 'e1').catch((e) => e);
    expect(error).toBeInstanceOf(CorrectionQuotaExceededException);
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse().quota).toMatchObject({ limit: 4, used: 4, remaining: 0 });
    expect(prisma.usages).toHaveLength(4);
  });

  it('consome um crédito, trava por aluno e devolve a cota atualizada', async () => {
    const prisma = fakePrisma({ used: 1 });
    const service = serviceWith(prisma, () => new Promise(() => undefined));
    const result = (await service.requestCorrection('aluno', 'e1')) as { quota?: unknown };
    expect(prisma.tx.$executeRaw).toHaveBeenCalled();
    expect(result.quota).toMatchObject({ used: 2, remaining: 2 });
  });

  it('pedido repetido com a correção em andamento não gasta outro crédito', async () => {
    const prisma = fakePrisma({ used: 1, inProgress: true });
    const service = serviceWith(prisma, async () => ({}));
    // Com a correção em andamento há pouco, a primeira checagem já devolve.
    await service.requestCorrection('aluno', 'e1');
    expect(prisma.usages).toHaveLength(1);
  });

  it('falha da IA devolve o crédito', async () => {
    const prisma = fakePrisma();
    const service = serviceWith(prisma, async () => {
      throw new Error('todos os modelos falharam');
    });
    await service.requestCorrection('aluno', 'e1');
    await flush();
    expect(prisma.usages[0].refundedAt).toBeInstanceOf(Date);
    expect((await service.getQuota('aluno')).remaining).toBe(4);
  });

  it('nota pelo modelo estatístico (sem IA) também devolve o crédito', async () => {
    const prisma = fakePrisma();
    // A gravação do resultado não está no Prisma falso; o que importa aqui é
    // a devolução, que acontece antes dela.
    const service = serviceWith(prisma, async () => ({ method: 'modelo-estatistico', competencies: [], runs: [], toolCalls: [], total: 0 }));
    await service.requestCorrection('aluno', 'e1');
    await flush();
    expect(prisma.usages[0].refundedAt).toBeInstanceOf(Date);
  });
});

describe('Roteamento de modelos entre provedores', () => {
  it('limite por minuto: segura a chamada além do limite e lê AI_RPM_LIMITS', async () => {
    const env: Record<string, string> = { AI_RPM_LIMITS: 'gemini:gemini-x=2,groq=50' };
    const ai = new AiService({ get: (k: string) => env[k] } as never) as unknown as {
      rpmLimit: (p: string, m: string) => number | null;
      acquireRateSlot: (p: string, m: string) => Promise<boolean>;
    };
    expect(ai.rpmLimit('Gemini', 'gemini-x')).toBe(2);
    expect(ai.rpmLimit('Gemini', 'outro')).toBe(15);
    expect(ai.rpmLimit('Groq', 'qualquer')).toBe(50);
    expect(ai.rpmLimit('OpenRouter', 'm')).toBeNull();
    vi.useFakeTimers();
    try {
      expect(await ai.acquireRateSlot('Gemini', 'gemini-x')).toBe(true);
      expect(await ai.acquireRateSlot('Gemini', 'gemini-x')).toBe(true);
      let third: boolean | null = null;
      void ai.acquireRateSlot('Gemini', 'gemini-x').then((v) => (third = v));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(third).toBeNull();
      await vi.advanceTimersByTimeAsync(31_000);
      expect(third).toBe(true);
      // Com espera máxima menor que a janela, desiste (e a cadeia troca de modelo).
      env.AI_RATE_MAX_WAIT_MS = '5000';
      expect(await ai.acquireRateSlot('Gemini', 'gemini-x')).toBe(true);
      expect(await ai.acquireRateSlot('Gemini', 'gemini-x')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prefixo só conta quando é um provedor conhecido', () => {
    expect(parseModelRef('gemini:gemini-3.5-flash-lite', 'openrouter')).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    expect(parseModelRef('groq:openai/gpt-oss-120b', 'openrouter')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(parseModelRef('nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter')).toEqual({ provider: 'openrouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free' });
  });
});
