import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnswerKeyOrigin, AnswerKeyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { enemArea, gradeAnswers, GradingError, GradingItem, GradingResult, keyNumbers, LANGUAGES } from './answer-key.grading';
import { CreateAnswerKeyDto, ReviseAnswerKeyDto } from './answer-keys.dto';

/** Quem cadastra gabarito de professor (e publica para as próprias turmas). */
const TEACHER_ACCOUNT_TYPES = ['TEACHER', 'COORDINATOR', 'DIRECTOR', 'ADMIN'];

interface Viewer {
  id: string;
  accountType: string;
}

const keyInclude = {
  exam: { select: { id: true, name: true, year: true, institution: true } },
  creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
  _count: { select: { items: true } },
} satisfies Prisma.AnswerKeyInclude;

type KeyRow = Prisma.AnswerKeyGetPayload<{ include: typeof keyInclude }>;

const personName = (u: { email: string; profile: { firstName: string; lastName: string | null } | null }) =>
  u.profile ? `${u.profile.firstName} ${u.profile.lastName ?? ''}`.trim() : u.email;

@Injectable()
export class AnswerKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Professores cujos gabaritos publicados o usuário vê: os das turmas em que
   * ele está matriculado (professor da turma ou quem a criou).
   */
  private async teachersOf(userId: string): Promise<string[]> {
    const memberships = await this.prisma.classMember.findMany({
      where: { userId, class: { archived: false } },
      select: { class: { select: { createdBy: true, teachers: { select: { userId: true } } } } },
    });
    return [...new Set(memberships.flatMap((m) => [m.class.createdBy, ...m.class.teachers.map((t) => t.userId)]).filter((id): id is string => Boolean(id)))];
  }

  private async visibleWhere(viewer: Viewer): Promise<Prisma.AnswerKeyWhereInput> {
    const teachers = await this.teachersOf(viewer.id);
    return {
      OR: [
        { origin: AnswerKeyOrigin.OFFICIAL, status: AnswerKeyStatus.PUBLISHED },
        { createdBy: viewer.id, status: { not: AnswerKeyStatus.ARCHIVED } },
        ...(teachers.length ? [{ origin: AnswerKeyOrigin.TEACHER, status: AnswerKeyStatus.PUBLISHED, createdBy: { in: teachers } }] : []),
      ],
    };
  }

  private summary(row: KeyRow, viewer: Viewer) {
    return {
      id: row.id,
      exam: row.exam,
      application: row.application,
      day: row.day,
      bookletColor: row.bookletColor,
      area: row.area,
      origin: row.origin,
      official: row.origin === AnswerKeyOrigin.OFFICIAL,
      status: row.status,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt,
      version: row.version,
      correctionNote: row.correctionNote,
      questionCount: row._count.items,
      author: row.origin === AnswerKeyOrigin.OFFICIAL ? null : personName(row.creator),
      mine: row.createdBy === viewer.id,
      updatedAt: row.updatedAt,
    };
  }

  /** Gabaritos que o usuário pode usar, com filtros da seleção de prova. */
  async list(viewer: Viewer, filters: { examId?: string; year?: number; day?: number; origin?: AnswerKeyOrigin }) {
    const rows = await this.prisma.answerKey.findMany({
      where: {
        AND: [
          await this.visibleWhere(viewer),
          filters.examId ? { examId: filters.examId } : {},
          filters.year ? { exam: { year: filters.year } } : {},
          filters.day ? { day: filters.day } : {},
          filters.origin ? { origin: filters.origin } : {},
        ],
      },
      include: keyInclude,
      orderBy: [{ exam: { name: 'asc' } }, { exam: { year: 'desc' } }, { day: 'asc' }, { bookletColor: 'asc' }],
      take: 200,
    });
    // Oficial primeiro: é o que vale.
    return rows.sort((a, b) => Number(b.origin === 'OFFICIAL') - Number(a.origin === 'OFFICIAL')).map((r) => this.summary(r, viewer));
  }

  /** Provas cadastradas (para escolher ao criar gabarito ou filtrar). */
  async exams() {
    const rows = await this.prisma.exam.findMany({ select: { id: true, name: true, year: true, institution: true }, orderBy: [{ name: 'asc' }, { year: 'desc' }] });
    // Registros de teste antigos (PROBE, DEBUG…) não são provas.
    return rows.filter((e) => !/^(PROBE|DEBUG|VALID)\d*$/i.test(e.name));
  }

  private async loadVisible(viewer: Viewer, id: string) {
    const row = await this.prisma.answerKey.findFirst({ where: { AND: [{ id }, await this.visibleWhere(viewer)] }, include: keyInclude });
    if (!row) throw new NotFoundException('Gabarito não encontrado.');
    return row;
  }

  private async gradingItems(answerKeyId: string): Promise<GradingItem[]> {
    const items = await this.prisma.answerKeyItem.findMany({ where: { answerKeyId }, orderBy: [{ number: 'asc' }, { language: 'asc' }] });
    return items.map((i) => ({ number: i.number, language: i.language, answer: i.answer, area: i.area, validated: i.validated }));
  }

  /**
   * Detalhe do gabarito. As respostas só vêm com `withAnswers` — a tela de
   * conferência pede a grade sem elas, para o aluno não ver antes de marcar.
   */
  async get(viewer: Viewer, id: string, withAnswers: boolean) {
    const row = await this.loadVisible(viewer, id);
    const items = await this.prisma.answerKeyItem.findMany({
      where: { answerKeyId: id },
      orderBy: [{ number: 'asc' }, { language: 'asc' }],
      select: { number: true, language: true, area: true, answer: true, validated: true, justification: true, confidence: true, questionId: true },
    });
    const { numbers, needsLanguage } = keyNumbers(items.map((i) => ({ ...i, validated: i.validated })));
    return {
      ...this.summary(row, viewer),
      needsLanguage,
      numbers,
      items: items.map((i) => (withAnswers ? i : { number: i.number, language: i.language, area: i.area, validated: i.validated, questionId: i.questionId })),
    };
  }

  private async findOrCreateExam(dto: CreateAnswerKeyDto): Promise<string> {
    if (dto.examId) {
      const exam = await this.prisma.exam.findUnique({ where: { id: dto.examId }, select: { id: true } });
      if (!exam) throw new BadRequestException('Prova não encontrada.');
      return exam.id;
    }
    const name = dto.examName?.trim();
    if (!name || !dto.examYear) throw new BadRequestException('Escolha a prova ou informe nome e ano.');
    // Evita duplicar a prova: mesmo nome (sem diferenciar maiúsculas) e ano.
    const existing = await this.prisma.exam.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, year: dto.examYear }, select: { id: true } });
    if (existing) return existing.id;
    return (await this.prisma.exam.create({ data: { name, year: dto.examYear, institution: dto.examInstitution?.trim() || null } })).id;
  }

  /** Itens do DTO → linhas do banco, com área do Enem quando não informada. */
  private buildItems(dto: { items: { number: number; answer: number | null; language?: string; area?: string | null }[] }, isEnem: boolean) {
    const seen = new Set<string>();
    const rows = dto.items.map((item) => {
      const language = item.language ?? '';
      if (language && !LANGUAGES.includes(language as (typeof LANGUAGES)[number])) throw new BadRequestException(`Língua inválida na questão ${item.number}.`);
      const key = `${item.number}:${language}`;
      if (seen.has(key)) throw new BadRequestException(`Questão ${item.number} repetida no gabarito.`);
      seen.add(key);
      return { number: item.number, language, answer: item.answer, area: item.area?.trim() || (isEnem ? enemArea(item.number) : null) };
    });
    const numbers = new Set(rows.map((r) => r.number));
    for (const n of numbers) {
      const langs = rows.filter((r) => r.number === n).map((r) => r.language);
      if (langs.length > 1 && (langs.includes('') || langs.length !== 2)) throw new BadRequestException(`A questão ${n} precisa de uma resposta por língua (inglês e espanhol) ou de uma só.`);
    }
    return rows;
  }

  /**
   * Cadastro. Oficial: só administrador, com fonte e data de publicação — o
   * gabarito oficial nunca é inventado. Professor: fica visível às turmas dele
   * quando publicado.
   */
  async create(viewer: Viewer, dto: CreateAnswerKeyDto) {
    const official = dto.origin === AnswerKeyOrigin.OFFICIAL;
    if (official) {
      if (viewer.accountType !== 'ADMIN') throw new ForbiddenException('Só a administração da Lumina cadastra gabarito oficial.');
      if (!dto.sourceName?.trim() || !dto.sourceUrl?.trim() || !dto.publishedAt) throw new BadRequestException('Gabarito oficial precisa da fonte (banca e link) e da data de publicação.');
    } else if (dto.origin === AnswerKeyOrigin.TEACHER) {
      if (!TEACHER_ACCOUNT_TYPES.includes(viewer.accountType)) throw new ForbiddenException('Só professores e a gestão cadastram gabaritos.');
    } else {
      throw new BadRequestException('Gabaritos sugeridos por IA e comunitários ainda não podem ser cadastrados por aqui.');
    }
    const examId = await this.findOrCreateExam(dto);
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId }, select: { name: true } });
    const items = this.buildItems(dto, /enem/i.test(exam.name));
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId: viewer.id, status: 'ACTIVE' }, select: { workspaceId: true } });
    try {
      const created = await this.prisma.answerKey.create({
        data: {
          examId,
          application: dto.application?.trim() || 'Regular',
          day: dto.day ?? null,
          bookletColor: dto.bookletColor?.trim() || null,
          area: dto.area?.trim() || null,
          origin: dto.origin,
          status: dto.publish ? AnswerKeyStatus.PUBLISHED : AnswerKeyStatus.DRAFT,
          sourceName: dto.sourceName?.trim() || null,
          sourceUrl: dto.sourceUrl?.trim() || null,
          publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
          workspaceId: official ? null : (membership?.workspaceId ?? null),
          createdBy: viewer.id,
          items: { create: items.map((i) => ({ ...i, validated: true })) },
        },
        select: { id: true },
      });
      return this.get(viewer, created.id, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe gabarito oficial para esta prova, aplicação, dia e cor. Atualize o existente (correção oficial) em vez de criar outro.');
      }
      throw error;
    }
  }

  private async assertCanEdit(viewer: Viewer, id: string) {
    const row = await this.prisma.answerKey.findUnique({ where: { id }, select: { id: true, origin: true, createdBy: true, exam: { select: { name: true } } } });
    if (!row) throw new NotFoundException('Gabarito não encontrado.');
    const allowed = row.origin === AnswerKeyOrigin.OFFICIAL ? viewer.accountType === 'ADMIN' : row.createdBy === viewer.id;
    if (!allowed) throw new ForbiddenException('Você não pode alterar este gabarito.');
    return row;
  }

  /**
   * Correção do gabarito (a banca publicou retificação, ou o professor errou):
   * troca as respostas e sobe a versão. Conferências antigas guardam a versão
   * em que foram feitas e mostram o aviso.
   */
  async revise(viewer: Viewer, id: string, dto: ReviseAnswerKeyDto) {
    const row = await this.assertCanEdit(viewer, id);
    const items = this.buildItems(dto, /enem/i.test(row.exam.name));
    await this.prisma.$transaction([
      this.prisma.answerKeyItem.deleteMany({ where: { answerKeyId: id } }),
      this.prisma.answerKey.update({
        where: { id },
        data: { version: { increment: 1 }, correctionNote: dto.correctionNote.trim(), items: { create: items.map((i) => ({ ...i, validated: true })) } },
      }),
    ]);
    return this.get(viewer, id, true);
  }

  async setStatus(viewer: Viewer, id: string, status: AnswerKeyStatus) {
    await this.assertCanEdit(viewer, id);
    await this.prisma.answerKey.update({ where: { id }, data: { status } });
    return this.get(viewer, id, true);
  }

  /** Confere e guarda no histórico. */
  async check(viewer: Viewer, id: string, input: { answers: Record<string, number | null>; language?: string | null; inputMode?: string }) {
    const row = await this.loadVisible(viewer, id);
    const items = await this.gradingItems(id);
    let result: GradingResult;
    try {
      result = gradeAnswers(items, input.answers, input.language);
    } catch (error) {
      if (error instanceof GradingError) throw new BadRequestException(error.message);
      throw error;
    }
    const saved = await this.prisma.answerKeyCheck.create({
      data: {
        userId: viewer.id,
        answerKeyId: id,
        answerKeyVersion: row.version,
        language: input.language ?? null,
        inputMode: input.inputMode === 'PHOTO' ? 'PHOTO' : 'MANUAL',
        answersJson: input.answers as Prisma.InputJsonValue,
        correct: result.correct,
        wrong: result.wrong,
        blank: result.blank,
        pending: result.pending,
        annulled: result.annulled,
        total: result.total,
      },
      select: { id: true, createdAt: true },
    });
    return { id: saved.id, createdAt: saved.createdAt, answerKey: this.summary(row, viewer), outdated: false, ...result };
  }

  /** Uma conferência do histórico, refeita contra o gabarito atual. */
  async getCheck(viewer: Viewer, checkId: string) {
    const check = await this.prisma.answerKeyCheck.findFirst({ where: { id: checkId, userId: viewer.id } });
    if (!check) throw new NotFoundException('Conferência não encontrada.');
    const row = await this.prisma.answerKey.findUniqueOrThrow({ where: { id: check.answerKeyId }, include: keyInclude });
    const items = await this.gradingItems(check.answerKeyId);
    const result = gradeAnswers(items, check.answersJson as Record<string, number | null>, check.language);
    return {
      id: check.id,
      createdAt: check.createdAt,
      answerKey: this.summary(row, viewer),
      // O gabarito foi corrigido depois: o resultado abaixo já usa a versão nova.
      outdated: check.answerKeyVersion !== row.version,
      savedResult: { correct: check.correct, wrong: check.wrong, blank: check.blank, version: check.answerKeyVersion },
      ...result,
    };
  }

  /**
   * Painel de desempenho: histórico, resultado por área somando todas as
   * conferências e as questões que mais erra. Sem conversão para nota TRI.
   */
  async performance(viewer: Viewer) {
    const checks = await this.prisma.answerKeyCheck.findMany({
      where: { userId: viewer.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { answerKey: { include: keyInclude } },
    });
    const history = checks.map((c) => {
      const scored = c.correct + c.wrong + c.blank;
      return {
        id: c.id,
        createdAt: c.createdAt,
        answerKey: this.summary(c.answerKey, viewer),
        correct: c.correct,
        wrong: c.wrong,
        blank: c.blank,
        pending: c.pending,
        total: c.total,
        percent: scored ? Math.round((c.correct / scored) * 1000) / 10 : 0,
        outdated: c.answerKeyVersion !== c.answerKey.version,
      };
    });

    // Por área e questões difíceis: refaz as conferências mais recentes (até 30).
    const areaTotals = new Map<string, { correct: number; wrong: number; blank: number }>();
    const missed: { checkId: string; answerKeyId: string; label: string; number: number; area: string | null; selected: number | null; answer: number | null }[] = [];
    const itemsCache = new Map<string, GradingItem[]>();
    for (const c of checks.slice(0, 30)) {
      if (!itemsCache.has(c.answerKeyId)) itemsCache.set(c.answerKeyId, await this.gradingItems(c.answerKeyId));
      const result = gradeAnswers(itemsCache.get(c.answerKeyId)!, c.answersJson as Record<string, number | null>, c.language);
      for (const a of result.byArea) {
        const t = areaTotals.get(a.area) ?? { correct: 0, wrong: 0, blank: 0 };
        t.correct += a.correct;
        t.wrong += a.wrong;
        t.blank += a.blank;
        areaTotals.set(a.area, t);
      }
      const label = `${c.answerKey.exam.name} ${c.answerKey.exam.year ?? ''}${c.answerKey.day ? ` · ${c.answerKey.day}º dia` : ''}`.trim();
      for (const q of result.questions) if (q.status === 'WRONG' || q.status === 'BLANK') missed.push({ checkId: c.id, answerKeyId: c.answerKeyId, label, number: q.number, area: q.area, selected: q.selected, answer: q.answer });
    }
    const byArea = [...areaTotals.entries()].map(([area, t]) => {
      const scored = t.correct + t.wrong + t.blank;
      return { area, ...t, scored, percent: scored ? Math.round((t.correct / scored) * 1000) / 10 : 0 };
    }).sort((a, b) => a.percent - b.percent);
    const totals = history.reduce((s, h) => ({ correct: s.correct + h.correct, wrong: s.wrong + h.wrong, blank: s.blank + h.blank }), { correct: 0, wrong: 0, blank: 0 });
    const scored = totals.correct + totals.wrong + totals.blank;
    return {
      checks: history.length,
      ...totals,
      percent: scored ? Math.round((totals.correct / scored) * 1000) / 10 : 0,
      byArea,
      history,
      // Questões que mais erra (ou deixa em branco), somando as conferências.
      difficultQuestions: [...missed.reduce((map, m) => {
        const key = `${m.answerKeyId}:${m.number}`;
        const prev = map.get(key);
        map.set(key, prev ? { ...prev, misses: prev.misses + 1 } : { ...m, misses: 1 });
        return map;
      }, new Map<string, (typeof missed)[number] & { misses: number }>()).values()].sort((a, b) => b.misses - a.misses || a.number - b.number).slice(0, 40),
    };
  }
}
