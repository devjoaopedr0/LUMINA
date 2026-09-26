import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionDifficulty } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: any;
  let questionsRepository: any;
  let questionAttemptsRepository: any;
  let questionAccessService: any;
  let questionProgressRepository: any;
  let subjectsRepository: any;
  let examsRepository: any;
  let textSearchRepository: any;

  const baseWorkspace = { id: 'ws-1', name: 'Workspace de Maria', type: 'PERSONAL' };
  const baseQuestion = {
    id: 'question-1',
    workspaceId: 'ws-1',
    sourceType: 'OFFICIAL',
    sourceName: 'Lumina',
    sourceId: null,
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    subjectId: 'subject-1',
    topicId: 'topic-1',
    examId: 'exam-1',
    difficulty: QuestionDifficulty.MEDIA,
    exam: 'ENEM',
    year: 2023,
    examNumber: 47,
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    explanation: null,
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const alternatives = [
    { id: 'alt-1', questionId: 'question-1', text: '4', position: 1, isCorrect: false },
    { id: 'alt-2', questionId: 'question-1', text: '6', position: 2, isCorrect: false },
    { id: 'alt-3', questionId: 'question-1', text: '8', position: 3, isCorrect: true },
    { id: 'alt-4', questionId: 'question-1', text: '10', position: 4, isCorrect: false },
  ];

  beforeEach(() => {
    prisma = { $transaction: vi.fn((cb: any) => cb(prisma)), teacherProfile: { findUnique: vi.fn().mockResolvedValue(null) } };
    questionsRepository = {
      findById: vi.fn(),
      create: vi.fn(),
      updateFields: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      deleteAlternatives: vi.fn(),
      createAlternatives: vi.fn(),
    };
    questionAttemptsRepository = {
      create: vi.fn(),
      countsByQuestionIds: vi.fn().mockResolvedValue(new Map()),
    };
    questionAccessService = {
      getPersonalWorkspaceOrThrow: vi.fn().mockResolvedValue(baseWorkspace),
      getPersonalWorkspace: vi.fn().mockResolvedValue(baseWorkspace),
      getBankWorkspace: vi.fn().mockResolvedValue(null),
      isBankWorkspace: vi.fn().mockResolvedValue(false),
      hasManagePermission: vi.fn().mockResolvedValue(false),
      assertCanUse: vi.fn(async (_userId: string, workspaceId: string) => {
        if (workspaceId !== 'ws-1') throw new NotFoundException('Questão não encontrada.');
      }),
      assertCanManage: vi.fn().mockResolvedValue(undefined),
    };
    questionProgressRepository = {
      recordAttempt: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue(null),
      setFavorite: vi.fn().mockResolvedValue({}),
    };
    subjectsRepository = {
      findById: vi.fn(),
      upsertByName: vi.fn(),
      findTopicById: vi.fn(),
      upsertTopic: vi.fn(),
    };
    examsRepository = {
      findById: vi.fn(),
      findOrCreate: vi.fn(),
    };
    textSearchRepository = {
      findIdsMatching: vi.fn().mockResolvedValue([]),
    };

    service = new QuestionsService(
      prisma,
      questionsRepository,
      questionAttemptsRepository,
      questionAccessService,
      questionProgressRepository,
      subjectsRepository,
      examsRepository,
      textSearchRepository,
    );
  });

  const createDto = {
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    difficulty: QuestionDifficulty.MEDIA,
    exam: 'ENEM',
    year: 2023,
    examNumber: 47,
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    alternatives: [
      { text: '4', isCorrect: false },
      { text: '6', isCorrect: false },
      { text: '8', isCorrect: true },
      { text: '10', isCorrect: false },
    ],
  };

  function mockClassification() {
    subjectsRepository.upsertByName.mockResolvedValue({ id: 'subject-1', name: 'Matemática' });
    subjectsRepository.upsertTopic.mockResolvedValue({
      id: 'topic-1',
      subjectId: 'subject-1',
      name: 'Funções exponenciais',
    });
    examsRepository.findOrCreate.mockResolvedValue({ id: 'exam-1', name: 'ENEM' });
  }

  describe('create', () => {
    it('limita a matéria de professor e identifica conteúdo autoral', async () => {
      mockClassification();
      prisma.teacherProfile.findUnique.mockResolvedValue({ subject: 'Física' });
      await expect(service.create('user-1', createDto)).rejects.toBeInstanceOf(BadRequestException);
      expect(questionsRepository.create).not.toHaveBeenCalled();
      prisma.teacherProfile.findUnique.mockResolvedValue({ subject: 'Matemática' });
      questionsRepository.create.mockResolvedValue({ ...baseQuestion, alternatives });
      await service.create('user-1', createDto);
      expect(questionsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'PARTNER', sourceName: 'Professor da Lumina', subject: 'Matemática' }));
    });
    it('cria a questão com alternativas normalizadas e retorna a visão de autor', async () => {
      mockClassification();
      questionsRepository.create.mockImplementation(
        async ({ workspaceId, alternatives: alts }: any) => ({
          ...baseQuestion,
          workspaceId,
          alternatives: alts.map((a: any, i: number) => ({ id: `alt-${i + 1}`, ...a })),
        }),
      );

      const result = await service.create('user-1', createDto);

      expect(questionAccessService.getPersonalWorkspaceOrThrow).toHaveBeenCalledWith('user-1');
      expect(questionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          subjectId: 'subject-1',
          topicId: 'topic-1',
          examId: 'exam-1',
          exam: 'ENEM',
          alternatives: [
            { text: '4', position: 1, isCorrect: false },
            { text: '6', position: 2, isCorrect: false },
            { text: '8', position: 3, isCorrect: true },
            { text: '10', position: 4, isCorrect: false },
          ],
        }),
      );
      // Visão de autor expõe isCorrect.
      expect(result.alternatives[2].isCorrect).toBe(true);
    });

    it('lança BadRequestException quando nenhuma alternativa é marcada como correta', async () => {
      mockClassification();

      await expect(
        service.create('user-1', {
          ...createDto,
          alternatives: createDto.alternatives.map((a) => ({ ...a, isCorrect: false })),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(questionsRepository.create).not.toHaveBeenCalled();
    });

    it('lança BadRequestException quando mais de uma alternativa é marcada como correta', async () => {
      mockClassification();

      await expect(
        service.create('user-1', {
          ...createDto,
          alternatives: createDto.alternatives.map((a, i) => ({ ...a, isCorrect: i < 2 })),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o usuário não tem workspace pessoal', async () => {
      questionAccessService.getPersonalWorkspaceOrThrow.mockRejectedValue(
        new NotFoundException('Workspace pessoal não encontrado para este usuário.'),
      );

      await expect(service.create('user-1', createDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria no workspace informado quando o usuário tem permissão de gerenciamento', async () => {
      mockClassification();
      questionAccessService.assertCanManage.mockResolvedValue(undefined);
      questionsRepository.create.mockImplementation(
        async ({ workspaceId, alternatives: alts }: any) => ({
          ...baseQuestion,
          workspaceId,
          alternatives: alts.map((a: any, i: number) => ({ id: `alt-${i + 1}`, ...a })),
        }),
      );

      const result = await service.create('user-1', {
        ...createDto,
        workspaceId: 'ws-banco',
      });

      expect(questionAccessService.assertCanManage).toHaveBeenCalledWith('user-1', 'ws-banco');
      expect(questionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-banco' }),
      );
      expect(result.canManage).toBe(true);
    });

    it('lança ForbiddenException ao tentar criar no banco sem permissão de gerenciamento', async () => {
      questionAccessService.assertCanManage.mockRejectedValue(
        new ForbiddenException('Você não tem permissão para gerenciar questões do banco de questões.'),
      );

      await expect(
        service.create('user-1', { ...createDto, workspaceId: 'ws-banco' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(questionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('aplica filtros combinados e paginação sobre o workspace pessoal + banco, mascarando a correta', async () => {
      questionsRepository.count.mockResolvedValue(1);
      questionsRepository.findMany.mockResolvedValue([{ ...baseQuestion, alternatives }]);

      const result = await service.findAll('user-1', {
        subject: 'matemática',
        difficulty: QuestionDifficulty.MEDIA,
        exam: 'ENEM',
        page: 1,
        limit: 20,
      });

      expect(questionAccessService.getPersonalWorkspace).toHaveBeenCalledWith('user-1');
      expect(questionAccessService.getBankWorkspace).toHaveBeenCalled();
      expect(questionsRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: { in: ['ws-1'] },
          subject: { contains: 'matemática', mode: 'insensitive' },
          difficulty: QuestionDifficulty.MEDIA,
          exam: { contains: 'ENEM', mode: 'insensitive' },
        }),
      );
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      // Visão pública nunca expõe isCorrect.
      expect(result.items[0].alternatives[2].isCorrect).toBeUndefined();
      // Questão do workspace pessoal: o usuário pode gerenciar.
      expect(result.items[0].canManage).toBe(true);
      // Sem banco semeados, o usuário não gerencia o banco.
      expect(result.canManageBank).toBe(false);
    });

    it('marca canManage=false para questões do banco central quando o usuário não é admin', async () => {
      questionAccessService.getPersonalWorkspace.mockResolvedValue(baseWorkspace);
      questionAccessService.getBankWorkspace.mockResolvedValue({ id: 'ws-banco', type: 'INSTITUTION' });
      questionAccessService.hasManagePermission.mockResolvedValue(false);
      questionsRepository.count.mockResolvedValue(1);
      questionsRepository.findMany.mockResolvedValue([
        { ...baseQuestion, id: 'question-banco', workspaceId: 'ws-banco', alternatives },
      ]);

      const result = await service.findAll('user-1', { page: 1, limit: 20 });

      expect(questionsRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: { in: ['ws-1', 'ws-banco'] } }),
      );
      expect(questionAccessService.hasManagePermission).toHaveBeenCalledWith('user-1', 'ws-banco');
      expect(result.items[0].canManage).toBe(false);
      expect(result.canManageBank).toBe(false);
    });

    it('marca canManage=true para questões do banco central quando o usuário é admin', async () => {
      questionAccessService.getPersonalWorkspace.mockResolvedValue(baseWorkspace);
      questionAccessService.getBankWorkspace.mockResolvedValue({ id: 'ws-banco', type: 'INSTITUTION' });
      questionAccessService.hasManagePermission.mockResolvedValue(true);
      questionsRepository.count.mockResolvedValue(1);
      questionsRepository.findMany.mockResolvedValue([
        { ...baseQuestion, id: 'question-banco', workspaceId: 'ws-banco', alternatives },
      ]);

      const result = await service.findAll('user-1', { page: 1, limit: 20 });

      expect(result.items[0].canManage).toBe(true);
      expect(result.canManageBank).toBe(true);
    });
  });

  describe('getImportWorkspace', () => {
    it('usa o workspace pessoal como destino padrão', async () => {
      await expect(service.getImportWorkspace('user-1')).resolves.toEqual(baseWorkspace);
    });

    it('exige permissão de gerenciamento antes de importar no banco central', async () => {
      const bank = { id: 'ws-banco', name: 'Banco Lumina', type: 'INSTITUTION' };
      questionAccessService.getBankWorkspace.mockResolvedValue(bank);

      await expect(service.getImportWorkspace('user-1', 'BANK')).resolves.toEqual(bank);
      expect(questionAccessService.assertCanManage).toHaveBeenCalledWith('user-1', 'ws-banco');
    });
  });

  describe('findById', () => {
    it('retorna visão pública (sem isCorrect) por padrão', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      const result = await service.findById('user-1', 'question-1', false);

      expect(result.alternatives[2].isCorrect).toBeUndefined();
      // Questão do workspace pessoal: o usuário pode gerenciar.
      expect(result.canManage).toBe(true);
    });

    it('retorna visão de autor (com isCorrect) quando includeAnswer=true', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      const result = await service.findById('user-1', 'question-1', true);

      expect(questionAccessService.assertCanManage).toHaveBeenCalledWith('user-1', 'ws-1');
      expect(result.alternatives[2].isCorrect).toBe(true);
    });

    it('lança ForbiddenException quando includeAnswer=true e o usuário não pode gerenciar', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionAccessService.assertCanManage.mockRejectedValue(
        new ForbiddenException('Você não tem permissão para gerenciar questões do banco de questões.'),
      );

      await expect(service.findById('user-1', 'question-1', true)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lança NotFoundException quando a questão não existe', async () => {
      questionsRepository.findById.mockResolvedValue(null);

      await expect(service.findById('user-1', 'question-1', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando a questão pertence a outro workspace', async () => {
      questionsRepository.findById.mockResolvedValue({
        ...baseQuestion,
        workspaceId: 'outro-workspace',
      });

      await expect(service.findById('user-1', 'question-1', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('atualiza campos e substitui alternativas na mesma transação quando enviadas', async () => {
      subjectsRepository.upsertByName.mockResolvedValue({ id: 'subject-2', name: 'Matemática II' });
      questionsRepository.findById
        .mockResolvedValueOnce({ ...baseQuestion, alternatives })
        .mockResolvedValueOnce({
          ...baseQuestion,
          subject: 'Matemática II',
          alternatives: [
            { id: 'new-1', text: '4', position: 1, isCorrect: false },
            { id: 'new-2', text: '9', position: 2, isCorrect: true },
          ],
        });

      const result = await service.update('user-1', 'question-1', {
        subject: 'Matemática II',
        alternatives: [
          { text: '4', isCorrect: false },
          { text: '9', isCorrect: true },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(questionsRepository.deleteAlternatives).toHaveBeenCalledWith('question-1', prisma);
      expect(questionsRepository.createAlternatives).toHaveBeenCalledWith(
        'question-1',
        [
          { text: '4', position: 1, isCorrect: false },
          { text: '9', position: 2, isCorrect: true },
        ],
        prisma,
      );
      expect(result.subject).toBe('Matemática II');
    });

    it('não abre transação quando não há novas alternativas', async () => {
      subjectsRepository.upsertByName.mockResolvedValue({ id: 'subject-2', name: 'Matemática II' });
      questionsRepository.findById
        .mockResolvedValueOnce({ ...baseQuestion, alternatives })
        .mockResolvedValueOnce({ ...baseQuestion, subject: 'Matemática II', alternatives });
      questionsRepository.updateFields.mockResolvedValue({ ...baseQuestion, alternatives });

      await service.update('user-1', 'question-1', { subject: 'Matemática II' });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(questionsRepository.updateFields).toHaveBeenCalledWith(
        'question-1',
        expect.objectContaining({ subject: 'Matemática II' }),
      );
    });
  });

  describe('remove', () => {
    it('exclui a questão quando o usuário é o dono', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      await service.remove('user-1', 'question-1');

      expect(questionsRepository.delete).toHaveBeenCalledWith('question-1');
    });

    it('lança NotFoundException quando a questão não pertence ao usuário', async () => {
      questionsRepository.findById.mockResolvedValue({
        ...baseQuestion,
        workspaceId: 'outro-workspace',
      });

      await expect(service.remove('user-1', 'question-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(questionsRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    it('registra a tentativa e retorna acerto quando a posição escolhida é a correta', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      const result = await service.answer('user-1', 'question-1', { selectedPosition: 3 });

      expect(result).toEqual({
        isCorrect: true,
        selectedPosition: 3,
        correctPosition: 3,
        stats: null,
      });
      expect(questionAttemptsRepository.create).toHaveBeenCalledWith(
        {
          questionId: 'question-1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          selectedPosition: 3,
          isCorrect: true,
          timeSpent: null,
        },
        prisma,
      );
      expect(questionProgressRepository.recordAttempt).toHaveBeenCalledWith(
        'user-1',
        'question-1',
        true,
        prisma,
      );
    });

    it('retorna erro quando a posição escolhida não é a correta', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      const result = await service.answer('user-1', 'question-1', { selectedPosition: 1 });

      expect(result.isCorrect).toBe(false);
      expect(result.correctPosition).toBe(3);
      expect(questionAttemptsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ selectedPosition: 1, isCorrect: false, timeSpent: null }),
        prisma,
      );
    });

    it('lança BadRequestException para posição inexistente na questão', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });

      await expect(
        service.answer('user-1', 'question-1', { selectedPosition: 9 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(questionAttemptsRepository.create).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando a questão não existe', async () => {
      questionsRepository.findById.mockResolvedValue(null);

      await expect(
        service.answer('user-1', 'question-1', { selectedPosition: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggleFavorite', () => {
    it('marca como favorito quando não estava favoritado', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionProgressRepository.find.mockResolvedValue(null);

      const result = await service.toggleFavorite('user-1', 'question-1', true);

      expect(questionProgressRepository.setFavorite).toHaveBeenCalledWith(
        'user-1',
        'question-1',
        true,
      );
      expect(result).toEqual({ isFavorite: true });
    });

    it('alterna o estado quando nenhuma preferência é informada', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionProgressRepository.find.mockResolvedValue({ isFavorite: false });

      const result = await service.toggleFavorite('user-1', 'question-1');

      expect(questionProgressRepository.setFavorite).toHaveBeenCalledWith(
        'user-1',
        'question-1',
        true,
      );
      expect(result).toEqual({ isFavorite: true });
    });
  });

  describe('estatísticas de acerto por questão', () => {
    it('inclui as estatísticas agregadas na listagem quando há tentativas', async () => {
      questionsRepository.count.mockResolvedValue(1);
      questionsRepository.findMany.mockResolvedValue([{ ...baseQuestion, alternatives }]);
      questionAttemptsRepository.countsByQuestionIds.mockResolvedValue(
        new Map([['question-1', { attempts: 4, correct: 3 }]]),
      );

      const result = await service.findAll('user-1', { page: 1, limit: 20 });

      expect(questionAttemptsRepository.countsByQuestionIds).toHaveBeenCalledWith(['question-1']);
      expect(result.items[0].stats).toEqual({ attempts: 4, correct: 3, accuracyPercent: 75 });
    });

    it('expõe stats null na listagem quando a questão ainda não tem tentativas', async () => {
      questionsRepository.count.mockResolvedValue(1);
      questionsRepository.findMany.mockResolvedValue([{ ...baseQuestion, alternatives }]);

      const result = await service.findAll('user-1', { page: 1, limit: 20 });

      expect(result.items[0].stats).toBeNull();
    });

    it('inclui stats no detalhe da questão', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionAttemptsRepository.countsByQuestionIds.mockResolvedValue(
        new Map([['question-1', { attempts: 2, correct: 1 }]]),
      );

      const result = await service.findById('user-1', 'question-1', false);

      expect(result.stats).toEqual({ attempts: 2, correct: 1, accuracyPercent: 50 });
    });

    it('retorna stats já contando a tentativa registrada', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionAttemptsRepository.countsByQuestionIds.mockResolvedValue(
        new Map([['question-1', { attempts: 1, correct: 1 }]]),
      );

      const result = await service.answer('user-1', 'question-1', { selectedPosition: 3 });

      expect(result.stats).toEqual({ attempts: 1, correct: 1, accuracyPercent: 100 });
    });
  });

  describe('findSimilar', () => {
    const similarQuestion = (overrides: Record<string, unknown> = {}) => ({
      ...baseQuestion,
      id: 'question-2',
      alternatives,
      ...overrides,
    });

    it('prioriza questões do mesmo assunto e exclui a própria', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionsRepository.findMany.mockResolvedValue([
        similarQuestion({ id: 'question-3' }),
        similarQuestion({ id: 'question-2', topicId: 'topic-2' }),
        { ...baseQuestion, alternatives },
      ]);

      const result = await service.findSimilar('user-1', 'question-1', 5);

      expect(questionsRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: { in: ['ws-1'] },
          OR: expect.arrayContaining([{ topicId: 'topic-1' }]),
        }),
        expect.objectContaining({ take: 60 }),
      );
      expect(result.items.map((item) => item.id)).toEqual(['question-3', 'question-2']);
      expect(result.limit).toBe(5);
    });

    it('respeita o limite informado e o teto de segurança', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionsRepository.findMany.mockResolvedValue([]);

      await expect(service.findSimilar('user-1', 'question-1', 999)).resolves.toMatchObject({
        items: [],
        limit: 12,
      });
      await expect(service.findSimilar('user-1', 'question-1')).resolves.toMatchObject({
        limit: 5,
      });
    });

    it('usa a fronteira de visibilidade do usuário (workspace pessoal + banco)', async () => {
      questionsRepository.findById.mockResolvedValue({ ...baseQuestion, alternatives });
      questionsRepository.findMany.mockResolvedValue([]);
      questionAccessService.getBankWorkspace.mockResolvedValue({
        id: 'ws-banco',
        name: 'Banco Lumina',
        type: 'INSTITUTION',
      });

      await service.findSimilar('user-1', 'question-1', 5);

      expect(questionsRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: { in: ['ws-1', 'ws-banco'] } }),
        expect.anything(),
      );
    });

    it('lança NotFoundException para questão de outro workspace', async () => {
      questionsRepository.findById.mockResolvedValue({
        ...baseQuestion,
        workspaceId: 'outro-workspace',
        alternatives,
      });

      await expect(service.findSimilar('user-1', 'question-1', 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
