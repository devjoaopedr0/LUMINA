import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from '../schedules/study-subject-question-bank-map';
import { topicLevel, type TopicLevel } from '../schedules/topic-sequence';
import { AiService } from './ai.service';
import { LESSON_SYSTEM_PROMPT, lessonUserPrompt, parseLesson } from './topic-lesson';

export interface TaskLesson {
  taskId: string;
  subject: string | null;
  topic: string;
  topicId: string;
  level: TopicLevel | null;
  /** Texto em seções ("## Título"), listas ("- ") e **negrito**. */
  content: string;
  /** De onde veio o texto — hoje só IA; a tela avisa o aluno. */
  source: string;
  updatedAt: Date;
}

/** Resumo é texto longo: mais tokens e mais espera do que uma mensagem de chat. */
const LESSON_MAX_TOKENS = 1600;
const LESSON_TIMEOUT_MS = 45_000;

@Injectable()
export class TopicLessonsService {
  private readonly logger = new Logger(TopicLessonsService.name);
  /** Gerações em andamento por tópico: dois alunos abrindo o mesmo tópico ao
   *  mesmo tempo esperam a mesma chamada em vez de pagar duas. */
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Resumo de teoria do tópico da tarefa. Vem do banco quando já existe;
   * senão é gerado agora e guardado. null = tarefa inexistente, de outro
   * aluno ou sem tópico.
   */
  async lessonForTask(userId: string, taskId: string): Promise<TaskLesson | null> {
    const task = await this.prisma.studyTask.findUnique({
      where: { id: taskId },
      include: { subject: true, topic: true, schedule: true },
    });
    if (!task || task.schedule.userId !== userId || !task.topic) return null;

    const topic = task.topic;
    const bankSubjectName = task.subject
      ? (STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[task.subject.code] ?? task.subject.name)
      : '';
    const level = topicLevel(bankSubjectName, topic.name);
    const base = {
      taskId: task.id,
      subject: task.subject?.name ?? null,
      topic: topic.name,
      topicId: topic.id,
      level,
    };

    const saved = await this.prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
    if (saved) return { ...base, content: saved.content, source: saved.source, updatedAt: saved.updatedAt };

    const content = await this.generateOnce(topic.id, {
      subjectName: task.subject?.name ?? bankSubjectName,
      topicName: topic.name,
      level,
    });
    if (!content) {
      throw new ServiceUnavailableException(
        'Não consegui preparar o resumo desse tópico agora. Tente de novo em instantes ou estude pelo seu material.',
      );
    }
    const lesson = await this.prisma.topicLesson.upsert({
      where: { topicId: topic.id },
      create: { topicId: topic.id, content, source: 'AI' },
      // Outro pedido salvou primeiro: fica o que já está lá.
      update: {},
    });
    return { ...base, content: lesson.content, source: lesson.source, updatedAt: lesson.updatedAt };
  }

  private generateOnce(
    topicId: string,
    params: { subjectName: string; topicName: string; level: TopicLevel | null },
  ): Promise<string | null> {
    const running = this.inFlight.get(topicId);
    if (running) return running;
    const generation = this.generate(params).finally(() => this.inFlight.delete(topicId));
    this.inFlight.set(topicId, generation);
    return generation;
  }

  private async generate(params: {
    subjectName: string;
    topicName: string;
    level: TopicLevel | null;
  }): Promise<string | null> {
    try {
      const raw = await this.ai.generateText({
        system: LESSON_SYSTEM_PROMPT,
        prompt: lessonUserPrompt(params),
        maxTokens: LESSON_MAX_TOKENS,
        timeoutMs: LESSON_TIMEOUT_MS,
      });
      const content = raw ? parseLesson(raw) : null;
      if (raw && !content) {
        this.logger.warn(`Resumo de "${params.topicName}" veio fora da estrutura; descartado.`);
      }
      return content;
    } catch (error) {
      this.logger.warn(
        `Falha ao gerar o resumo de "${params.topicName}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
