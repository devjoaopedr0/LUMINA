import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { AnswerKeyOrigin, AnswerKeyStatus, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { EnemImportService } from '../questions/import/enem/enem-import.service';
import { QUESTION_BANK_INSTITUTION_EMAIL, QuestionAccessService } from '../questions/question-access.service';
import { decodePdf } from '../simulations/omr/answer-sheet-scan.service';
import { OmrError, readSheet } from '../simulations/omr/omr';
import { extractPdfImages, PdfError } from '../simulations/omr/pdf';
import { ANSWER_KEY_SHEET_CODE, answerKeySheetBits, answerKeySheetLayout, readingToAnswers } from './answer-key-sheet';
import type { OfficialGabarito } from '../questions/import/enem/enem-pdf.parser';
import { enemArea, gradeAnswers, GradingError, GradingItem, GradingResult, keyNumbers, LANGUAGES, letterToPosition } from './answer-key.grading';
import { CommunityContributionDto, CreateAnswerKeyDto, ImportInepAnswerKeyDto, ReviseAnswerKeyDto, SuggestAnswerKeyDto, ValidateAnswerKeyItemsDto } from './answer-keys.dto';
import { correctPositions, enemQuestionSourceId, EXPLANATION_SYSTEM_PROMPT, explanationPrompt, fallbackExplanation, parseSuggestedAnswerOutcome, pickAccessibleQuestion, pickQuestion, plainExplanation, positionLetter, SUGGESTION_SYSTEM_PROMPT, suggestionPrompt } from './answer-key.questions';

/** Quem cadastra gabarito de professor (e publica para as próprias turmas). */
const TEACHER_ACCOUNT_TYPES = ['TEACHER', 'COORDINATOR', 'DIRECTOR', 'ADMIN'];

/** Abaixo disso a resposta mais votada não aparece (pouca base). */
export const COMMUNITY_MIN_VOTES = 3;

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

interface SuggestionQuestion {
  id: string;
  workspaceId: string;
  examNumber: number | null;
  sourceId: string | null;
  stem: string;
  subject: string;
  imageUrl: string | null;
  alternatives: { position: number; text: string; isCorrect: boolean }[];
}

interface SuggestionSkip {
  number: number;
  language: string;
  reason: string;
}

const personName = (u: { email: string; profile: { firstName: string; lastName: string | null } | null }) =>
  u.profile ? `${u.profile.firstName} ${u.profile.lastName ?? ''}`.trim() : u.email;

@Injectable()
export class AnswerKeysService {
  private readonly logger = new Logger(AnswerKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly enem?: EnemImportService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly access?: QuestionAccessService,
  ) {}

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
        // Comunitário é de todos: quem votou primeiro não é dono.
        { origin: AnswerKeyOrigin.COMMUNITY, status: AnswerKeyStatus.PUBLISHED },
        { createdBy: viewer.id, status: { not: AnswerKeyStatus.ARCHIVED } },
        // Professor e sugestão por IA publicados para as turmas. Itens ainda não
        // validados aparecem como pendentes e não entram no percentual.
        ...(teachers.length ? [{ origin: { in: [AnswerKeyOrigin.TEACHER, AnswerKeyOrigin.AI_SUGGESTED] }, status: AnswerKeyStatus.PUBLISHED, createdBy: { in: teachers } }] : []),
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
      author: row.origin === AnswerKeyOrigin.OFFICIAL || row.origin === AnswerKeyOrigin.COMMUNITY ? null : personName(row.creator),
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
    const combo = (r: KeyRow) => `${r.examId}|${r.application}|${r.day ?? ''}|${r.bookletColor ?? ''}`;
    const officialCombos = new Set(rows.filter((r) => r.origin === AnswerKeyOrigin.OFFICIAL).map(combo));
    // Oficial primeiro: é o que vale. O comunitário sai de cena quando o oficial chega.
    // Comunitário sem nenhuma questão com votos suficientes ainda não serve para conferir.
    return rows.filter((r) => r.origin !== AnswerKeyOrigin.COMMUNITY || (!officialCombos.has(combo(r)) && r._count.items > 0)).sort((a, b) => Number(b.origin === 'OFFICIAL') - Number(a.origin === 'OFFICIAL')).map((r) => this.summary(r, viewer));
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
    return items.map((i) => ({ number: i.number, language: i.language, answer: i.answer, area: i.area, validated: i.validated, confidence: i.confidence, questionId: i.questionId }));
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
    const languages = [...new Set(items.map((i) => i.language).filter(Boolean))];
    return {
      ...this.summary(row, viewer),
      needsLanguage,
      languages,
      numbers,
      linkedQuestions: items.filter((i) => i.questionId).length,
      items: items.map((i) => (withAnswers ? i : { number: i.number, language: i.language, area: i.area, validated: i.validated, questionId: i.questionId })),
    };
  }

  /**
   * Liga cada item do gabarito à questão correspondente do banco público.
   * Só o banco central é usado: as questões oficiais são públicas para
   * qualquer aluno autenticado, então a explicação da LuminIA não depende de
   * o aluno pertencer ao workspace de quem importou o caderno.
   *
   * Devolve quantos itens foram ligados e quais números ficaram sem questão.
   * Não é uma operação obrigatória: gabarito sem questões no banco continua
   * valendo para conferir; só não tem explicação por questão.
   */
  async linkQuestions(viewer: Viewer, id: string) {
    await this.assertCanEdit(viewer, id);
    return this.relinkQuestions(id);
  }

  /** Best-effort depois de criar/importar/corrigir: nunca derruba o gabarito. */
  private async safeRelinkQuestions(answerKeyId: string): Promise<void> {
    try {
      await this.relinkQuestions(answerKeyId);
    } catch (error) {
      this.logger.warn(`Não foi possível ligar as questões do gabarito ${answerKeyId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async relinkQuestions(answerKeyId: string): Promise<{ linked: number; total: number; missing: number[] }> {
    const key = await this.prisma.answerKey.findUnique({
      where: { id: answerKeyId },
      select: { examId: true, day: true, exam: { select: { name: true, year: true } } },
    });
    if (!key) throw new NotFoundException('Gabarito não encontrado.');
    const items = await this.prisma.answerKeyItem.findMany({
      where: { answerKeyId },
      select: { id: true, number: true, language: true, questionId: true },
    });
    if (!items.length) return { linked: 0, total: 0, missing: [] };

    const bank = await this.prisma.workspace.findFirst({
      where: { institution: { email: QUESTION_BANK_INSTITUTION_EMAIL } },
      select: { id: true },
    });
    const bankWorkspaceId = bank?.id ?? null;
    const isEnem = /enem/i.test(key.exam.name);

    const updates: { id: string; questionId: string }[] = [];
    if (isEnem && key.exam.year && key.day) {
      const wanted = new Map(items.map((item) => [enemQuestionSourceId(key.exam.year!, key.day!, item), item]));
      const questions = await this.prisma.question.findMany({
        where: { sourceId: { in: [...wanted.keys()] } },
        select: { id: true, sourceId: true, workspaceId: true },
        orderBy: { createdAt: 'asc' },
      });
      const bySource = new Map<string, { id: string; workspaceId: string }[]>();
      for (const q of questions) {
        if (!q.sourceId) continue;
        bySource.set(q.sourceId, [...(bySource.get(q.sourceId) ?? []), { id: q.id, workspaceId: q.workspaceId }]);
      }
      for (const [sourceId, item] of wanted) {
        const questionId = pickQuestion(bySource.get(sourceId) ?? [], bankWorkspaceId);
        if (questionId) updates.push({ id: item.id, questionId });
      }
    } else {
      // Provas sem o formato do Enem: casa pelo número na prova dentro da
      // mesma prova cadastrada. Itens de língua ficam de fora (o número se
      // repete e o banco não guarda o idioma no examNumber).
      const numbered = items.filter((item) => !item.language);
      const numbers = [...new Set(numbered.map((item) => item.number))];
      const questions = await this.prisma.question.findMany({
        where: { examId: key.examId, examNumber: { in: numbers } },
        select: { id: true, examNumber: true, workspaceId: true },
        orderBy: { createdAt: 'asc' },
      });
      const byNumber = new Map<number, { id: string; workspaceId: string }[]>();
      for (const q of questions) {
        if (q.examNumber === null) continue;
        byNumber.set(q.examNumber, [...(byNumber.get(q.examNumber) ?? []), { id: q.id, workspaceId: q.workspaceId }]);
      }
      for (const item of numbered) {
        const questionId = pickQuestion(byNumber.get(item.number) ?? [], bankWorkspaceId);
        if (questionId) updates.push({ id: item.id, questionId });
      }
    }

    const changed = updates.filter((u) => items.find((item) => item.id === u.id)?.questionId !== u.questionId);
    if (changed.length) {
      await this.prisma.$transaction(changed.map((u) => this.prisma.answerKeyItem.update({ where: { id: u.id }, data: { questionId: u.questionId } })));
    }
    const linkedIds = new Set(updates.map((u) => u.id));
    const missing = items.filter((item) => !linkedIds.has(item.id) && !item.questionId).map((item) => item.number);
    return { linked: updates.length, total: items.length, missing: [...new Set(missing)] };
  }

  /**
   * Explicação de uma questão já respondida. Usa o texto real da questão do
   * banco (enunciado e alternativas) e a resposta do aluno; a IA recebe só o
   * que está no enunciado e não é convidada a inventar conteúdo.
   *
   * Sem questão ligada, a resposta é 422 e a interface diz que falta vincular
   * — nunca uma explicação inventada. Sem IA configurada (ou se ela falhar),
   * devolve um roteiro de revisão determinístico, marcado como `rules`.
   */
  async explainQuestion(viewer: Viewer, id: string, number: number, selected?: number | null, language?: string | null) {
    await this.loadVisible(viewer, id);
    if (!Number.isInteger(number) || number < 1 || number > 999) throw new BadRequestException('Número de questão inválido.');
    if (selected !== undefined && selected !== null && (!Number.isInteger(selected) || selected < 1 || selected > 5)) {
      throw new BadRequestException('Resposta marcada inválida.');
    }
    const items = await this.prisma.answerKeyItem.findMany({
      where: { answerKeyId: id, number },
      include: {
        question: {
          select: {
            id: true,
            workspaceId: true,
            stem: true,
            subject: true,
            imageUrl: true,
            alternatives: { select: { position: true, text: true }, orderBy: { position: 'asc' } },
          },
        },
      },
    });
    const wantedLanguage = (language ?? '').trim().toUpperCase();
    const item = items.find((i) => i.language === wantedLanguage) ?? items.find((i) => i.language === '') ?? (items.length === 1 ? items[0] : null);
    if (!item) throw new BadRequestException('Escolha a língua estrangeira para explicar esta questão.');
    if (!item.question) {
      throw new UnprocessableEntityException('Esta questão ainda não está ligada ao banco de questões. Importe o caderno no banco ou use o vínculo do gabarito antes de pedir a explicação.');
    }
    if (this.access) await this.access.assertCanUse(viewer.id, item.question.workspaceId);

    const alternatives = item.question.alternatives.map((a) => ({ position: a.position, text: a.text }));
    const hasImage = Boolean(item.question.imageUrl);
    let explanation: string | null = null;
    let model: string | null = null;
    let source: 'ai' | 'rules' = 'rules';
    if (this.ai) {
      try {
        const result = await this.ai.generateStructured({
          system: EXPLANATION_SYSTEM_PROMPT,
          prompt: explanationPrompt({
            stem: item.question.stem,
            subject: item.question.subject,
            area: item.area,
            alternatives,
            correct: item.answer,
            selected: selected ?? null,
            hasImage,
          }),
          maxTokens: 900,
          timeoutMs: 25_000,
          temperature: 0.2,
        });
        if (result?.text?.trim()) {
          explanation = plainExplanation(result.text);
          model = result.model;
          source = 'ai';
        }
      } catch (error) {
        this.logger.warn(`LuminIA não explicou a questão ${number} do gabarito ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!explanation) {
      explanation = fallbackExplanation({ correct: item.answer, selected: selected ?? null, stem: item.question.stem, alternatives });
    }
    return {
      number,
      language: item.language,
      questionId: item.question.id,
      subject: item.question.subject,
      area: item.area,
      stem: item.question.stem,
      alternatives,
      correct: item.answer,
      selected: selected ?? null,
      explanation,
      model,
      source,
      hasImage,
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
      throw new BadRequestException('O gabarito comunitário nasce dos votos dos alunos e o sugerido por IA é gerado pela rota de sugestão: não dá para cadastrá-los por aqui.');
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
      await this.safeRelinkQuestions(created.id);
      return this.get(viewer, created.id, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe gabarito oficial para esta prova, aplicação, dia e cor. Atualize o existente (correção oficial) em vez de criar outro.');
      }
      throw error;
    }
  }

  /** Workspaces cujas questões o usuário pode ler: os ativos dele e o banco público. */
  private async allowedWorkspaceIds(userId: string): Promise<Set<string>> {
    const [memberships, bank] = await Promise.all([
      this.prisma.workspaceMember.findMany({ where: { userId, status: 'ACTIVE' }, select: { workspaceId: true } }),
      this.prisma.workspace.findFirst({ where: { institution: { email: QUESTION_BANK_INSTITUTION_EMAIL } }, select: { id: true } }),
    ]);
    return new Set([...memberships.map((m) => m.workspaceId), ...(bank ? [bank.id] : [])]);
  }

  /**
   * Encontra as questões da prova que podem ser usadas na sugestão. No Enem, o
   * vínculo é pelo `sourceId` canônico (o mesmo da explicação); nas demais
   * provas, pelo `examId` + número. Só entram questões de workspace acessível.
   */
  private async suggestionQuestions(exam: { id: string; name: string; year: number | null }, dto: SuggestAnswerKeyDto, allowed: Set<string>, bankWorkspaceId: string | null) {
    const isEnem = /enem/i.test(exam.name);
    if (isEnem && dto.day !== 1 && dto.day !== 2) {
      throw new BadRequestException('Informe o dia da prova (1 ou 2) para sugerir o gabarito do Enem.');
    }

    let numbers: number[];
    if (dto.numbers?.length) {
      numbers = [...new Set(dto.numbers)].sort((a, b) => a - b);
    } else if (isEnem) {
      numbers = Array.from({ length: 90 }, (_, i) => (dto.day === 1 ? 1 : 91) + i);
    } else {
      const rows = await this.prisma.question.findMany({
        where: { examId: exam.id, examNumber: { not: null } },
        select: { examNumber: true },
        distinct: ['examNumber'],
      });
      numbers = [...new Set(rows.map((r) => r.examNumber).filter((n): n is number => n !== null))].sort((a, b) => a - b);
    }
    if (!numbers.length) throw new UnprocessableEntityException('Nenhuma questão numerada foi encontrada nesta prova.');

    if (isEnem) {
      const start = dto.day === 1 ? 1 : 91;
      const end = start + 89;
      const outside = numbers.filter((n) => n < start || n > end);
      if (outside.length) throw new BadRequestException(`Questões fora do ${dto.day}º dia: ${outside.slice(0, 8).join(', ')}.`);
    }

    const refs: { number: number; language: string }[] = [];
    for (const number of numbers) {
      if (isEnem && dto.day === 1 && number <= 5) {
        for (const language of dto.language ? [dto.language] : LANGUAGES) refs.push({ number, language });
      } else {
        refs.push({ number, language: '' });
      }
    }

    const select = {
      id: true,
      workspaceId: true,
      examNumber: true,
      sourceId: true,
      stem: true,
      subject: true,
      imageUrl: true,
      alternatives: { select: { position: true, text: true, isCorrect: true }, orderBy: { position: 'asc' as const } },
    };
    const rows: SuggestionQuestion[] = isEnem
      ? await this.prisma.question.findMany({
          where: { sourceId: { in: refs.map((r) => enemQuestionSourceId(exam.year!, dto.day!, r)) } },
          select,
          orderBy: { createdAt: 'asc' },
        })
      : await this.prisma.question.findMany({
          where: { examId: exam.id, examNumber: { in: numbers } },
          select,
          orderBy: { createdAt: 'asc' },
        });

    const byKey = new Map<string, SuggestionQuestion[]>();
    for (const question of rows) {
      if (!allowed.has(question.workspaceId)) continue;
      const key = isEnem ? (question.sourceId ?? '') : `${question.examNumber}:`;
      byKey.set(key, [...(byKey.get(key) ?? []), question]);
    }

    const picked = new Map<string, SuggestionQuestion>();
    const missing: { number: number; language: string }[] = [];
    for (const ref of refs) {
      const key = isEnem ? enemQuestionSourceId(exam.year!, dto.day!, ref) : `${ref.number}:`;
      const question = pickAccessibleQuestion(byKey.get(key) ?? [], bankWorkspaceId);
      if (question) picked.set(`${ref.number}:${ref.language}`, question);
      else missing.push(ref);
    }
    return { picked, missing, isEnem };
  }

  /**
   * Gabarito sugerido por IA. Para cada questão acessível:
   * - se o banco já tem exatamente uma alternativa correta, usa essa resposta
   *   com confiança 1 (é cálculo, não palpite);
   * - se não tem, pede à LuminIA uma alternativa + justificativa e deixa a
   *   confiança nula (não há base para calcular);
   * - questão com imagem, sem alternativas ou ambígua é pulada com o motivo.
   *
   * O gabarito nasce em rascunho, com todos os itens pendentes. Só o professor
   * valida e publica; o aluno vê os pendentes em amarelo e eles não contam.
   */
  async suggestWithAi(viewer: Viewer, dto: SuggestAnswerKeyDto) {
    if (!TEACHER_ACCOUNT_TYPES.includes(viewer.accountType)) {
      throw new ForbiddenException('Só professores e a gestão podem gerar gabarito sugerido por IA.');
    }
    const exam = await this.prisma.exam.findUnique({ where: { id: dto.examId }, select: { id: true, name: true, year: true } });
    if (!exam) throw new BadRequestException('Prova não encontrada.');
    const isEnemExam = /enem/i.test(exam.name);
    if (isEnemExam && !exam.year) throw new BadRequestException('A prova do Enem está sem ano cadastrado.');
    const application = dto.application?.trim() || 'Regular';
    const day = dto.day ?? null;
    const bookletColor = dto.bookletColor?.trim() || null;
    // No Enem a ordem das questões muda com o caderno: sem a cor, o gabarito
    // sugerido poderia ser aplicado ao caderno errado.
    if (isEnemExam && !bookletColor) throw new BadRequestException('Informe a cor do caderno do Enem para gerar o gabarito sugerido.');
    const official = await this.prisma.answerKey.findFirst({
      where: {
        examId: exam.id,
        origin: AnswerKeyOrigin.OFFICIAL,
        status: { not: AnswerKeyStatus.ARCHIVED },
        application,
        day,
        ...(bookletColor ? { bookletColor: { equals: bookletColor, mode: 'insensitive' as const } } : { bookletColor: null }),
      },
      select: { id: true },
    });
    if (official) throw new ConflictException('Esta prova já tem gabarito oficial: use o oficial em vez de gerar sugestões.');

    const bank = await this.prisma.workspace.findFirst({
      where: { institution: { email: QUESTION_BANK_INSTITUTION_EMAIL } },
      select: { id: true },
    });
    const allowed = await this.allowedWorkspaceIds(viewer.id);
    const { picked, missing, isEnem } = await this.suggestionQuestions(exam, dto, allowed, bank?.id ?? null);
    if (!picked.size) {
      throw new UnprocessableEntityException(`Nenhuma questão acessível do banco foi encontrada para esta prova${isEnem && day ? ` (${day}º dia)` : ''}. Importe o caderno no banco de questões ou confira a prova escolhida.`);
    }

    const skipped: SuggestionSkip[] = [];
    const models = new Set<string>();
    const results = await mapLimit([...picked.entries()], 3, async ([key, question]) => {
      const [numberText, language] = key.split(':');
      const number = Number(numberText);
      const alternatives = question.alternatives.map((a) => ({ position: a.position, text: a.text, isCorrect: a.isCorrect }));
      if (question.imageUrl) {
        skipped.push({ number, language, reason: 'A questão depende de imagem e a LuminIA não lê a imagem; a sugestão não seria confiável.' });
        return null;
      }
      if (alternatives.length < 2) {
        skipped.push({ number, language, reason: 'A questão não tem alternativas suficientes para sugerir uma resposta.' });
        return null;
      }
      const correct = correctPositions(alternatives);
      const area = isEnem ? enemArea(number) : (dto.area?.trim() || question.subject);
      if (correct.length === 1) {
        const position = correct[0];
        return {
          number,
          language,
          answer: position,
          area,
          questionId: question.id,
          justification: `Alternativa ${positionLetter(position)} já registrada como correta no banco de questões.`,
          confidence: 1,
          validated: false as const,
        };
      }
      if (correct.length > 1) {
        skipped.push({ number, language, reason: 'Mais de uma alternativa está marcada como correta no banco; corrija o cadastro antes de sugerir.' });
        return null;
      }
      if (!this.ai) {
        skipped.push({ number, language, reason: 'A IA não está configurada neste ambiente.' });
        return null;
      }
      try {
        const result = await this.ai.generateStructured({
          system: SUGGESTION_SYSTEM_PROMPT,
          prompt: suggestionPrompt({ stem: question.stem, subject: question.subject, area, alternatives: alternatives.map((a) => ({ position: a.position, text: a.text })) }),
          maxTokens: 500,
          timeoutMs: 30_000,
          temperature: 0.1,
        });
        if (!result?.text?.trim()) {
          skipped.push({ number, language, reason: 'A IA não devolveu uma sugestão.' });
          return null;
        }
        if (result.model) models.add(result.model);
        const parsed = parseSuggestedAnswerOutcome(result.text, alternatives);
        if (!parsed) {
          skipped.push({ number, language, reason: 'A IA não conseguiu decidir com segurança ou devolveu uma resposta inválida.' });
          return null;
        }
        if (parsed.position === null) {
          skipped.push({ number, language, reason: parsed.justification });
          return null;
        }
        return {
          number,
          language,
          answer: parsed.position,
          area,
          questionId: question.id,
          justification: parsed.justification,
          confidence: null,
          validated: false as const,
        };
      } catch (error) {
        this.logger.warn(`LuminIA não sugeriu a questão ${number} do gabarito ${exam.name}: ${error instanceof Error ? error.message : String(error)}`);
        skipped.push({ number, language, reason: 'A IA falhou ao analisar esta questão.' });
        return null;
      }
    });

    const suggested = results.filter((i): i is NonNullable<typeof i> => Boolean(i));
    skipped.sort((a, b) => a.number - b.number || a.language.localeCompare(b.language));

    // Toda questão pedida entra no rascunho. Quando a IA não sugere (imagem,
    // ambiguidade, falha) ou a questão não está no banco, o item fica pendente
    // com resposta nula e o motivo — o professor preenche. Não inventamos uma
    // alternativa só para o gabarito parecer completo.
    const placeholders = [
      ...missing.map((ref) => ({
        number: ref.number,
        language: ref.language,
        answer: null,
        area: isEnem ? enemArea(ref.number) : (dto.area?.trim() || null),
        questionId: null,
        justification: 'Sem questão acessível no banco; preencha a resposta manualmente.',
        confidence: null,
        validated: false as const,
      })),
      ...skipped.map((s) => {
        const question = picked.get(`${s.number}:${s.language}`);
        return {
          number: s.number,
          language: s.language,
          answer: null,
          area: isEnem ? enemArea(s.number) : (dto.area?.trim() || question?.subject || null),
          questionId: question?.id ?? null,
          justification: `Sem sugestão: ${s.reason}`,
          confidence: null,
          validated: false as const,
        };
      }),
    ];
    const items = [...suggested, ...placeholders].sort((a, b) => a.number - b.number || a.language.localeCompare(b.language));

    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId: viewer.id, status: 'ACTIVE' }, select: { workspaceId: true } });
    const created = await this.prisma.answerKey.create({
      data: {
        examId: exam.id,
        application,
        day,
        bookletColor,
        area: dto.area?.trim() || null,
        origin: AnswerKeyOrigin.AI_SUGGESTED,
        status: AnswerKeyStatus.DRAFT,
        sourceName: 'LuminIA — sugestão',
        workspaceId: membership?.workspaceId ?? null,
        createdBy: viewer.id,
        items: { create: items },
      },
      select: { id: true },
    });
    const detail = await this.get(viewer, created.id, true);
    const aiCount = suggested.filter((i) => i.confidence === null).length;
    const knownCount = suggested.filter((i) => i.confidence === 1).length;
    return {
      answerKey: detail,
      counts: { ai: aiCount, known: knownCount, skipped: skipped.length, missing: missing.length },
      skipped,
      missing,
      models: [...models],
    };
  }

  /**
   * Validação do professor: confirma (ou corrige) respostas do gabarito
   * sugerido. Os itens enviados passam a `validated: true`; a versão sobe
   * quando algo muda, para as conferências antigas avisarem. Itens não
   * enviados continuam pendentes e não contam para o aluno.
   */
  async validateItems(viewer: Viewer, id: string, dto: ValidateAnswerKeyItemsDto) {
    const row = await this.assertCanEdit(viewer, id);
    if (row.origin !== AnswerKeyOrigin.AI_SUGGESTED && row.origin !== AnswerKeyOrigin.TEACHER) {
      throw new BadRequestException('Só itens de gabaritos de professor ou sugeridos por IA podem ser validados por aqui.');
    }
    const items = await this.prisma.answerKeyItem.findMany({
      where: { answerKeyId: id },
      select: { id: true, number: true, language: true, answer: true, justification: true, validated: true },
    });
    if (!items.length) throw new BadRequestException('Este gabarito ainda não tem itens.');

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const seen = new Set<string>();
    let changed = false;
    for (const input of dto.items) {
      const language = input.language ?? '';
      const key = `${input.number}:${language}`;
      if (seen.has(key)) throw new BadRequestException(`Questão ${input.number}${language ? ` (${language})` : ''} repetida na validação.`);
      seen.add(key);
      const item = items.find((i) => i.number === input.number && i.language === language);
      if (!item) throw new BadRequestException(`A questão ${input.number}${language ? ` (${language})` : ''} não existe neste gabarito.`);
      const answer = input.answer === undefined ? item.answer : input.answer;
      const justification = input.justification === undefined ? item.justification : (input.justification?.trim() || null);
      const answerChanged = input.answer !== undefined && input.answer !== item.answer;
      const justificationChanged = input.justification !== undefined && justification !== item.justification;
      if (!item.validated || answerChanged || justificationChanged) changed = true;
      updates.push(this.prisma.answerKeyItem.update({
        where: { id: item.id },
        data: {
          validated: true,
          answer,
          justification,
          ...(answerChanged ? { confidence: null } : {}),
        },
      }));
    }
    if (!updates.length) throw new BadRequestException('Informe os itens a validar.');
    if (changed) updates.push(this.prisma.answerKey.update({ where: { id }, data: { version: { increment: 1 } } }));
    await this.prisma.$transaction(updates);
    return this.get(viewer, id, true);
  }

  /**
   * Importa o gabarito oficial do PDF do INEP (só host download.inep.gov.br).
   * Confere se veio completo (90 questões do dia e as duas línguas no 1º dia)
   * antes de gravar; reimportar o mesmo PDF devolve o que já existe.
   */
  async importFromInep(viewer: Viewer, dto: ImportInepAnswerKeyDto) {
    if (viewer.accountType !== 'ADMIN') throw new ForbiddenException('Só a administração da Lumina importa gabarito oficial.');
    if (!this.enem) throw new Error('Importação do INEP indisponível.');
    const parsed = await this.enem.fetchOfficialGabarito(dto.gabaritoUrl);
    const problems = checkInepGabarito(parsed);
    if (problems.length) throw new UnprocessableEntityException(`O PDF não parece um gabarito completo do Enem: ${problems.join(' ')}`);
    const year = parsed.year!;
    const day = parsed.day!;
    const application = dto.application?.trim() || 'Regular';
    const items = parsed.items.map((i) => ({ number: i.number, language: i.language, answer: letterToPosition(i.letter), area: enemArea(i.number) }));

    const exam = (await this.prisma.exam.findFirst({ where: { name: { equals: 'ENEM', mode: 'insensitive' }, year }, select: { id: true } }))
      ?? (await this.prisma.exam.create({ data: { name: 'ENEM', year, institution: 'INEP' }, select: { id: true } }));
    const existing = await this.prisma.answerKey.findFirst({
      where: { examId: exam.id, origin: AnswerKeyOrigin.OFFICIAL, application, day, bookletColor: parsed.bookletColor, status: { not: AnswerKeyStatus.ARCHIVED } },
      include: { items: true },
    });
    if (existing) {
      const same = existing.items.length === items.length && items.every((i) => existing.items.some((e) => e.number === i.number && e.language === i.language && e.answer === i.answer));
      if (same) {
        await this.safeRelinkQuestions(existing.id);
        return this.get(viewer, existing.id, true);
      }
      throw new ConflictException('Já existe gabarito oficial deste caderno com respostas diferentes. Se o INEP publicou retificação, use a correção do gabarito existente (com a nota do que mudou).');
    }
    const created = await this.prisma.answerKey.create({
      data: {
        examId: exam.id,
        application,
        day,
        bookletColor: parsed.bookletColor,
        origin: AnswerKeyOrigin.OFFICIAL,
        status: dto.publish === false ? AnswerKeyStatus.DRAFT : AnswerKeyStatus.PUBLISHED,
        sourceName: `INEP${parsed.bookletNumber ? ` — caderno ${parsed.bookletNumber}` : ''}`,
        sourceUrl: dto.gabaritoUrl,
        publishedAt: new Date(dto.publishedAt),
        createdBy: viewer.id,
        items: { create: items.map((i) => ({ ...i, validated: true })) },
      },
      select: { id: true },
    });
    await this.safeRelinkQuestions(created.id);
    return this.get(viewer, created.id, true);
  }

  /** Cartão-resposta para imprimir e marcar as respostas deste gabarito. */
  async sheet(viewer: Viewer, id: string) {
    const detail = await this.get(viewer, id, false);
    let layout;
    try {
      layout = answerKeySheetLayout(detail.numbers, detail.needsLanguage);
    } catch (error) {
      throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Não foi possível montar o cartão.');
    }
    const title = [detail.exam.name, detail.exam.year, detail.day ? `${detail.day}º dia` : null, detail.bookletColor ? `Caderno ${detail.bookletColor}` : null].filter(Boolean).join(' · ');
    return { title, layout, code: ANSWER_KEY_SHEET_CODE, bits: answerKeySheetBits() };
  }

  /**
   * Lê a foto do cartão (PDF de uma página gerado no app) e devolve as
   * respostas para o aluno conferir. Não grava nada: a correção só acontece
   * quando o aluno confirma, pelo mesmo caminho da digitação.
   */
  async readSheet(viewer: Viewer, id: string, pdfDataUrl: string) {
    const detail = await this.get(viewer, id, false);
    const layout = answerKeySheetLayout(detail.numbers, detail.needsLanguage);
    let page;
    try {
      const pages = extractPdfImages(decodePdf(pdfDataUrl));
      if (pages.length !== 1) throw new UnprocessableEntityException('Envie uma folha por vez.');
      page = pages[0];
    } catch (error) {
      if (error instanceof PdfError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    let reading;
    try {
      reading = readSheet(page, layout);
    } catch (error) {
      if (error instanceof OmrError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    const warnings = [...reading.warnings];
    if (reading.code !== null && reading.code !== ANSWER_KEY_SHEET_CODE) {
      throw new UnprocessableEntityException('Esta folha é o cartão de um simulado, não o cartão deste gabarito. Use o scanner de gabarito do simulado.');
    }
    const answers = readingToAnswers(layout, reading.questions);
    return { answers, warnings, reviewCount: answers.filter((a) => a.review).length };
  }

  /** Alunos das turmas que o professor cria ou leciona (ativas). */
  private async studentsOf(teacherId: string): Promise<Map<string, string>> {
    const members = await this.prisma.classMember.findMany({
      where: { class: { archived: false, OR: [{ createdBy: teacherId }, { teachers: { some: { userId: teacherId } } }] } },
      select: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    return new Map(members.map((m) => [m.user.id, personName(m.user)]));
  }

  /**
   * Painel do professor: como os alunos das turmas dele foram neste gabarito
   * (vale também para o oficial). Conta a conferência mais recente de cada
   * aluno. A administração vê todos os alunos.
   */
  async stats(viewer: Viewer, id: string) {
    if (!TEACHER_ACCOUNT_TYPES.includes(viewer.accountType)) throw new ForbiddenException('Só professores e a gestão veem o desempenho das turmas.');
    const row = await this.loadVisible(viewer, id);
    const students = viewer.accountType === 'ADMIN' ? null : await this.studentsOf(viewer.id);
    if (students && !students.size) return { answerKey: this.summary(row, viewer), students: 0, averagePercent: 0, byArea: [], questions: [], ranking: [] };
    const checks = await this.prisma.answerKeyCheck.findMany({
      where: { answerKeyId: id, ...(students ? { userId: { in: [...students.keys()] } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    const latest = new Map<string, (typeof checks)[number]>();
    for (const c of checks) if (!latest.has(c.userId)) latest.set(c.userId, c);
    const items = await this.gradingItems(id);
    const perQuestion = new Map<number, { area: string | null; answer: number | null; correct: number; wrong: number; blank: number; picks: number[] }>();
    const areaTotals = new Map<string, { correct: number; scored: number }>();
    const ranking = [] as { userId: string; name: string; percent: number; correct: number; scored: number; checkedAt: Date }[];
    for (const c of latest.values()) {
      const r = gradeAnswers(items, c.answersJson as Record<string, number | null>, c.language);
      ranking.push({ userId: c.userId, name: students?.get(c.userId) ?? personName(c.user), percent: r.percent, correct: r.correct, scored: r.correct + r.wrong + r.blank, checkedAt: c.createdAt });
      for (const a of r.byArea) {
        const t = areaTotals.get(a.area) ?? { correct: 0, scored: 0 };
        t.correct += a.correct; t.scored += a.scored; areaTotals.set(a.area, t);
      }
      for (const q of r.questions) {
        if (q.status === 'ANNULLED' || q.status === 'PENDING') continue;
        const t = perQuestion.get(q.number) ?? { area: q.area, answer: q.answer, correct: 0, wrong: 0, blank: 0, picks: [0, 0, 0, 0, 0] };
        if (q.status === 'CORRECT') t.correct++; else if (q.status === 'WRONG') t.wrong++; else t.blank++;
        if (q.selected) t.picks[q.selected - 1]++;
        perQuestion.set(q.number, t);
      }
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const questions = [...perQuestion.entries()].map(([number, t]) => {
      const total = t.correct + t.wrong + t.blank;
      // Distrator mais escolhido: a alternativa errada que mais atraiu a turma.
      const distractor = t.picks.map((count, i) => ({ position: i + 1, count })).filter((p) => p.position !== t.answer && p.count > 0).sort((a, b) => b.count - a.count)[0] ?? null;
      return { number, area: t.area, answer: t.answer, correctPercent: pct(t.correct, total), wrong: t.wrong, blank: t.blank, total, topDistractor: distractor };
    }).sort((a, b) => a.correctPercent - b.correctPercent || a.number - b.number);
    return {
      answerKey: this.summary(row, viewer),
      students: latest.size,
      averagePercent: latest.size ? Math.round((ranking.reduce((s, r) => s + r.percent, 0) / latest.size) * 10) / 10 : 0,
      byArea: [...areaTotals.entries()].map(([area, t]) => ({ area, percent: pct(t.correct, t.scored), scored: t.scored })).sort((a, b) => a.percent - b.percent),
      questions,
      ranking: ranking.sort((a, b) => b.percent - a.percent),
    };
  }

  /**
   * Gabarito comunitário: o aluno manda as respostas que marcou e elas viram
   * votos (um por questão; reenviar substitui). A resposta de cada questão é
   * a mais votada, sempre como item pendente (amarelo), com a concordância.
   * Não existe comunitário onde já há oficial.
   */
  async contribute(viewer: Viewer, dto: CommunityContributionDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id: dto.examId }, select: { id: true, name: true } });
    if (!exam) throw new BadRequestException('Prova não encontrada.');
    const application = dto.application?.trim() || 'Regular';
    const day = dto.day ?? null;
    const bookletColor = dto.bookletColor?.trim() || null;
    const official = await this.prisma.answerKey.findFirst({ where: { examId: exam.id, origin: AnswerKeyOrigin.OFFICIAL, status: AnswerKeyStatus.PUBLISHED, application, day, bookletColor }, select: { id: true } });
    if (official) throw new ConflictException('Esta prova já tem gabarito oficial: confira por ele.');

    const isEnem = /enem/i.test(exam.name);
    const range = isEnem && day === 1 ? [1, 90] : isEnem && day === 2 ? [91, 180] : [1, 400];
    const votes = Object.entries(dto.answers)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => ({ number: Number(k), answer: Number(v) }));
    if (!votes.length) throw new BadRequestException('Marque pelo menos uma resposta para contribuir.');
    for (const v of votes) {
      if (!Number.isInteger(v.number) || v.number < range[0] || v.number > range[1]) throw new BadRequestException(`Questão ${v.number} fora da prova.`);
      if (!Number.isInteger(v.answer) || v.answer < 1 || v.answer > 5) throw new BadRequestException(`Resposta inválida na questão ${v.number}.`);
    }
    const languageFor = (n: number) => (isEnem && day === 1 && n <= 5 ? (dto.language ?? '') : '');
    if (isEnem && day === 1 && votes.some((v) => v.number <= 5) && !LANGUAGES.includes((dto.language ?? '') as (typeof LANGUAGES)[number])) {
      throw new BadRequestException('Escolha a língua estrangeira para contribuir nas questões 1 a 5.');
    }

    let key = await this.prisma.answerKey.findFirst({ where: { examId: exam.id, origin: AnswerKeyOrigin.COMMUNITY, status: { not: AnswerKeyStatus.ARCHIVED }, application, day, bookletColor }, select: { id: true } });
    if (!key) {
      try {
        key = await this.prisma.answerKey.create({
          data: { examId: exam.id, application, day, bookletColor, origin: AnswerKeyOrigin.COMMUNITY, status: AnswerKeyStatus.PUBLISHED, sourceName: 'Comunidade Lumina', createdBy: viewer.id },
          select: { id: true },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        key = await this.prisma.answerKey.findFirstOrThrow({ where: { examId: exam.id, origin: AnswerKeyOrigin.COMMUNITY, status: { not: AnswerKeyStatus.ARCHIVED }, application, day, bookletColor }, select: { id: true } });
      }
    }
    const keyId = key.id;
    await this.prisma.$transaction(async (tx) => {
      for (const v of votes) {
        const language = languageFor(v.number);
        await tx.answerKeyVote.upsert({
          where: { answerKeyId_userId_number_language: { answerKeyId: keyId, userId: viewer.id, number: v.number, language } },
          update: { answer: v.answer },
          create: { answerKeyId: keyId, userId: viewer.id, number: v.number, language, answer: v.answer },
        });
      }
      await this.recomputeCommunity(tx, keyId, isEnem);
    });
    await this.safeRelinkQuestions(keyId);
    return this.get(viewer, keyId, false);
  }

  /** Refaz os itens do comunitário a partir dos votos (mais votada + concordância). */
  private async recomputeCommunity(tx: Prisma.TransactionClient, answerKeyId: string, isEnem: boolean) {
    const votes = await tx.answerKeyVote.findMany({ where: { answerKeyId }, select: { number: true, language: true, answer: true } });
    const groups = new Map<string, { number: number; language: string; counts: number[] }>();
    for (const v of votes) {
      const k = `${v.number}:${v.language}`;
      const g = groups.get(k) ?? { number: v.number, language: v.language, counts: [0, 0, 0, 0, 0] };
      g.counts[v.answer - 1]++;
      groups.set(k, g);
    }
    const items = [...groups.values()].flatMap((g) => {
      const total = g.counts.reduce((a, b) => a + b, 0);
      if (total < COMMUNITY_MIN_VOTES) return [];
      const top = Math.max(...g.counts);
      const answer = g.counts.indexOf(top) + 1;
      const tie = g.counts.filter((c) => c === top).length > 1;
      return [{
        answerKeyId,
        number: g.number,
        language: g.language,
        answer,
        area: isEnem ? enemArea(g.number) : null,
        validated: false,
        votes: total,
        confidence: Math.round((top / total) * 100) / 100,
        justification: `${top} de ${total} votos${tie ? ' (empate: sem consenso)' : ''}`,
      }];
    });
    await tx.answerKeyItem.deleteMany({ where: { answerKeyId } });
    if (items.length) await tx.answerKeyItem.createMany({ data: items });
  }

  /** Moderação: tira os votos de um usuário (ex.: votos em massa errados de propósito). */
  async removeVotes(viewer: Viewer, id: string, userId: string) {
    if (viewer.accountType !== 'ADMIN') throw new ForbiddenException('Só a administração modera o gabarito comunitário.');
    const key = await this.prisma.answerKey.findUnique({ where: { id }, select: { origin: true, exam: { select: { name: true } } } });
    if (!key || key.origin !== AnswerKeyOrigin.COMMUNITY) throw new NotFoundException('Gabarito comunitário não encontrado.');
    const removed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.answerKeyVote.deleteMany({ where: { answerKeyId: id, userId } });
      await this.recomputeCommunity(tx, id, /enem/i.test(key.exam.name));
      return count;
    });
    return { removed };
  }

  private async assertCanEdit(viewer: Viewer, id: string) {
    const row = await this.prisma.answerKey.findUnique({ where: { id }, select: { id: true, origin: true, createdBy: true, exam: { select: { name: true } } } });
    if (!row) throw new NotFoundException('Gabarito não encontrado.');
    const allowed = row.origin === AnswerKeyOrigin.OFFICIAL || row.origin === AnswerKeyOrigin.COMMUNITY ? viewer.accountType === 'ADMIN' : row.createdBy === viewer.id;
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
    await this.safeRelinkQuestions(id);
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

/** Executa promessas com no máximo `limit` em paralelo, preservando a ordem. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** O que falta para o gabarito do INEP valer como oficial completo. */
export function checkInepGabarito(g: OfficialGabarito): string[] {
  const problems: string[] = [];
  if (!g.year) problems.push('Ano não encontrado no cabeçalho.');
  if (g.day !== 1 && g.day !== 2) problems.push('Dia de prova não encontrado no cabeçalho.');
  if (!g.bookletColor) problems.push('Cor do caderno não encontrada.');
  if (g.day === 1 || g.day === 2) {
    const start = g.day === 1 ? 1 : 91;
    const missing: number[] = [];
    for (let n = start; n < start + 90; n++) if (!g.items.some((i) => i.number === n)) missing.push(n);
    if (missing.length) problems.push(`Faltam as questões ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}.`);
    const outside = g.items.filter((i) => i.number < start || i.number >= start + 90);
    if (outside.length) problems.push(`Questões fora do ${g.day}º dia: ${outside.slice(0, 5).map((i) => i.number).join(', ')}.`);
    if (g.day === 1) {
      for (let n = 1; n <= 5; n++) {
        const langs = g.items.filter((i) => i.number === n).map((i) => i.language).sort().join(',');
        if (langs !== 'ESPANHOL,INGLES') { problems.push('As questões 1 a 5 precisam das respostas de inglês e de espanhol.'); break; }
      }
    }
  }
  return problems;
}
