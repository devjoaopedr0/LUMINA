import { describe, expect, it, vi } from 'vitest';
import { LESSON_SECTIONS, lessonUserPrompt, parseLesson } from './topic-lesson';
import { TopicLessonsService } from './topic-lessons.service';

const userId = 'user';
const body = 'Texto de estudo com o conteúdo da seção, longo o bastante para valer como resumo de verdade. '.repeat(2).trim();
const lessonText = LESSON_SECTIONS.map((section) => `## ${section}\n${body}`).join('\n\n');

describe('parseLesson', () => {
  it('aceita o texto com todas as seções e tira o que vier antes da primeira', () => {
    expect(parseLesson(`Claro! Aqui está:\n\n${lessonText}`)).toBe(lessonText);
    expect(parseLesson('```markdown\n' + lessonText + '\n```')).toBe(lessonText);
  });

  it('recusa texto sem alguma seção, curto demais ou sem estrutura', () => {
    expect(parseLesson(lessonText.replace('## Erros comuns', '## Outra coisa'))).toBeNull();
    expect(parseLesson(LESSON_SECTIONS.map((section) => `## ${section}\nok`).join('\n'))).toBeNull();
    expect(parseLesson('Função afim é uma função do primeiro grau.')).toBeNull();
  });

  it('o pedido leva o tópico, a matéria e a orientação do nível', () => {
    const prompt = lessonUserPrompt({ subjectName: 'Matemática', topicName: 'Frações', level: 'BASE' });
    expect(prompt).toContain('"Frações", de Matemática');
    expect(prompt).toContain('explique do zero');
    expect(lessonUserPrompt({ subjectName: 'Matemática', topicName: 'Novo', level: null })).not.toContain('\n');
  });
});

describe('TopicLessonsService.lessonForTask', () => {
  const task = {
    id: 'task',
    subject: { name: 'Matemática', code: 'MATH' },
    topic: { id: 'topic', name: 'Função afim' },
    schedule: { userId },
  };
  function setup() {
    const prisma: any = {
      studyTask: { findUnique: vi.fn().mockResolvedValue(task) },
      topicLesson: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(({ create }: any) => Promise.resolve({ ...create, updatedAt: new Date('2026-10-12') })),
      },
    };
    const ai: any = { generateText: vi.fn().mockResolvedValue(lessonText) };
    return { prisma, ai, service: new TopicLessonsService(prisma, ai) };
  }

  it('gera o resumo na primeira abertura e guarda por tópico', async () => {
    const { service, prisma, ai } = setup();
    const lesson = await service.lessonForTask(userId, 'task');
    expect(lesson).toMatchObject({
      taskId: 'task', subject: 'Matemática', topic: 'Função afim', level: 'INTERMEDIARIO', content: lessonText, source: 'AI',
    });
    expect(ai.generateText.mock.calls[0][0].prompt).toContain('"Função afim", de Matemática');
    expect(prisma.topicLesson.upsert).toHaveBeenCalledWith({
      where: { topicId: 'topic' }, create: { topicId: 'topic', content: lessonText, source: 'AI' }, update: {},
    });
  });

  it('resumo já guardado volta direto, sem chamar a IA', async () => {
    const { service, prisma, ai } = setup();
    prisma.topicLesson.findUnique.mockResolvedValue({ content: 'salvo', source: 'MANUAL', updatedAt: new Date() });
    expect(await service.lessonForTask(userId, 'task')).toMatchObject({ content: 'salvo', source: 'MANUAL' });
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it('texto fora da estrutura, IA fora do ar ou sem provedor: avisa e não guarda nada', async () => {
    const { service, prisma, ai } = setup();
    for (const outcome of [
      () => Promise.resolve('texto solto, sem seções'),
      () => Promise.reject(new Error('timeout')),
      () => Promise.resolve(null),
    ]) {
      ai.generateText.mockImplementationOnce(outcome);
      await expect(service.lessonForTask(userId, 'task')).rejects.toThrow('Não consegui preparar o resumo');
    }
    expect(prisma.topicLesson.upsert).not.toHaveBeenCalled();
  });

  it('dois pedidos ao mesmo tempo para o mesmo tópico geram uma vez só', async () => {
    const { service, ai } = setup();
    await Promise.all([service.lessonForTask(userId, 'task'), service.lessonForTask(userId, 'task')]);
    expect(ai.generateText).toHaveBeenCalledTimes(1);
  });

  it('tarefa de outro aluno ou sem tópico não tem resumo', async () => {
    const { service, prisma } = setup();
    prisma.studyTask.findUnique.mockResolvedValue({ ...task, schedule: { userId: 'outro' } });
    expect(await service.lessonForTask(userId, 'task')).toBeNull();
    prisma.studyTask.findUnique.mockResolvedValue({ ...task, topic: null });
    expect(await service.lessonForTask(userId, 'task')).toBeNull();
  });
});
