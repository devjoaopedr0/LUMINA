import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { CATALOG_TTL_MS, WebHitClassifierService } from './web-hit-classifier.service';

function makePrisma(fail = false) {
  return {
    subject: {
      findMany: fail
        ? vi.fn().mockRejectedValue(new Error('banco fora'))
        : vi.fn().mockResolvedValue([
            { id: 'mat', name: 'Matemática', topics: [{ id: 't-afim', name: 'Função afim' }, { id: 't-quad', name: 'Função quadrática' }] },
          ]),
    },
    exam: { findMany: vi.fn().mockResolvedValue([{ id: 'enem-2021', name: 'ENEM', year: 2021 }]) },
  } as unknown as PrismaService & { subject: { findMany: ReturnType<typeof vi.fn> } };
}

const hits = [
  { title: 'Blog de matemática', link: 'https://a.com/x', snippet: '' },
  { title: 'Função afim no ENEM 2021', link: 'https://b.com/y', snippet: '' },
];

describe('WebHitClassifierService', () => {
  it('classifica e sobe o resultado que bate com o assunto pedido', async () => {
    const service = new WebHitClassifierService(makePrisma());
    const ranked = await service.classifyAndRank(hits, { q: 'função afim', topic: 'Função afim' });
    expect(ranked[0].link).toBe('https://b.com/y');
    expect(ranked[0].classification).toMatchObject({ topic: 'Função afim', exam: 'ENEM', year: 2021, examId: 'enem-2021' });
    expect(ranked[1].classification).toMatchObject({ subject: 'Matemática', topic: null });
  });

  it('mantém a classificação que o provedor já trouxe', async () => {
    const service = new WebHitClassifierService(makePrisma());
    const [only] = await service.classifyAndRank([{ ...hits[1], classification: { subject: 'Física' } }], { q: 'x' });
    expect(only.classification).toEqual({ subject: 'Física' });
  });

  it('guarda o catálogo em cache pelo TTL', async () => {
    const prisma = makePrisma();
    const service = new WebHitClassifierService(prisma);
    await service.catalog(0);
    await service.catalog(CATALOG_TTL_MS - 1);
    expect(prisma.subject.findMany).toHaveBeenCalledTimes(1);
    await service.catalog(CATALOG_TTL_MS + 1);
    expect(prisma.subject.findMany).toHaveBeenCalledTimes(2);
  });

  it('sem catálogo devolve os resultados como vieram, sem quebrar a busca', async () => {
    const service = new WebHitClassifierService(makePrisma(true));
    expect(await service.classifyAndRank(hits, { q: 'x' })).toEqual(hits);
  });
});
