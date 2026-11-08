import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionDifficulty, QuestionSourceType, UserQuestionProgress, Workspace } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from './question-access.service';
import {
  AttemptCounts,
  QuestionAttemptsRepository,
} from './question-attempts.repository';
import { UserQuestionProgressRepository, UserQuestionState } from './user-question-progress.repository';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAttemptDto } from './dto/create-attempt.dto';
import {
  AlternativeFeedbackDto,
  AttemptResultDto,
  PaginatedQuestionsDto,
  QuestionResponseDto,
  QuestionStatsDto,
  QuestionUserProgressDto,
  SimilarQuestionsDto,
} from './dto/question-response.dto';
import { QuestionHintDto } from './dto/question-resolution.dto';
import { ErrorNotebookEntryDto } from './dto/error-notebook.dto';
import { ErrorNotebookService } from './error-notebook.service';
import { TopicMasteryService } from './topic-mastery.service';
import { QueryQuestionsDto, QuestionSort } from './dto/query-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QUESTION_HINTS_PROVIDER, QuestionHintsService } from './hints/question-hints.service';
import { HintProvider } from './hints/hint-provider.interface';
import { QuestionWithAlternatives, QuestionsRepository } from './questions.repository';
import { buildQuestionTutorContext } from './question-tutor-context';
import { SubjectsRepository } from './subjects.repository';
import { ExamsRepository } from './exams.repository';
import { QuestionTextSearchRepository } from './question-text-search.repository';

interface QuestionClassification {
  subject: string;
  topic: string;
  exam: string;
  subjectId: string | null;
  topicId: string | null;
  examId: string | null;
}

@Injectable()
export class QuestionsService {
  private static readonly MAX_ALTERNATIVES = 6;
  private static readonly DEFAULT_SIMILAR_LIMIT = 5;
  private static readonly MAX_SIMILAR_LIMIT = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsRepository: QuestionsRepository,
    private readonly questionAttemptsRepository: QuestionAttemptsRepository,
    private readonly questionAccessService: QuestionAccessService,
    private readonly questionProgressRepository: UserQuestionProgressRepository,
    private readonly subjectsRepository: SubjectsRepository,
    private readonly examsRepository: ExamsRepository,
    private readonly textSearchRepository: QuestionTextSearchRepository,
    @Inject(QUESTION_HINTS_PROVIDER) private readonly hintProvider: HintProvider,
    private readonly hintsService: QuestionHintsService,
    private readonly errorNotebookService: ErrorNotebookService,
    private readonly topicMasteryService: TopicMasteryService,
  ) {}

  async create(userId: string, dto: CreateQuestionDto): Promise<QuestionResponseDto> {
    const workspaceId = dto.workspaceId
      ? await this.resolveTargetWorkspaceId(userId, dto.workspaceId)
      : (await this.questionAccessService.getPersonalWorkspaceOrThrow(userId)).id;
    this.validateAlternatives(dto.alternatives);
    const classification = await this.resolveClassification(dto);
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (teacher && classification.subject.toLocaleLowerCase('pt-BR') !== teacher.subject.toLocaleLowerCase('pt-BR')) {
      throw new BadRequestException(`Sua matéria cadastrada é ${teacher.subject}. Crie questões dessa matéria.`);
    }

    const question = await this.questionsRepository.create({
      workspaceId,
      createdBy: userId,
      sourceType: teacher ? QuestionSourceType.PARTNER : (dto.sourceType ?? QuestionSourceType.OFFICIAL),
      sourceName: teacher ? 'Professor da Lumina' : (dto.sourceName?.trim() || 'Lumina'),
      sourceId: null,
      contentHash: null,
      subject: classification.subject,
      topic: classification.topic,
      difficulty: dto.difficulty,
      exam: classification.exam,
      year: dto.year ?? null,
      examNumber: dto.examNumber ?? null,
      stem: dto.stem.trim(),
      explanation: dto.explanation?.trim() || null,
      imageUrl: dto.imageUrl?.trim() || null,
      subjectId: classification.subjectId,
      topicId: classification.topicId,
      examId: classification.examId,
      alternatives: this.normalizeAlternatives(dto.alternatives),
    });

    // Autor vê a correta logo após criar/editar.
    return this.toAuthorResponse(question, true);
  }

  async findAll(userId: string, query: QueryQuestionsDto): Promise<PaginatedQuestionsDto> {
    const [personal, bank] = await Promise.all([
      this.questionAccessService.getPersonalWorkspace(userId),
      this.questionAccessService.getBankWorkspace(),
    ]);
    const workspaceIds = unique(
      [personal?.id, bank?.id].filter((id): id is string => Boolean(id)),
    );

    const where: Prisma.QuestionWhereInput = { workspaceId: { in: workspaceIds } };
    if (query.subject) where.subject = this.contains(query.subject);
    if (query.topic) where.topic = this.contains(query.topic);
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.examId) where.examId = query.examId;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.exam) where.exam = this.contains(query.exam);
    if (query.year) where.year = query.year;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.examNumber) where.examNumber = query.examNumber;

    // Busca por palavra-chave passa por um pré-filtro de ids que ignora
    // acento e maiúsculas (unaccent no banco). O restante da listagem
    // (paginação, ordenação, total e estatísticas) continua no Prisma, e o
    // filtro antigo em `stem` sai daqui para não restringir duas vezes —
    // ver QuestionTextSearchRepository.
    if (query.search?.trim()) {
      const ids = await this.textSearchRepository.findIdsMatching(
        query.search,
        workspaceIds,
      );
      where.id = { in: ids };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, rows, canManageBank] = await Promise.all([
      this.questionsRepository.count(where),
      this.questionsRepository.findMany(where, {
        skip: (page - 1) * limit,
        take: limit,
        orderBy: this.resolveSort(query.sort),
      }),
      bank ? this.questionAccessService.hasManagePermission(userId, bank.id) : false,
    ]);

    // Estatísticas agregadas de acerto de todas as questões da página — uma
    // única consulta, sem N+1.
    const statsByQuestion = await this.questionAttemptsRepository.countsByQuestionIds(
      rows.map((question) => question.id),
    );

    // Progresso do aluno nas questões da página (favorita, marcada para
    // revisar, já respondeu) — outra consulta única, também sem N+1. É o que
    // permite à interface mostrar o estado real de cada cartão.
    const progressRows = await this.questionProgressRepository.findManyForQuestions(
      userId,
      rows.map((question) => question.id),
    );
    const progressByQuestion = new Map(progressRows.map((progress) => [progress.questionId, progress]));

    return {
      items: rows.map((question) => ({
        ...this.toResponse(
          question,
          question.workspaceId === personal?.id ||
            (question.workspaceId === bank?.id && canManageBank),
          QuestionsService.toStats(statsByQuestion.get(question.id)),
        ),
        progress: QuestionsService.toUserProgress(progressByQuestion.get(question.id)),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
      canManageBank,
    };
  }

  /** Detalhe de uma questão. Por padrão as alternativas vêm sem marcar a
   * correta (modo resposta/estudo); `includeAnswer` é o modo autor (mostra
   * is_correct para edição) e só é liberado para quem pode gerenciar a
   * questão — no banco público, somente o admin. */
  async findById(
    userId: string,
    id: string,
    includeAnswer: boolean,
  ): Promise<QuestionResponseDto> {
    const question = await this.findAccessible(userId, id);
    const stats = (await this.questionAttemptsRepository.countsByQuestionIds([question.id])).get(
      question.id,
    );
    if (includeAnswer) {
      await this.questionAccessService.assertCanManage(userId, question.workspaceId);
      return this.toAuthorResponse(question, true, QuestionsService.toStats(stats));
    }
    const personal = await this.questionAccessService.getPersonalWorkspace(userId);
    const progress = await this.questionProgressRepository.find(userId, question.id);
    return {
      ...this.toResponse(
        question,
        question.workspaceId === personal?.id ||
          (await this.questionAccessService.hasManagePermission(userId, question.workspaceId)),
        QuestionsService.toStats(stats),
      ),
      progress: QuestionsService.toUserProgress(progress),
    };
  }

  async update(userId: string, id: string, dto: UpdateQuestionDto): Promise<QuestionResponseDto> {
    const question = await this.findAccessible(userId, id);
    await this.questionAccessService.assertCanManage(userId, question.workspaceId);

    const classification = await this.resolveClassification(dto, {
      subject: question.subject,
      topic: question.topic,
      exam: question.exam,
      subjectId: question.subjectId,
      topicId: question.topicId,
      examId: question.examId,
    });
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (teacher && classification.subject.toLocaleLowerCase('pt-BR') !== teacher.subject.toLocaleLowerCase('pt-BR')) {
      throw new BadRequestException(`Sua matéria cadastrada é ${teacher.subject}. Edite questões dessa matéria.`);
    }

    const data: Prisma.QuestionUpdateInput = {};
    if (dto.subject !== undefined || dto.subjectId !== undefined) data.subject = classification.subject;
    if (dto.topic !== undefined || dto.topicId !== undefined) data.topic = classification.topic;
    if (dto.exam !== undefined || dto.examId !== undefined) data.exam = classification.exam;
    if (classification.subjectId && classification.subjectId !== question.subjectId) {
      data.subjectRef = { connect: { id: classification.subjectId } };
    }
    if (classification.topicId !== question.topicId) data.topicRef = classification.topicId ? { connect: { id: classification.topicId } } : { disconnect: true };
    if (classification.examId !== question.examId) data.examRef = classification.examId ? { connect: { id: classification.examId } } : { disconnect: true };
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty;
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.examNumber !== undefined) data.examNumber = dto.examNumber;
    if (dto.stem !== undefined) data.stem = dto.stem.trim();
    if (dto.explanation !== undefined) data.explanation = dto.explanation?.trim() || null;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl?.trim() || null;
    if (dto.sourceType !== undefined && !teacher) data.sourceType = dto.sourceType;
    if (dto.sourceName !== undefined && !teacher) data.sourceName = dto.sourceName.trim();

    if (dto.alternatives !== undefined) {
      this.validateAlternatives(dto.alternatives);
      const alternatives = this.normalizeAlternatives(dto.alternatives);

      // Troca de alternativas dentro da mesma transação: atualiza os campos
      // da questão e substitui as alternativas antigas pelas novas.
      await this.prisma.$transaction(async (tx) => {
        await this.questionsRepository.updateFields(id, data, tx);
        await this.questionsRepository.deleteAlternatives(id, tx);
        await this.questionsRepository.createAlternatives(id, alternatives, tx);
      });
    } else {
      await this.questionsRepository.updateFields(id, data);
    }

    const updated = await this.questionsRepository.findById(id);
    return this.toAuthorResponse(updated as QuestionWithAlternatives, true);
  }

  async remove(userId: string, id: string): Promise<void> {
    const question = await this.findAccessible(userId, id);
    await this.questionAccessService.assertCanManage(userId, question.workspaceId);
    await this.questionsRepository.delete(question.id);
  }

  /** Registra a resposta do usuário, atualiza o progresso da questão e
   * devolve o resultado (acerto + qual era a alternativa correta). O gabarito
   * nunca é exposto antes disso. */
  async answer(
    userId: string,
    questionId: string,
    dto: CreateAttemptDto,
  ): Promise<AttemptResultDto> {
    const question = await this.findAccessible(userId, questionId);

    const selected = question.alternatives.find(
      (alternative) => alternative.position === dto.selectedPosition,
    );
    if (!selected) {
      throw new BadRequestException('Alternativa inválida para esta questão.');
    }

    const correct = question.alternatives.find((alternative) => alternative.isCorrect);
    if (!correct) {
      throw new BadRequestException('Esta questão ainda não tem alternativa correta cadastrada.');
    }

    const isCorrect = selected.isCorrect;

    // Tentativa + progresso + caderno de erros na mesma transação: o histórico
    // nunca diverge do contador de desempenho do aluno, e não existe erro no
    // caderno sem a tentativa que o produziu.
    let notebook: ErrorNotebookEntryDto | null = null;
    await this.prisma.$transaction(async (tx) => {
      await this.questionAttemptsRepository.create(
        {
          questionId: question.id,
          workspaceId: question.workspaceId,
          userId,
          selectedPosition: dto.selectedPosition,
          isCorrect,
          timeSpent: dto.timeSpent ?? null,
        },
        tx,
      );
      await this.questionProgressRepository.recordAttempt(userId, question.id, isCorrect, tx);
      // Errar cria (ou reabre) a entrada do caderno; acertar só evolui uma
      // entrada que já existe. Devolve o estado novo para a interface mostrar
      // sem segunda chamada.
      const entry = await this.errorNotebookService.registerAttempt(
        userId,
        question.id,
        isCorrect,
        tx,
      );
      if (entry) {
        notebook = this.errorNotebookService.toEntryDto(entry);
        // A questão dominada no caderno não deve voltar pela fila manual: a
        // marcação "revisar depois" cumpriu o papel dela. Sem isso, uma questão
        // marcada antes do erro reapareceria na central depois do segundo acerto.
        if (entry.status === 'DOMINADA') {
          await this.questionProgressRepository.setMarkedForReview(
            userId,
            question.id,
            false,
            tx,
          );
        }
      }
      await this.topicMasteryService.registerAttempt(
        userId,
        question.subjectId,
        question.topicId,
        isCorrect,
        tx,
      );
    });

    // Estatísticas agregadas já contando a tentativa recém-registrada.
    const counts = await this.questionAttemptsRepository.countsByQuestionIds([question.id]);

    return {
      isCorrect,
      selectedPosition: dto.selectedPosition,
      correctPosition: correct.position,
      // As explicações do autor só saem aqui — depois que o aluno respondeu.
      explanations: QuestionsService.toAlternativeFeedback(
        question.alternatives,
        dto.selectedPosition,
      ),
      stats: QuestionsService.toStats(counts.get(question.id)),
      // Presente só quando a questão está no caderno (depois de um erro).
      errorNotebook: notebook,
    };
  }

  /**
   * Dica para destravar a questão sem entregar a resposta. Não grava nada:
   * a dica é ajuda de estudo, não tentativa.
   */
  async hint(userId: string, questionId: string, level?: number): Promise<QuestionHintDto> {
    const question = await this.findAccessible(userId, questionId);
    return this.hintsService.hint(
      {
        stem: question.stem,
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        alternatives: question.alternatives.map((alternative) => ({
          text: alternative.text,
          isCorrect: alternative.isCorrect,
        })),
      },
      level,
    );
  }

  /**
   * Contexto para a LuminIA quando o aluno pede ajuda nesta questão.
   *
   * O cliente manda só o id; enunciado, alternativas e última tentativa são
   * carregados no servidor. Questão inexistente ou de outro workspace não vira
   * contexto (null) — a conversa continua, sem revelar que a questão existe.
   * A alternativa correta só entra no texto depois de uma tentativa registrada.
   */
  async tutorContext(userId: string, questionId: string): Promise<string | null> {
    try {
      const question = await this.findAccessible(userId, questionId);
      const attempt = await this.questionAttemptsRepository.findLatestForUser(
        userId,
        question.id,
      );
      return buildQuestionTutorContext(question, attempt);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  /** Marca (ou desmarca) a questão para revisar. Sem body, alterna o estado. */
  async toggleMarkedForReview(
    userId: string,
    questionId: string,
    marked?: boolean,
  ): Promise<{ markedForReview: boolean }> {
    const question = await this.findAccessible(userId, questionId);
    const current = await this.questionProgressRepository.find(userId, question.id);
    const next = marked ?? !(current?.markedForReview ?? false);
    await this.questionProgressRepository.setMarkedForReview(userId, question.id, next);
    return { markedForReview: next };
  }

  /** Favorita/desfavorita uma questão. Sem body, alterna o estado atual. */
  async toggleFavorite(
    userId: string,
    questionId: string,
    favorite?: boolean,
  ): Promise<{ isFavorite: boolean }> {
    const question = await this.findAccessible(userId, questionId);
    const current = await this.questionProgressRepository.find(userId, question.id);
    const next = favorite ?? !(current?.isFavorite ?? false);
    await this.questionProgressRepository.setFavorite(userId, question.id, next);
    return { isFavorite: next };
  }

  /** Workspace pessoal do usuário, usado pelas rotas que agem sobre ele
   * (ex: importação de questões). */
  getPersonalWorkspace(userId: string): Promise<Workspace> {
    return this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
  }

  /** Resolve o destino declarado pela importação e aplica a mesma autorização
   * usada na criação manual. O banco central nunca recebe conteúdo sem que o
   * usuário tenha QUESTION_MANAGE. */
  async getImportWorkspace(userId: string, target: 'PERSONAL' | 'BANK' = 'PERSONAL'): Promise<Workspace> {
    if (target === 'PERSONAL') return this.getPersonalWorkspace(userId);
    const bank = await this.questionAccessService.getBankWorkspace();
    if (!bank) throw new NotFoundException('Banco central de questões não encontrado.');
    await this.questionAccessService.assertCanManage(userId, bank.id);
    return bank;
  }

  /** Questões semelhantes à informada (mesmo assunto, depois mesma disciplina,
   * depois mesmo exame), sempre excluindo a própria e limitadas aos workspaces
   * acessíveis ao usuário — a mesma fronteira de visibilidade da listagem. */
  async findSimilar(
    userId: string,
    id: string,
    limit?: number,
  ): Promise<SimilarQuestionsDto> {
    const question = await this.findAccessible(userId, id);

    const parsed = Number(limit);
    const effectiveLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(1, Math.floor(parsed)), QuestionsService.MAX_SIMILAR_LIMIT)
      : QuestionsService.DEFAULT_SIMILAR_LIMIT;

    const [personal, bank] = await Promise.all([
      this.questionAccessService.getPersonalWorkspace(userId),
      this.questionAccessService.getBankWorkspace(),
    ]);
    const workspaceIds = unique(
      [personal?.id, bank?.id].filter((wid): wid is string => Boolean(wid)),
    );

    // Pools de candidatos em ordem de proximidade: cada pool soma pontos de
    // base, e características idênticas à questão de referência somam extras.
    const pools: Array<{ where: Prisma.QuestionWhereInput; base: number }> = [];

    if (question.topicId || question.topic) {
      const topicOr: Prisma.QuestionWhereInput[] = [];
      if (question.topicId) topicOr.push({ topicId: question.topicId });
      if (question.topic) {
        topicOr.push({ topic: { equals: question.topic, mode: 'insensitive' } });
      }
      pools.push({ where: { workspaceId: { in: workspaceIds }, OR: topicOr }, base: 10 });
    }

    if (question.subjectId || question.subject) {
      const subjectOr: Prisma.QuestionWhereInput[] = [];
      if (question.subjectId) subjectOr.push({ subjectId: question.subjectId });
      if (question.subject) {
        subjectOr.push({ subject: { equals: question.subject, mode: 'insensitive' } });
      }
      pools.push({ where: { workspaceId: { in: workspaceIds }, OR: subjectOr }, base: 6 });
    }

    if (question.exam) {
      pools.push({
        where: {
          workspaceId: { in: workspaceIds },
          exam: { equals: question.exam, mode: 'insensitive' },
        },
        base: 3,
      });
    }

    const ranked = new Map<string, { question: QuestionWithAlternatives; score: number }>();
    const consider = (candidate: QuestionWithAlternatives, score: number) => {
      if (candidate.id === id) return;
      const previous = ranked.get(candidate.id);
      if (!previous || score > previous.score) {
        ranked.set(candidate.id, { question: candidate, score });
      }
    };

    for (const pool of pools) {
      const candidates = await this.questionsRepository.findMany(pool.where, {
        skip: 0,
        take: 60,
      });
      for (const candidate of candidates) {
        let score = pool.base;
        if (candidate.topicId && candidate.topicId === question.topicId) score += 8;
        if (candidate.subjectId && candidate.subjectId === question.subjectId) score += 3;
        if (candidate.examId && candidate.examId === question.examId) score += 2;
        if (candidate.difficulty === question.difficulty) score += 1;
        consider(candidate, score);
      }
    }

    const items = [...ranked.values()]
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.question.createdAt.getTime() - a.question.createdAt.getTime(),
      )
      .slice(0, effectiveLimit)
      .map((entry) => this.toResponse(entry.question));

    return { items, limit: effectiveLimit };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /** Valida o workspace de destino informado no create (quando presente) e
   * devolve o id dele. Apenas quem pode gerenciar o workspace consegue
   * publicar nele — o que inclui o admin do banco central. */
  private async resolveTargetWorkspaceId(userId: string, workspaceId: string): Promise<string> {
    await this.questionAccessService.assertCanManage(userId, workspaceId);
    return workspaceId;
  }

  /** Busca a questão e garante que o usuário é membro ativo do workspace dela
   * — usuário de outro workspace não enxerga a questão (nem sabe que existe). */
  private async findAccessible(userId: string, id: string): Promise<QuestionWithAlternatives> {
    const question = await this.questionsRepository.findById(id);
    if (!question) {
      throw new NotFoundException('Questão não encontrada.');
    }
    await this.questionAccessService.assertCanUse(userId, question.workspaceId);
    return question;
  }

  /** Resolve a classificação estruturada (subject/topic/exam + FKs) a partir
   * do DTO, usando os valores atuais da questão como fallback em updates. */
  private async resolveClassification(
    input: Partial<CreateQuestionDto>,
    current?: QuestionClassification,
  ): Promise<QuestionClassification> {
    let { subject, topic, exam, subjectId, topicId, examId } = current ?? {
      subject: '',
      topic: '',
      exam: '',
      subjectId: null,
      topicId: null,
      examId: null,
    };

    if (input.subjectId) {
      const record = await this.subjectsRepository.findById(input.subjectId);
      if (!record) throw new BadRequestException('Disciplina não encontrada.');
      subjectId = record.id;
      subject = input.subject?.trim() || record.name;
    } else if (input.subject !== undefined) {
      if (!input.subject.trim()) throw new BadRequestException('Informe a disciplina (subject ou subjectId).');
      const record = await this.subjectsRepository.upsertByName(input.subject.trim());
      subjectId = record.id;
      subject = record.name;
    }

    if (input.topicId) {
      const record = await this.subjectsRepository.findTopicById(input.topicId);
      if (!record || (subjectId && record.subjectId !== subjectId)) {
        throw new BadRequestException('Assunto não encontrado ou incompatível com a disciplina.');
      }
      topicId = record.id;
      topic = input.topic?.trim() || record.name;
    } else if (input.topic !== undefined) {
      if (!input.topic.trim()) {
        topic = '';
        topicId = null;
      } else {
        if (!subjectId) throw new BadRequestException('Informe a disciplina antes do assunto.');
        const record = await this.subjectsRepository.upsertTopic(subjectId, input.topic.trim());
        topicId = record.id;
        topic = record.name;
      }
    }

    if (input.examId) {
      const record = await this.examsRepository.findById(input.examId);
      if (!record) throw new BadRequestException('Prova não encontrada.');
      examId = record.id;
      exam = input.exam?.trim() || record.name;
    } else if (input.exam !== undefined) {
      if (!input.exam.trim()) {
        exam = '';
        examId = null;
      } else {
        const record = await this.examsRepository.findOrCreate({
          name: input.exam.trim(),
          year: input.year ?? null,
        });
        examId = record.id;
        exam = record.name;
      }
    }

    if (!subject) {
      throw new BadRequestException('Informe a disciplina (subject ou subjectId).');
    }

    return { subject, topic, exam, subjectId, topicId, examId };
  }

  /** Regras de negócio das alternativas: pelo menos 2, no máximo MAX, textos
   * não vazios e exatamente uma correta. */
  private validateAlternatives(
    alternatives: { text: string; isCorrect: boolean; explanation?: string | null }[],
  ): void {
    const correctCount = alternatives.filter((alternative) => alternative.isCorrect).length;
    if (correctCount !== 1) {
      throw new BadRequestException(
        'É obrigatório marcar exatamente uma alternativa como correta.',
      );
    }
    if (alternatives.some((alternative) => !alternative.text.trim())) {
      throw new BadRequestException('Todas as alternativas precisam de texto.');
    }
  }

  /** Converte alternativas do DTO para o formato persistido, normalizando o
   * texto e atribuindo a posição (1 = A, 2 = B, ...). A explicação do
   * distrator é opcional e normalizada para null quando não vier. */
  private normalizeAlternatives(
    alternatives: { text: string; isCorrect: boolean; explanation?: string | null }[],
  ): { text: string; position: number; isCorrect: boolean; explanation: string | null }[] {
    return alternatives.map((alternative, index) => ({
      text: alternative.text.trim(),
      position: index + 1,
      isCorrect: alternative.isCorrect,
      explanation: alternative.explanation?.trim() || null,
    }));
  }

  private contains(value: string): Prisma.StringFilter {
    return { contains: value, mode: 'insensitive' };
  }

  /** Converte contagens agregadas em estatísticas públicas; null sem tentativas. */
  private static toStats(counts: AttemptCounts | undefined): QuestionStatsDto | null {
    if (!counts || counts.attempts === 0) return null;
    return {
      attempts: counts.attempts,
      correct: counts.correct,
      accuracyPercent: Math.round((counts.correct / counts.attempts) * 100),
    };
  }

  /** Progresso do aluno em uma questão, para a interface saber o estado real
   * (favorita, marcada para revisão, já respondida). null quando o aluno ainda
   * não interagiu com a questão — aí a interface trata como "nada marcado". */
  private static toUserProgress(
    progress: UserQuestionState | null | undefined,
  ): QuestionUserProgressDto | null {
    if (!progress) return null;
    return {
      attempts: progress.attempts,
      correctAttempts: progress.correctAttempts,
      incorrectAttempts: progress.incorrectAttempts,
      lastAttemptAt: progress.lastAttemptAt,
      isFavorite: progress.isFavorite,
      markedForReview: progress.markedForReview,
    };
  }

  /** Explicações por alternativa para o resultado da tentativa. Só entram as
   * alternativas que o AUTOR explicou (a lista vem vazia quando a questão não
   * detalha os distratores) e, como o nome diz, só depois de responder. */
  private static toAlternativeFeedback(
    alternatives: { text: string; position: number; isCorrect: boolean; explanation?: string | null }[],
    selectedPosition: number,
  ): AlternativeFeedbackDto[] {
    return alternatives
      .filter((alternative) => Boolean(alternative.explanation?.trim()))
      .map((alternative) => ({
        position: alternative.position,
        text: alternative.text,
        isCorrect: alternative.isCorrect,
        selected: alternative.position === selectedPosition,
        explanation: (alternative.explanation ?? '').trim(),
      }));
  }

  private resolveSort(sort: QuestionSort | undefined): Prisma.QuestionOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'year_desc':
        return [{ year: 'desc' }, { createdAt: 'desc' }];
      case 'year_asc':
        return [{ year: 'asc' }, { createdAt: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  /** Visão pública: esconde qual alternativa é a correta. */
  private toResponse(
    question: QuestionWithAlternatives,
    canManage = false,
    stats: QuestionStatsDto | null = null,
  ): QuestionResponseDto {
    return {
      id: question.id,
      sourceType: question.sourceType,
      sourceName: question.sourceName,
      sourceId: question.sourceId,
      subject: question.subject,
      topic: question.topic,
      subjectId: question.subjectId,
      topicId: question.topicId,
      examId: question.examId,
      difficulty: question.difficulty,
      exam: question.exam,
      year: question.year,
      examNumber: question.examNumber,
      stem: question.stem,
      explanation: question.explanation,
      imageUrl: question.imageUrl,
      sourcePdf: sourcePdfFromMetadata(question.metadata),
      canManage,
      stats,
      alternatives: question.alternatives.map((alternative) => ({
        id: alternative.id,
        text: alternative.text,
        position: alternative.position,
      })),
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  /** Visão de autor: inclui isCorrect e a explicação de cada alternativa (para
   * criar/editar). A visão de responder nunca leva `explanation`: ela revelaria
   * quais alternativas estão erradas — e, portanto, o gabarito. */
  private toAuthorResponse(
    question: QuestionWithAlternatives,
    canManage = true,
    stats: QuestionStatsDto | null = null,
  ): QuestionResponseDto {
    return {
      ...this.toResponse(question, canManage, stats),
      alternatives: question.alternatives.map((alternative) => ({
        id: alternative.id,
        text: alternative.text,
        position: alternative.position,
        isCorrect: alternative.isCorrect,
        explanation: alternative.explanation,
      })),
    };
  }
}

function sourcePdfFromMetadata(metadata: unknown): { url: string; page: number } | null {
  if (!metadata || typeof metadata !== 'object' || !('sourcePdf' in metadata)) return null;
  const pdf = metadata.sourcePdf;
  if (!pdf || typeof pdf !== 'object' || !('url' in pdf) || !('page' in pdf)) return null;
  return typeof pdf.url === 'string' && pdf.url.startsWith('https://download.inep.gov.br/') && Number.isInteger(pdf.page) && (pdf.page as number) > 0
    ? { url: pdf.url, page: pdf.page as number } : null;
}

/** Remove valores duplicados, preservando a ordem. */
function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
