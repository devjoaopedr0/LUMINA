import { PrismaClient } from '@prisma/client';
import { TOPIC_MERGES, type TopicMerge } from '../../prisma/seed-data/topic-merges';

export interface TopicMergeReport {
  merged: number;
  questionsMoved: number;
  masteriesMoved: number;
  tasksMoved: number;
}

/**
 * Funde os tópicos duplicados listados em TOPIC_MERGES: questões, domínio
 * (TopicMastery) e tarefas do cronograma do tópico `from` passam para `into`,
 * e `from` é apagado. Idempotente — par já fundido (ou que nunca existiu
 * neste banco) é ignorado.
 */
export async function mergeDuplicateTopics(
  prisma: PrismaClient,
  merges: TopicMerge[] = TOPIC_MERGES,
): Promise<TopicMergeReport> {
  const report: TopicMergeReport = { merged: 0, questionsMoved: 0, masteriesMoved: 0, tasksMoved: 0 };

  for (const merge of merges) {
    const subject = await prisma.subject.findUnique({ where: { name: merge.subject } });
    if (!subject) continue;
    const from = await prisma.topic.findUnique({
      where: { subjectId_name: { subjectId: subject.id, name: merge.from } },
    });
    if (!from) continue;

    await prisma.$transaction(async (tx) => {
      const into = await tx.topic.upsert({
        where: { subjectId_name: { subjectId: subject.id, name: merge.into } },
        update: {},
        create: { subjectId: subject.id, name: merge.into },
      });

      // `topic` é a cópia em texto do nome do tópico na questão — vai junto,
      // senão a questão continuaria aparecendo com o nome antigo.
      const questions = await tx.question.updateMany({
        where: { topicId: from.id },
        data: { topicId: into.id, topic: into.name },
      });
      const tasks = await tx.studyTask.updateMany({
        where: { topicId: from.id },
        data: { topicId: into.id },
      });

      // TopicMastery é único por (aluno, tópico): quem já tem domínio nos
      // dois soma as tentativas no destino; quem só tem no antigo é movido.
      const masteries = await tx.topicMastery.findMany({ where: { topicId: from.id } });
      for (const mastery of masteries) {
        const existing = await tx.topicMastery.findUnique({
          where: { userId_topicId: { userId: mastery.userId, topicId: into.id } },
        });
        if (existing) {
          await tx.topicMastery.update({
            where: { id: existing.id },
            data: {
              attempts: existing.attempts + mastery.attempts,
              correctAttempts: existing.correctAttempts + mastery.correctAttempts,
            },
          });
          await tx.topicMastery.delete({ where: { id: mastery.id } });
        } else {
          await tx.topicMastery.update({ where: { id: mastery.id }, data: { topicId: into.id } });
        }
      }

      await tx.topic.delete({ where: { id: from.id } });

      report.merged += 1;
      report.questionsMoved += questions.count;
      report.tasksMoved += tasks.count;
      report.masteriesMoved += masteries.length;
    });
  }

  return report;
}
