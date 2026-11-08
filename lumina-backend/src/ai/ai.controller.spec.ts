import { describe, expect, it, vi } from 'vitest';
import { AiChatRequestDto } from './ai.dto';
import { AiController } from './ai.controller';

function makeController() {
  const aiService = { sendMessage: vi.fn().mockResolvedValue({ message: 'ok' }) };
  const scheduleInsights = { explainTask: vi.fn().mockResolvedValue(null) };
  const lessons = { lessonForTask: vi.fn() };
  const scoreEstimates = { forUser: vi.fn() };
  const questionsService = { tutorContext: vi.fn().mockResolvedValue(null) };
  const controller = new AiController(
    aiService as any,
    scheduleInsights as any,
    lessons as any,
    scoreEstimates as any,
    questionsService as any,
  );
  return { controller, aiService, scheduleInsights, questionsService };
}

const user = { id: 'user-1', profile: { firstName: 'Maria' } } as any;
const baseDto: AiChatRequestDto = {
  message: { role: 'user', content: 'Me ajuda nesta questão' },
  history: [],
};

describe('AiController.chat', () => {
  it('envia o contexto da questão montado no servidor', async () => {
    const { controller, aiService, questionsService } = makeController();
    questionsService.tutorContext.mockResolvedValue('CONTEXTO DA QUESTÃO');

    await controller.chat(user, { ...baseDto, questionId: 'question-1' });

    expect(questionsService.tutorContext).toHaveBeenCalledWith('user-1', 'question-1', 'DIRECT');
    expect(aiService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'question-1' }),
      'CONTEXTO DA QUESTÃO',
      'Maria',
    );
  });

  it('combina o contexto da tarefa com o da questão', async () => {
    const { controller, aiService, scheduleInsights, questionsService } = makeController();
    scheduleInsights.explainTask.mockResolvedValue({ context: 'CONTEXTO DA TAREFA' });
    questionsService.tutorContext.mockResolvedValue('CONTEXTO DA QUESTÃO');

    await controller.chat(user, {
      ...baseDto,
      scheduleTaskId: 'task-1',
      questionId: 'question-1',
    });

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'CONTEXTO DA TAREFA\n\nCONTEXTO DA QUESTÃO',
      'Maria',
    );
  });

  it('não busca questão quando o id não foi enviado', async () => {
    const { controller, aiService, questionsService } = makeController();

    await controller.chat(user, baseDto);

    expect(questionsService.tutorContext).not.toHaveBeenCalled();
    expect(aiService.sendMessage).toHaveBeenCalledWith(baseDto, undefined, 'Maria');
  });

  it('segue sem contexto quando a questão não é acessível', async () => {
    const { controller, aiService, questionsService } = makeController();
    questionsService.tutorContext.mockResolvedValue(null);

    await controller.chat(user, { ...baseDto, questionId: 'question-1' });

    expect(aiService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'question-1' }),
      undefined,
      'Maria',
    );
  });

  it('pede ao contexto da questão o modo socrático e envia a etapa atual', async () => {
    const { controller, aiService, questionsService } = makeController();
    questionsService.tutorContext.mockResolvedValue('CONTEXTO DA QUESTÃO');

    await controller.chat(user, {
      ...baseDto,
      questionId: 'question-1',
      mode: 'SOCRATIC',
    });

    expect(questionsService.tutorContext).toHaveBeenCalledWith(
      'user-1',
      'question-1',
      'SOCRATIC',
    );
    const context = aiService.sendMessage.mock.calls[0][1] as string;
    expect(context).toContain('CONTEXTO DA QUESTÃO');
    expect(context).toContain('ANDAMENTO DO MODO SOCRÁTICO');
    expect(context).toContain('O aluno já enviou 0 mensagens');
  });

  it('orienta o modo socrático mesmo sem questão vinculada', async () => {
    const { controller, aiService } = makeController();

    await controller.chat(user, { ...baseDto, mode: 'SOCRATIC' });

    const context = aiService.sendMessage.mock.calls[0][1] as string;
    expect(context).toContain('CONTEXTO DO MODO SOCRÁTICO');
    expect(context).toContain('não há questão vinculada');
    expect(context).toContain('ANDAMENTO DO MODO SOCRÁTICO');
  });
});
