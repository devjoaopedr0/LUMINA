import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ListGeneratorService } from './list-generator.service';
import { LIST_RULES, isSheetCompatible, pickBalanced } from './list-generator';
import { DIFFICULTIES, Difficulty, EXAM_RULES, difficultyQuotas } from './exam-generator';

export interface ExamSectionInput {
  subjectId: string;
  count: number;
  topicId?: string;
}

export interface GenerateExamInput {
  sections: ExamSectionInput[];
  /** Porcentagens por dificuldade; vazio = qualquer dificuldade. */
  difficultyMix?: Partial<Record<Difficulty, number>>;
  /** Habilidades do ENEM (ex.: "MT-H17"); vazio = todas. */
  skills?: string[];
  exam?: string;
  classId?: string;
}

type Row = { id: string; stem: string; subject: string; topic: string; topicId: string | null; difficulty: Difficulty; exam: string; year: number | null; enemSkill: string | null };

/**
 * Gerador de provas (item 38): prévia por seções (disciplina, quantidade e,
 * opcionalmente, assunto), com mistura de dificuldade e filtro de habilidades.
 * A criação das versões fica em SimulationsService.createExamVersions.
 */
@Injectable()
export class ExamGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lists: ListGeneratorService,
  ) {}

  async preview(userId: string, input: GenerateExamInput) {
    if (!input.sections.length || input.sections.length > EXAM_RULES.maxSections) throw new BadRequestException(`De 1 a ${EXAM_RULES.maxSections} disciplinas.`);
    const total = input.sections.reduce((s, x) => s + x.count, 0);
    if (total > EXAM_RULES.maxTotal) throw new BadRequestException(`No máximo ${EXAM_RULES.maxTotal} questões por prova.`);
    const klass = input.classId ? await this.lists.teacherClass(userId, input.classId) : null;
    const workspaceIds = await this.lists.usableWorkspaces(userId);
    const mix = input.difficultyMix && DIFFICULTIES.some((d) => (input.difficultyMix![d] ?? 0) > 0)
      ? (Object.fromEntries(DIFFICULTIES.map((d) => [d, input.difficultyMix![d] ?? 0])) as Record<Difficulty, number>)
      : null;
    const skills = (input.skills ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);

    const chosen = new Set<string>();
    const warnings: string[] = [];
    const questions: Array<Row & { section: number }> = [];
    const sections = [];
    for (const [index, section] of input.sections.entries()) {
      const where: Prisma.QuestionWhereInput = {
        workspaceId: { in: workspaceIds },
        subjectId: section.subjectId,
        ...(section.topicId ? { topicId: section.topicId } : {}),
        ...(skills.length ? { enemSkill: { in: skills } } : {}),
        ...(input.exam ? { exam: { equals: input.exam, mode: 'insensitive' as const } } : {}),
      };
      const rows = (await this.prisma.question.findMany({
        where,
        take: LIST_RULES.candidatePool,
        select: { id: true, stem: true, subject: true, topic: true, topicId: true, difficulty: true, exam: true, year: true, enemSkill: true, alternatives: { select: { position: true, isCorrect: true } } },
      })).filter((q) => isSheetCompatible(q.alternatives) && !chosen.has(q.id));
      const subjectName = rows[0]?.subject ?? (await this.prisma.subject.findUnique({ where: { id: section.subjectId }, select: { name: true } }))?.name ?? 'Disciplina';

      const bucket = (q: Row) => q.topicId ?? `${q.subject}/${q.topic}`;
      let picked: string[] = [];
      if (mix) {
        const quotas = difficultyQuotas(section.count, mix);
        for (const d of DIFFICULTIES) {
          const pool = rows.filter((q) => q.difficulty === d);
          const got = pickBalanced(pool.map((q) => ({ id: q.id, bucket: bucket(q) })), quotas[d]);
          if (got.length < quotas[d]) warnings.push(`${subjectName}: faltaram ${quotas[d] - got.length} questões ${d === 'FACIL' ? 'fáceis' : d === 'MEDIA' ? 'médias' : 'difíceis'}; completamos com outras dificuldades.`);
          picked.push(...got);
        }
        // Completa o que faltou com qualquer dificuldade.
        if (picked.length < section.count) {
          const rest = rows.filter((q) => !picked.includes(q.id));
          picked.push(...pickBalanced(rest.map((q) => ({ id: q.id, bucket: bucket(q) })), section.count - picked.length));
        }
      } else {
        picked = pickBalanced(rows.map((q) => ({ id: q.id, bucket: bucket(q) })), section.count);
      }
      if (picked.length < section.count) warnings.push(`${subjectName}: só encontramos ${picked.length} de ${section.count} questões com esses critérios.`);
      const byId = new Map(rows.map((q) => [q.id, q]));
      for (const id of picked) {
        chosen.add(id);
        const q = byId.get(id)!;
        questions.push({ id: q.id, stem: q.stem.length > 220 ? `${q.stem.slice(0, 219)}…` : q.stem, subject: q.subject, topic: q.topic, topicId: q.topicId, difficulty: q.difficulty, exam: q.exam, year: q.year, enemSkill: q.enemSkill, section: index });
      }
      sections.push({ subject: subjectName, requested: section.count, found: picked.length });
    }

    const difficultyActual = Object.fromEntries(DIFFICULTIES.map((d) => [d, questions.filter((q) => q.difficulty === d).length])) as Record<Difficulty, number>;
    const names = [...new Set(sections.map((s) => s.subject))];
    const title = `Prova de ${names.length > 2 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names.join(' e ')}`;
    return {
      title: klass ? `${title} — ${klass.name}` : title,
      forClass: klass,
      sections,
      requested: total,
      found: questions.length,
      difficultyActual,
      warnings,
      questions: questions.map(({ topicId, ...q }) => q),
    };
  }
}
