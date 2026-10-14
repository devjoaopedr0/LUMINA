import type { PrismaClient } from '@prisma/client';
import { STUDY_SUBJECT_TOPICS } from '../../prisma/seed-data/study-subject-topics';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from '../schedules/study-subject-question-bank-map';

/**
 * Garante os tópicos do currículo como linhas reais de Topic (e a matéria
 * deles em Subject), mesmo os que nenhuma questão cobre ainda — o domínio do
 * aluno (TopicMastery) e as tarefas do cronograma precisam de um topicId
 * para existir, não só de questões respondidas. Idempotente.
 */
export async function seedCurriculumTopics(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const entry of STUDY_SUBJECT_TOPICS) {
    const subjectName = STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[entry.subjectCode];
    if (!subjectName) continue;
    const subject = await prisma.subject.upsert({
      where: { name: subjectName },
      update: {},
      create: { name: subjectName },
    });
    for (const group of entry.groups) {
      for (const topicName of group.topics) {
        const where = { subjectId_name: { subjectId: subject.id, name: topicName } };
        if (await prisma.topic.findUnique({ where })) continue;
        await prisma.topic.create({ data: { subjectId: subject.id, name: topicName } });
        created += 1;
      }
    }
  }
  return created;
}
