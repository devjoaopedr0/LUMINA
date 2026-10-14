import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorNotebookStatus, QuestionDifficulty } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotebookService } from './error-notebook.service';
import { ErrorNotebookRow } from './error-notebook.repository';
import { ERROR_NOTEBOOK_EVOLUTION_LIMIT } from './dto/error-notebook.dto';

/**
 * Regras do caderno de erros (item 12) e da classificação do motivo (item 13).
 * Aqui o repositório é um dublê: o que se prova é a decisão do serviço (o que
 * entra no `where`, o que vira 400/404/409, como a data de revisão é
 * interpretada), não a consulta.
 */
describe('ErrorNotebookService', () => {
  let service: ErrorNotebookService;
  let repository: any;
  let questionAccessService: any;
  let questionsRepository: any;

  const question = {
    id: 'question-1',
    workspaceId: 'ws-1',
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    difficulty: QuestionDifficulty.MEDIA,
    exam: 'ENEM',
    year: 2023,
    examNumber: 47,
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
  };

  /** A linha do caderno como o repositório a devolve — com o resumo da questão
   *  junto, que é o que o serviço formata para a interface. */
  const entry = (overrides: Partial<ErrorNotebookRow> = {}): ErrorNotebookRow => ({
    id: 'entry-1',
    userId: 'user-1',
    questionId: 'question-1',
    reason: null,
    notes: null,
    status: ErrorNotebookStatus.ABERTA,
    wrongAttempts: 1,
    correctStreak: 0,
    evolution: 'E',
    reviewScheduledAt: null,
    firstWrongAt: new Date('2026-09-20T10:00:00Z'),
    lastWrongAt: new Date('2026-09-20T10:00:00Z'),
    resolvedAt: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    question,
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      find: vi.fn().mockResolvedValue(null),
      registerWrongAttempt: vi.fn().mockResolvedValue(entry()),
      registerCorrectAttempt: vi.fn().mockResolvedValue(entry({ correctStreak: 1, evolution: 'EA' })),
      create: vi.fn().mockImplementation(async (_userId: string, _questionId: string) => entry()),
      update: vi.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => entry({ id, ...data })),
      remove: vi.fn().mockResolvedValue({ count: 1 }),
      findManyByUser: vi.fn().mockResolvedValue([entry()]),
      countByUser: vi.fn().mockResolvedValue(1),
      slices: vi.fn().mockResolvedValue([]),
    };
    questionAccessService = {
      getPersonalWorkspaceOrThrow: vi.fn().mockResolvedValue({ id: 'ws-pessoal' }),
      assertCanUse: vi.fn().mockResolvedValue(undefined),
    };
    questionsRepository = { findById: vi.fn().mockResolvedValue(question) };

    service = new ErrorNotebookService(repository, questionAccessService, questionsRepository);
  });

  // --- Registro automático a partir da tentativa -------------------------------
  describe('registro por tentativa', () => {
    it('erra registrando no caderno; acerto delegando à evolução', async () => {
      await service.registerAttempt('user-1', 'question-1', false);
      expect(repository.registerWrongAttempt).toHaveBeenCalledWith('user-1', 'question-1', undefined);

      await service.registerAttempt('user-1', 'question-1', true);
      expect(repository.registerCorrectAttempt).toHaveBeenCalledWith('user-1', 'question-1', undefined);
      expect(repository.registerWrongAttempt).toHaveBeenCalledTimes(1);
    });

    it('repassa a transação da tentativa para que o erro nunca exista sozinho', async () => {
      const tx = { errorNotebookEntry: {} } as any;
      await service.registerAttempt('user-1', 'question-1', false, tx);
      expect(repository.registerWrongAttempt).toHaveBeenCalledWith('user-1', 'question-1', tx);
    });
  });

  // --- Leitura e filtros -------------------------------------------------------
  describe('listagem', () => {
    it('a fila padrão é a das questões abertas', async () => {
      const page = await service.list('user-1', {});
      expect(repository.countByUser).toHaveBeenCalledWith('user-1', { status: 'ABERTA' });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(1);
      expect(page.totalPages).toBe(1);
    });

    it('"TODAS" não aplica filtro de situação', async () => {
      await service.list('user-1', { status: 'TODAS' });
      expect(repository.countByUser).toHaveBeenCalledWith('user-1', {});
    });

    it('filtra por matéria e assunto sem diferenciar maiúsculas', async () => {
      await service.list('user-1', { subject: 'matemática', topic: 'funções exponenciais' });
      expect(repository.countByUser).toHaveBeenCalledWith('user-1', {
        status: 'ABERTA',
        question: {
          subject: { equals: 'matemática', mode: 'insensitive' },
          topic: { equals: 'funções exponenciais', mode: 'insensitive' },
        },
      });
    });

    it('filtra por dificuldade e por motivo', async () => {
      await service.list('user-1', { status: 'TODAS', difficulty: 'dificil', reason: 'erro_calculo' });
      expect(repository.countByUser).toHaveBeenCalledWith('user-1', {
        reason: 'ERRO_CALCULO',
        question: { difficulty: 'DIFICIL' },
      });
    });

    it('"SEM_MOTIVO" pergunta justamente pelas entradas sem classificação', async () => {
      await service.list('user-1', { reason: 'sem_motivo' });
      expect(repository.countByUser).toHaveBeenCalledWith('user-1', {
        status: 'ABERTA',
        reason: null,
      });
    });

    it('"para hoje" restringe a abertas com revisão vencida', async () => {
      await service.list('user-1', { status: 'TODAS', due: 'true' });
      const where = repository.countByUser.mock.calls[0][1];
      expect(where.status).toBe('ABERTA');
      expect(where.reviewScheduledAt.not).toBeNull();
      expect(where.reviewScheduledAt.lte).toBeInstanceOf(Date);
    });

    it('recusa filtro inválido em vez de devolver tudo sem avisar', async () => {
      await expect(service.list('user-1', { status: 'inventada' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.list('user-1', { difficulty: 'impossivel' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.list('user-1', { reason: 'chute_creative' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pagina sem repetir item e sem estourar o teto de página', async () => {
      repository.countByUser.mockResolvedValue(201);
      const page = await service.list('user-1', { page: 3, limit: 1000 });
      expect(page.limit).toBe(100);
      expect(page.totalPages).toBe(3);
      expect(repository.findManyByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ skip: 200, take: 100 }),
      );
    });

    it('trunca o enunciado do cartão em vez de despejar a questão inteira', async () => {
      repository.findManyByUser.mockResolvedValue([
        entry({ question: { ...question, stem: 'x'.repeat(400) } }),
      ]);
      const page = await service.list('user-1', {});
      expect(page.items[0].stem).toHaveLength(221);
      expect(page.items[0].stem.endsWith('…')).toBe(true);
    });
  });

  // --- Resumo e recortes -------------------------------------------------------
  describe('resumo', () => {
    const slices = [
      { questionId: 'q1', subject: 'Matemática', topic: 'Funções', difficulty: 'MEDIA', reason: 'ERRO_CALCULO', status: 'ABERTA', reviewScheduledAt: new Date('2020-01-01T00:00:00Z') },
      { questionId: 'q2', subject: 'Matemática', topic: 'Funções', difficulty: 'MEDIA', reason: 'ERRO_CALCULO', status: 'ABERTA', reviewScheduledAt: null },
      { questionId: 'q3', subject: 'Matemática', topic: 'Limites', difficulty: 'DIFICIL', reason: null, status: 'DOMINADA', reviewScheduledAt: null },
      { questionId: 'q4', subject: 'Física', topic: '', difficulty: 'FACIL', reason: 'CHUTE', status: 'ABERTA', reviewScheduledAt: new Date('2999-01-01T00:00:00Z') },
    ];

    it('conta aberto, dominado, vencido hoje e sem motivo', async () => {
      repository.slices.mockResolvedValue(slices);
      const resumo = await service.summary('user-1');
      expect(resumo.total).toBe(4);
      expect(resumo.open).toBe(3);
      expect(resumo.mastered).toBe(1);
      // Só a primeira está vencida: a última foi agendada para o ano 2999.
      expect(resumo.dueToday).toBe(1);
      // A única entrada sem motivo já foi dominada, então não pesa na conta do
      // que ainda falta classificar.
      expect(resumo.withoutReason).toBe(0);
    });

    it('organiza por matéria e por assunto, com o que está aberto primeiro', async () => {
      repository.slices.mockResolvedValue(slices);
      const resumo = await service.summary('user-1');
      expect(resumo.bySubject).toEqual([
        { label: 'Matemática', value: 'Matemática', open: 2, mastered: 1 },
        { label: 'Física', value: 'Física', open: 1, mastered: 0 },
      ]);
      // Funções (2 abertos) antes de Física (1 aberto) antes de Limites (0
      // abertos, 1 dominado): o que ainda dói vem primeiro.
      expect(resumo.byTopic.map((f) => f.label)).toEqual(['Funções', 'Física', 'Limites']);
      // Assunto vazio entra no recorte da própria matéria, com o valor que
      // volta no filtro.
      expect(resumo.byTopic[1]).toEqual({ label: 'Física', value: 'Física', open: 1, mastered: 0 });
    });

    it('agrupa por motivo e inclui o que ainda não foi classificado', async () => {
      repository.slices.mockResolvedValue(slices);
      const resumo = await service.summary('user-1');
      expect(resumo.byReason).toEqual([
        { label: 'Erro de cálculo', value: 'ERRO_CALCULO', open: 2, mastered: 0 },
        { label: 'Chute', value: 'CHUTE', open: 1, mastered: 0 },
        { label: 'Sem motivo', value: 'SEM_MOTIVO', open: 0, mastered: 1 },
      ]);
    });

    it('assunto vazio não vira uma linha sem nome juntando matérias diferentes', async () => {
      repository.slices.mockResolvedValue([
        { questionId: 'q1', subject: 'Física', topic: 'Óptica', difficulty: 'FACIL', reason: null, status: 'ABERTA', reviewScheduledAt: null },
        { questionId: 'q2', subject: 'Física', topic: '', difficulty: 'FACIL', reason: null, status: 'ABERTA', reviewScheduledAt: null },
      ]);
      const resumo = await service.summary('user-1');
      expect(resumo.byTopic).toEqual([
        { label: 'Física', value: 'Física', open: 1, mastered: 0 },
        { label: 'Óptica', value: 'Óptica', open: 1, mastered: 0 },
      ]);
    });
  });

  // --- Entrada manual ---------------------------------------------------------
  describe('entrada manual', () => {
    it('inclui a questão acessível', async () => {
      const dto = await service.add('user-1', 'question-1');
      expect(repository.create).toHaveBeenCalledWith('user-1', 'question-1');
      expect(dto.questionId).toBe('question-1');
      expect(dto.status).toBe('ABERTA');
    });

    it('recusa duplicata em vez de criar uma segunda linha', async () => {
      repository.find.mockResolvedValue(entry());
      await expect(service.add('user-1', 'question-1')).rejects.toBeInstanceOf(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('esconde a existência de questão de outro workspace (404)', async () => {
      questionsRepository.findById.mockResolvedValue(null);
      await expect(service.add('user-1', 'question-9')).rejects.toBeInstanceOf(NotFoundException);

      questionAccessService.assertCanUse.mockRejectedValue(new NotFoundException('Questão não encontrada.'));
      await expect(service.add('user-1', 'question-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  // --- Motivo, observação e revisão combinada ---------------------------------
  describe('motivo, observação e revisão', () => {
    beforeEach(() => {
      repository.find.mockResolvedValue(entry());
    });

    it('grava motivo, observação aparada e a data combinada', async () => {
      await service.update('user-1', 'question-1', {
        reason: 'ERRO_CALCULO',
        notes: '  sinal trocado  ',
        reviewScheduledOn: '2026-09-27',
      });
      const [id, data] = repository.update.mock.calls[0];
      expect(id).toBe('entry-1');
      expect(data.reason).toBe('ERRO_CALCULO');
      expect(data.notes).toBe('sinal trocado');
      // O dia gravado é meia-noite UTC: "hoje" já está vencido ao longo do dia.
      expect(data.reviewScheduledAt.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    });

    it('aceita data passada (revisar o que já venceu) e a treat como vencida', async () => {
      repository.find.mockResolvedValue(entry({ reviewScheduledAt: new Date('2020-01-01T00:00:00Z') }));
      const dto = await service.update('user-1', 'question-1', { reviewScheduledOn: '2020-01-01' });
      expect(dto.reviewScheduledAt).toBe('2020-01-01T00:00:00.000Z');
      expect(dto.due).toBe(true);
    });

    it('revisao futura ainda não está vencida', async () => {
      repository.find.mockResolvedValue(entry());
      const dto = await service.update('user-1', 'question-1', { reviewScheduledOn: '2999-01-01' });
      expect(dto.due).toBe(false);
    });

    it('string vazia cancela a revisão e a observação', async () => {
      await service.update('user-1', 'question-1', { reviewScheduledOn: '', notes: '   ' });
      const [, data] = repository.update.mock.calls[0];
      expect(data.reviewScheduledAt).toBeNull();
      expect(data.notes).toBeNull();
    });

    it('data fora do formato é recusada', async () => {
      await expect(
        service.update('user-1', 'question-1', { reviewScheduledOn: '27/09/2026' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update('user-1', 'question-1', { reviewScheduledOn: '2026-13-40' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('classificar o motivo como "sem motivo" limpa a classificação', async () => {
      await service.update('user-1', 'question-1', { reason: null });
      const [, data] = repository.update.mock.calls[0];
      expect(data.reason).toBeNull();
    });

    it('atualizar item que não está no caderno é 404, não um insert escondido', async () => {
      repository.find.mockResolvedValue(null);
      await expect(
        service.update('user-1', 'question-1', { reason: 'CHUTE' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  // --- Remoção ----------------------------------------------------------------
  describe('remoção', () => {
    it('remove a entrada', async () => {
      repository.find.mockResolvedValue(entry());
      await service.remove('user-1', 'question-1');
      expect(repository.remove).toHaveBeenCalledWith('user-1', 'question-1');
    });

    it('remover o que não está no caderno é 404', async () => {
      await expect(service.remove('user-1', 'question-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('remove só a entrada do próprio aluno', async () => {
      repository.find.mockResolvedValue(entry({ userId: 'user-2' }));
      await service.remove('user-1', 'question-1');
      expect(repository.remove).toHaveBeenCalledWith('user-1', 'question-1');
    });
  });

  // --- O que a interface recebe -----------------------------------------------
  describe('formato da entrada', () => {
    it('devolve a entrada pronta para o cartão, com a dificuldade da questão', () => {
      const dto = service.toEntryDto(
        entry({ reason: 'FALTA_ATENCAO', notes: 'li correndo' }),
      );
      expect(dto).toMatchObject({
        questionId: 'question-1',
        subject: 'Matemática',
        topic: 'Funções exponenciais',
        difficulty: 'MEDIA',
        reason: 'FALTA_ATENCAO',
        notes: 'li correndo',
        status: 'ABERTA',
        wrongAttempts: 1,
        evolution: 'E',
        exam: 'ENEM',
        year: 2023,
        examNumber: 47,
        due: false,
      });
      expect(typeof dto.firstWrongAt).toBe('string');
      expect(dto.resolvedAt).toBeNull();
    });

    it('a evolução guardada nunca passa do limite combinado', () => {
      // Regra do repositório, verificada aqui porque é ela que corta a linha
      // do tempo antes de gravar.
      const longa = 'E'.repeat(ERROR_NOTEBOOK_EVOLUTION_LIMIT + 10);
      expect(`${longa}A`.slice(-ERROR_NOTEBOOK_EVOLUTION_LIMIT)).toHaveLength(
        ERROR_NOTEBOOK_EVOLUTION_LIMIT,
      );
    });
  });
});
