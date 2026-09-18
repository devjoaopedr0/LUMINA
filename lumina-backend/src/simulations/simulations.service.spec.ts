import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SimulationsService } from './simulations.service';

const userId = 'user-1';
const simulationId = 'simulation-1';
const sample = {
  id: simulationId, createdBy: 'teacher-1',
  class: { members: [{ id: 'member-1' }], teachers: [] },
  items: [
    { position: 1, correctPosition: 2, alternatives: [{ position: 1 }, { position: 2 }] },
    { position: 2, correctPosition: 1, alternatives: [{ position: 1 }, { position: 2 }] },
  ],
};

function setup(row: typeof sample | null = sample) {
  const prisma = {
    simulation: { findUnique: vi.fn().mockResolvedValue(row) },
    simulationSubmission: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ id: 'result-1', correct: 1, total: 2, submittedAt: new Date(), answers: [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 2 }], simulation: { items: sample.items } }),
    },
  };
  const service = new SimulationsService(prisma as never, {} as never);
  return { service, prisma };
}

describe('SimulationsService.submit', () => {
  it('corrige pelo gabarito congelado e retorna resultado do próprio aluno', async () => {
    const { service, prisma } = setup();
    const result = await service.submit(userId, simulationId, [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 2 }]);
    expect(prisma.simulationSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ correct: 1, total: 2, userId }) }));
    expect(result.items.map(item => item.isCorrect)).toEqual([true, false]);
  });

  it('recusa respostas duplicadas ou fora das alternativas', async () => {
    const { service, prisma } = setup();
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 1, selectedPosition: 2 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 3 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.simulationSubmission.create).not.toHaveBeenCalled();
  });

  it('recusa usuário sem acesso e segundo envio', async () => {
    const { service } = setup({ ...sample, class: { members: [], teachers: [] } });
    await expect(service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(NotFoundException);
    const other = setup();
    other.prisma.simulationSubmission.create.mockRejectedValue({ code: 'P2002' });
    await expect(other.service.submit(userId, simulationId, [{ position: 1, selectedPosition: 1 }, { position: 2, selectedPosition: 1 }])).rejects.toBeInstanceOf(ConflictException);
  });
});
