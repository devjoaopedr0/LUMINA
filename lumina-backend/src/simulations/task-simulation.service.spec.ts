import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskSimulationService } from './task-simulation.service';

const userId = 'user';
const task = {
  id: 'task', activityType: 'SIMULADO', scheduledMinutes: 60, simulationId: null,
  subject: { name: 'Física' },
  topic: { id: 'ondas', name: 'Ondas', subjectId: 'qb-physics' },
  schedule: { userId },
};
const question = (id: string, topicId: string) => ({ id, topicId, progress: null });
const valid = (id: string) => ({
  id, alternatives: [{ position: 1, isCorrect: false }, { position: 2, isCorrect: true }, { position: 3, isCorrect: false }],
});

describe('TaskSimulationService', () => {
  let prisma: any;
  let questions: any;
  let simulations: any;
  let schedules: any;
  let service: TaskSimulationService;

  beforeEach(() => {
    prisma = {
      studyTask: { findUnique: vi.fn().mockResolvedValue(task), update: vi.fn() },
      simulation: { findUnique: vi.fn().mockResolvedValue(null) },
      topicMastery: { findMany: vi.fn().mockResolvedValue([{ topicId: 'optica' }]) },
      question: { findMany: vi.fn(({ where }: any) => Promise.resolve(where.id.in.map(valid))) },
    };
    const topicQuestions = Array.from({ length: 12 }, (_, i) => question(`ondas-${i}`, 'ondas'));
    const subjectQuestions = [
      ...topicQuestions,
      ...Array.from({ length: 10 }, (_, i) => question(`optica-${i}`, 'optica')),
      // Tópico que o aluno nunca estudou: não entra em simulado.
      ...Array.from({ length: 10 }, (_, i) => question(`moderna-${i}`, 'moderna')),
    ];
    questions = {
      findAll: vi.fn((_user: string, query: any) => Promise.resolve({ items: query.topicId ? topicQuestions : subjectQuestions })),
    };
    simulations = { create: vi.fn().mockResolvedValue({ id: 'simulation' }) };
    schedules = { completeTasksFromSimulation: vi.fn().mockResolvedValue(1) };
    service = new TaskSimulationService(prisma, questions, simulations, schedules);
  });

  it('monta um simulado cronometrado: maior parte do tópico, o resto do que o aluno já estudou na matéria', async () => {
    expect(await service.startForTask(userId, 'task')).toEqual({ simulationId: 'simulation', created: true });

    const [creator, title, ids, classId, type, dueAt, duration, realExam] = simulations.create.mock.calls[0];
    expect(creator).toBe(userId);
    expect(title).toBe('Simulado — Física: Ondas');
    expect([classId, type, dueAt, duration, realExam]).toEqual([undefined, 'SIMULATION', undefined, 60, false]);
    expect(ids).toHaveLength(15);
    expect(ids.filter((id: string) => id.startsWith('ondas-'))).toHaveLength(8);
    expect(ids.filter((id: string) => id.startsWith('optica-'))).toHaveLength(7);
    expect(ids.some((id: string) => id.startsWith('moderna-'))).toBe(false);
    expect(prisma.studyTask.update).toHaveBeenCalledWith({ where: { id: 'task' }, data: { simulationId: 'simulation' } });
  });

  it('sem outros tópicos estudados, completa com o próprio tópico', async () => {
    prisma.topicMastery.findMany.mockResolvedValue([]);
    await service.startForTask(userId, 'task');
    const ids = simulations.create.mock.calls[0][2];
    expect(ids).toHaveLength(12);
    expect(ids.every((id: string) => id.startsWith('ondas-'))).toBe(true);
  });

  it('questão fora do formato do cartão-resposta fica de fora', async () => {
    prisma.question.findMany.mockImplementation(({ where }: any) => Promise.resolve(
      where.id.in.map((id: string) => id === 'ondas-0'
        ? { id, alternatives: [{ position: 1, isCorrect: true }, { position: 2, isCorrect: true }] }
        : valid(id)),
    ));
    await service.startForTask(userId, 'task');
    expect(simulations.create.mock.calls[0][2]).not.toContain('ondas-0');
  });

  it('abrir de novo devolve o simulado que a tarefa já tem', async () => {
    prisma.studyTask.findUnique.mockResolvedValue({ ...task, simulationId: 'simulation' });
    prisma.simulation.findUnique.mockResolvedValue({ id: 'simulation' });
    expect(await service.startForTask(userId, 'task')).toEqual({ simulationId: 'simulation', created: false });
    expect(simulations.create).not.toHaveBeenCalled();
  });

  it('poucas questões, tarefa que não é de simulado ou de outro aluno não abrem simulado', async () => {
    questions.findAll.mockResolvedValue({ items: [question('ondas-0', 'ondas'), question('ondas-1', 'ondas')] });
    await expect(service.startForTask(userId, 'task')).rejects.toThrow('questões suficientes');

    prisma.studyTask.findUnique.mockResolvedValue({ ...task, activityType: 'TEORIA' });
    await expect(service.startForTask(userId, 'task')).rejects.toThrow('Só tarefas de simulado');

    prisma.studyTask.findUnique.mockResolvedValue({ ...task, schedule: { userId: 'outro' } });
    expect(await service.startForTask(userId, 'task')).toBeNull();
    expect(simulations.create).not.toHaveBeenCalled();
  });

  it('simulado enviado conclui a tarefa do cronograma com a nota', async () => {
    await service.completeFromSubmission(userId, 'simulation', 11, 15);
    expect(schedules.completeTasksFromSimulation).toHaveBeenCalledWith(userId, 'simulation', 11, 15);
  });
});
