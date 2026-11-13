import { ConflictException, ForbiddenException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { enemArea, gradeAnswers, GradingError, GradingItem, letterToPosition } from './answer-key.grading';
import { answerKeyModels, correctPositions, enemQuestionSourceId, fallbackExplanation, parseSuggestedAnswer, parseSuggestedAnswerOutcome, pickAccessibleQuestion, pickQuestion, plainExplanation } from './answer-key.questions';
import { parseOfficialGabarito } from '../questions/import/enem/enem-pdf.parser';
import { grayImagesToPdf } from '../simulations/omr/pdf';
import { answerKeySheetBits, answerKeySheetLayout } from './answer-key-sheet';
import { AnswerKeysService, checkInepGabarito } from './answer-keys.service';

const item = (number: number, answer: number | null, extra: Partial<GradingItem> = {}): GradingItem => ({ number, language: '', answer, area: enemArea(number), validated: true, ...extra });

describe('Gabarito Inteligente — conferência', () => {
  it('conta acerto, erro e branco; percentual sobre as que contam', () => {
    const items = [item(1, 1), item(2, 2), item(3, 3), item(4, 4)];
    const r = gradeAnswers(items, { 1: 1, 2: 3, 3: null });
    expect(r.questions.map((q) => q.status)).toEqual(['CORRECT', 'WRONG', 'BLANK', 'BLANK']);
    expect([r.correct, r.wrong, r.blank, r.total, r.answered]).toEqual([1, 1, 2, 4, 2]);
    expect(r.percent).toBe(25);
  });

  it('anulada e pendente de validação não entram no percentual', () => {
    const items = [item(1, 1), item(2, null), item(3, 2, { validated: false })];
    const r = gradeAnswers(items, { 1: 1, 2: 4, 3: 2 });
    expect(r.questions.map((q) => q.status)).toEqual(['CORRECT', 'ANNULLED', 'PENDING']);
    expect([r.annulled, r.pending, r.percent]).toEqual([1, 1, 100]);
  });

  it('língua estrangeira do Enem: vale o item da língua escolhida e ela é obrigatória', () => {
    const items = [item(1, 1, { language: 'INGLES' }), item(1, 3, { language: 'ESPANHOL' }), item(6, 2)];
    expect(gradeAnswers(items, { 1: 3, 6: 2 }, 'ESPANHOL').correct).toBe(2);
    expect(gradeAnswers(items, { 1: 3, 6: 2 }, 'INGLES').correct).toBe(1);
    expect(() => gradeAnswers(items, { 1: 3 })).toThrow(GradingError);
  });

  it('recusa questão fora do gabarito e resposta inválida', () => {
    expect(() => gradeAnswers([item(1, 1)], { 7: 1 })).toThrow(/fora do gabarito/);
    expect(() => gradeAnswers([item(1, 1)], { 1: 9 })).toThrow(/inválida/);
  });

  it('resultado por área do Enem pela numeração', () => {
    const items = [item(91, 1), item(92, 1), item(136, 2), item(137, 2)];
    const r = gradeAnswers(items, { 91: 1, 92: 2, 136: 2, 137: 2 });
    expect(r.byArea).toEqual([
      expect.objectContaining({ area: 'Ciências da Natureza e suas Tecnologias', correct: 1, wrong: 1, percent: 50 }),
      expect.objectContaining({ area: 'Matemática e suas Tecnologias', correct: 2, percent: 100 }),
    ]);
  });

  it('letras do gabarito', () => {
    expect(['A', 'e', ' c ', 'X', '', null].map(letterToPosition)).toEqual([1, 5, 3, null, null, null]);
  });
});

describe('Gabarito Inteligente — cadastro e permissões', () => {
  const service = (prisma: unknown) => new AnswerKeysService(prisma as never);
  const base = { examId: '00000000-0000-4000-8000-000000000001', origin: 'OFFICIAL' as const, items: [{ number: 1, answer: 1 }] };

  it('oficial só pela administração e sempre com fonte e data de publicação', async () => {
    await expect(service({}).create({ id: 'u', accountType: 'TEACHER' }, base)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service({}).create({ id: 'u', accountType: 'ADMIN' }, base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aluno não cadastra gabarito de professor; IA/comunitário ainda não por aqui', async () => {
    await expect(service({}).create({ id: 'u', accountType: 'STUDENT_INDEPENDENT' }, { ...base, origin: 'TEACHER' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service({}).create({ id: 'u', accountType: 'TEACHER' }, { ...base, origin: 'COMMUNITY' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('oficial duplicado (mesma prova, aplicação, dia e cor) vira conflito, não um segundo oficial', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: base.examId }), findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'ENEM' }) },
      workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
      answerKey: { create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' })) },
    };
    const dto = { ...base, sourceName: 'INEP', sourceUrl: 'https://download.inep.gov.br/x.pdf', publishedAt: '2025-11-13' };
    await expect(service(prisma).create({ id: 'admin', accountType: 'ADMIN' }, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('item repetido e língua pela metade são recusados', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: base.examId }), findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'ENEM' }) },
    };
    const s = service(prisma);
    await expect(s.create({ id: 't', accountType: 'TEACHER' }, { ...base, origin: 'TEACHER', items: [{ number: 1, answer: 1 }, { number: 1, answer: 2 }] })).rejects.toThrow(/repetida/);
    await expect(s.create({ id: 't', accountType: 'TEACHER' }, { ...base, origin: 'TEACHER', items: [{ number: 1, answer: 1, language: 'INGLES' }, { number: 1, answer: 2 }] })).rejects.toThrow(/por língua/);
  });

  it('aluno vê oficial publicado, os próprios e os publicados pelos professores das turmas dele', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      classMember: { findMany: vi.fn().mockResolvedValue([{ class: { createdBy: 'prof-1', teachers: [{ userId: 'prof-2' }] } }]) },
      answerKey: { findMany },
    };
    await service(prisma).list({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, {});
    const where = findMany.mock.calls[0][0].where.AND[0];
    expect(where.OR).toEqual([
      { origin: 'OFFICIAL', status: 'PUBLISHED' },
      { origin: 'COMMUNITY', status: 'PUBLISHED' },
      { createdBy: 'aluno', status: { not: 'ARCHIVED' } },
      { origin: { in: ['TEACHER', 'AI_SUGGESTED'] }, status: 'PUBLISHED', createdBy: { in: ['prof-1', 'prof-2'] } },
    ]);
  });
});

describe('Gabarito Inteligente — sugestão por IA', () => {
  const alternatives = [
    { position: 1, text: 'Alternativa A' },
    { position: 2, text: 'Alternativa B' },
    { position: 3, text: 'Alternativa C' },
    { position: 4, text: 'Alternativa D' },
    { position: 5, text: 'Alternativa E' },
  ];

  it('lê a resposta e a justificativa do JSON, inclusive com cerca de markdown', () => {
    expect(parseSuggestedAnswer('{"answer":"C","justification":"O texto afirma que a célula produz energia."}', alternatives)).toEqual({
      position: 3,
      justification: 'O texto afirma que a célula produz energia.',
    });
    expect(parseSuggestedAnswer('```json\n{"answer":2,"justification":"A alternativa B retoma o comando."}\n```', alternatives)?.position).toBe(2);
  });

  it('preserva o motivo quando a IA devolve resposta nula', () => {
    expect(parseSuggestedAnswerOutcome('{"answer":null,"justification":"Falta a imagem citada no enunciado."}', alternatives)).toEqual({
      position: null,
      justification: 'Falta a imagem citada no enunciado.',
    });
    expect(parseSuggestedAnswer('{"answer":null,"justification":"Falta a imagem citada no enunciado."}', alternatives)).toBeNull();
  });

  it('não sugere sem alternativa válida ou sem justificativa', () => {
    expect(parseSuggestedAnswer('{"answer":"F","justification":"Não existe."}', alternatives)).toBeNull();
    expect(parseSuggestedAnswer('{"answer":"A","justification":"ok"}', alternatives)).toBeNull();
    expect(parseSuggestedAnswer('{"answer":null,"justification":"Falta a imagem."}', alternatives)).toBeNull();
    expect(parseSuggestedAnswer('resposta: A', alternatives)).toBeNull();
  });

  it('só usa resposta pronta quando há exatamente uma alternativa correta', () => {
    expect(correctPositions([{ position: 1, isCorrect: true }, { position: 2, isCorrect: false }])).toEqual([1]);
    expect(correctPositions([{ position: 1, isCorrect: false }, { position: 2, isCorrect: false }])).toEqual([]);
    expect(correctPositions([{ position: 1, isCorrect: true }, { position: 2, isCorrect: true }])).toEqual([1, 2]);
  });

  it('prefere a questão do banco público quando há duplicata acessível', () => {
    expect(pickAccessibleQuestion([{ id: 'particular', workspaceId: 'w1' }, { id: 'publica', workspaceId: 'bank' }], 'bank')?.id).toBe('publica');
    expect(pickAccessibleQuestion([{ id: 'particular', workspaceId: 'w1' }], 'bank')?.id).toBe('particular');
    expect(pickAccessibleQuestion([], 'bank')).toBeNull();
  });

  it('usa resposta do banco com confiança 1, chama a IA só quando falta e pula questão com imagem', async () => {
    const questions = [
      {
        id: 'q1', workspaceId: 'w1', examNumber: 1, sourceId: null, stem: 'Questão com resposta no banco.', subject: 'Biologia', imageUrl: null,
        alternatives: [
          { position: 1, text: 'Certa', isCorrect: true },
          { position: 2, text: 'Errada', isCorrect: false },
        ],
      },
      {
        id: 'q2', workspaceId: 'w1', examNumber: 2, sourceId: null, stem: 'Questão sem resposta no banco.', subject: 'Biologia', imageUrl: null,
        alternatives: [
          { position: 1, text: 'A', isCorrect: false },
          { position: 2, text: 'B', isCorrect: false },
          { position: 3, text: 'C', isCorrect: false },
        ],
      },
      {
        id: 'q3', workspaceId: 'w1', examNumber: 3, sourceId: null, stem: 'Questão com gráfico.', subject: 'Biologia', imageUrl: 'https://exemplo.test/grafico.png',
        alternatives: [
          { position: 1, text: 'A', isCorrect: false },
          { position: 2, text: 'B', isCorrect: false },
        ],
      },
    ];
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: 'exam-1', name: 'Simulado', year: 2026 }) },
      answerKey: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'key-1' }) },
      workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'bank' }) },
      workspaceMember: {
        findMany: vi.fn().mockResolvedValue([{ workspaceId: 'w1' }]),
        findFirst: vi.fn().mockResolvedValue({ workspaceId: 'w1' }),
      },
      question: { findMany: vi.fn().mockResolvedValue(questions) },
    };
    const ai = { generateStructured: vi.fn().mockResolvedValue({ text: '{"answer":"C","justification":"A alternativa C explica o processo descrito."}', model: 'modelo-teste' }) };
    const s = new AnswerKeysService(prisma as never, undefined, ai as never);
    vi.spyOn(s, 'get').mockResolvedValue({ id: 'key-1' } as never);

    const result = await s.suggestWithAi({ id: 'prof', accountType: 'TEACHER' }, { examId: 'exam-1', numbers: [1, 2, 3] });

    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    // O gabarito usa a cadeia própria (ou a da redação), nunca a do chat.
    expect(ai.generateStructured.mock.calls[0][0].models).toEqual(answerKeyModels());
    expect(result.counts).toEqual({ ai: 1, known: 1, skipped: 1, missing: 0 });
    expect(result.models).toEqual(['modelo-teste']);
    expect(result.skipped[0].reason).toMatch(/imagem/);
    const created = prisma.answerKey.create.mock.calls[0][0].data;
    expect(created.origin).toBe('AI_SUGGESTED');
    expect(created.status).toBe('DRAFT');
    expect(created.items.create).toEqual([
      expect.objectContaining({ number: 1, answer: 1, confidence: 1, validated: false, questionId: 'q1' }),
      expect.objectContaining({ number: 2, answer: 3, confidence: null, validated: false, questionId: 'q2' }),
      expect.objectContaining({ number: 3, answer: null, confidence: null, validated: false, questionId: 'q3' }),
    ]);
    expect(created.items.create[2].justification).toMatch(/imagem/);
  });

  it('guarda o motivo da IA quando ela não consegue decidir', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: 'exam-1', name: 'Simulado', year: 2026 }) },
      answerKey: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'key-1' }) },
      workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'bank' }) },
      workspaceMember: {
        findMany: vi.fn().mockResolvedValue([{ workspaceId: 'w1' }]),
        findFirst: vi.fn().mockResolvedValue({ workspaceId: 'w1' }),
      },
      question: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'q1', workspaceId: 'w1', examNumber: 1, sourceId: null, stem: 'Questão com gráfico.', subject: 'Biologia', imageUrl: null,
          alternatives: [
            { position: 1, text: 'A', isCorrect: false },
            { position: 2, text: 'B', isCorrect: false },
          ],
        }]),
      },
    };
    const ai = { generateStructured: vi.fn().mockResolvedValue({ text: '{"answer":null,"justification":"O enunciado menciona um gráfico que não foi enviado."}', model: 'modelo-teste' }) };
    const s = new AnswerKeysService(prisma as never, undefined, ai as never);
    vi.spyOn(s, 'get').mockResolvedValue({ id: 'key-1' } as never);

    const result = await s.suggestWithAi({ id: 'prof', accountType: 'TEACHER' }, { examId: 'exam-1', numbers: [1] });

    expect(result.counts).toEqual({ ai: 0, known: 0, skipped: 1, missing: 0 });
    expect(result.models).toEqual(['modelo-teste']);
    expect(result.skipped[0].reason).toMatch(/gráfico/);
    const created = prisma.answerKey.create.mock.calls[0][0].data;
    expect(created.items.create[0]).toEqual(expect.objectContaining({
      number: 1, answer: null, confidence: null, validated: false, questionId: 'q1',
    }));
    expect(created.items.create[0].justification).toMatch(/Sem sugestão:.*gráfico/);
  });

  it('recusa gerar sugestão quando já existe gabarito oficial', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: 'exam-1', name: 'ENEM', year: 2024 }) },
      answerKey: { findFirst: vi.fn().mockResolvedValue({ id: 'oficial' }) },
    };
    const s = new AnswerKeysService(prisma as never);
    await expect(s.suggestWithAi({ id: 'prof', accountType: 'TEACHER' }, { examId: 'exam-1', day: 2, bookletColor: 'Amarelo' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('valida a resposta corrigida pelo professor e sobe a versão', async () => {
    const prisma = {
      answerKey: {
        findUnique: vi.fn().mockResolvedValue({ id: 'key-1', origin: 'AI_SUGGESTED', createdBy: 'prof', exam: { name: 'Simulado' } }),
        update: vi.fn().mockReturnValue({ kind: 'key-update' }),
      },
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([{ id: 'i1', number: 1, language: '', answer: 2, justification: 'Justificativa da IA.', validated: false }]),
        update: vi.fn().mockReturnValue({ kind: 'item-update' }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const s = new AnswerKeysService(prisma as never);
    vi.spyOn(s, 'get').mockResolvedValue({ id: 'key-1' } as never);

    await s.validateItems({ id: 'prof', accountType: 'TEACHER' }, 'key-1', { items: [{ number: 1, answer: 3 }] });

    expect(prisma.answerKeyItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { validated: true, answer: 3, justification: 'Justificativa da IA.', confidence: null },
    });
    expect(prisma.answerKey.update).toHaveBeenCalledWith({ where: { id: 'key-1' }, data: { version: { increment: 1 } } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('não deixa outro professor validar o gabarito alheio', async () => {
    const prisma = {
      answerKey: { findUnique: vi.fn().mockResolvedValue({ id: 'key-1', origin: 'AI_SUGGESTED', createdBy: 'prof', exam: { name: 'Simulado' } }) },
    };
    const s = new AnswerKeysService(prisma as never);
    await expect(s.validateItems({ id: 'outro', accountType: 'TEACHER' }, 'key-1', { items: [{ number: 1 }] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mantém no rascunho a questão que não existe no banco, pendente para o professor', async () => {
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: 'exam-1', name: 'Simulado', year: 2026 }) },
      answerKey: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'key-1' }) },
      workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'bank' }) },
      workspaceMember: {
        findMany: vi.fn().mockResolvedValue([{ workspaceId: 'w1' }]),
        findFirst: vi.fn().mockResolvedValue({ workspaceId: 'w1' }),
      },
      question: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'q1', workspaceId: 'w1', examNumber: 1, sourceId: null, stem: 'Questão existente.', subject: 'Biologia', imageUrl: null,
          alternatives: [
            { position: 1, text: 'Certa', isCorrect: true },
            { position: 2, text: 'Errada', isCorrect: false },
          ],
        }]),
      },
    };
    const s = new AnswerKeysService(prisma as never);
    vi.spyOn(s, 'get').mockResolvedValue({ id: 'key-1' } as never);

    const result = await s.suggestWithAi({ id: 'prof', accountType: 'TEACHER' }, { examId: 'exam-1', numbers: [1, 99] });

    const created = prisma.answerKey.create.mock.calls[0][0].data;
    expect(created.items.create).toEqual([
      expect.objectContaining({ number: 1, answer: 1, confidence: 1, questionId: 'q1' }),
      expect.objectContaining({ number: 99, answer: null, confidence: null, questionId: null, validated: false }),
    ]);
    expect(created.items.create[1].justification).toMatch(/Sem questão/);
    expect(result.counts).toEqual({ ai: 0, known: 1, skipped: 0, missing: 1 });
  });

  it('exige a cor do caderno no Enem', async () => {
    const prisma = { exam: { findUnique: vi.fn().mockResolvedValue({ id: 'exam-1', name: 'ENEM', year: 2024 }) } };
    const s = new AnswerKeysService(prisma as never);
    await expect(s.suggestWithAi({ id: 'prof', accountType: 'TEACHER' }, { examId: 'exam-1', day: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não sobe a versão quando o professor confirma um item já validado sem mudar nada', async () => {
    const prisma = {
      answerKey: {
        findUnique: vi.fn().mockResolvedValue({ id: 'key-1', origin: 'AI_SUGGESTED', createdBy: 'prof', exam: { name: 'Simulado' } }),
        update: vi.fn().mockReturnValue({ kind: 'key-update' }),
      },
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([{ id: 'i1', number: 1, language: '', answer: 2, justification: 'Justificativa da IA.', validated: true }]),
        update: vi.fn().mockReturnValue({ kind: 'item-update' }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const s = new AnswerKeysService(prisma as never);
    vi.spyOn(s, 'get').mockResolvedValue({ id: 'key-1' } as never);

    await s.validateItems({ id: 'prof', accountType: 'TEACHER' }, 'key-1', { items: [{ number: 1, answer: 2, justification: 'Justificativa da IA.' }] });

    expect(prisma.answerKey.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// Texto real extraído (pdfjs, runs sem espaço) dos PDFs públicos do INEP.
const INEP_2023_D1_AZUL = 'CADERNO 1AzulGabarito 20231diaºQUESTÃO GABARITO46 C47 D48 A49 E50 E51 C52 A53 B54 A55 A56 C57 E58 A59 A60 D61 E62 C63 B64 D65 A66 A67 B68 C69 D70 C71 A72 B73 A74 D75 C76 D77 E78 A79 B80 A81 A82 B83 C84 D85 D86 E87 B88 A89 D90 BQUESTÃOGABARITOINGLÊS ESPANHOL1 B A2 B A3 D E4 A B5 B A6 D7 A8 C9 E10 E11 D12 C13 C14 D15 B16 A17 D18 B19 D20 E21 D22 C23 C24 E25 B26 C27 A28 C29 E30 A31 C32 A33 A34 C35 A36 A37 C38 A39 C40 B41 B42 E43 A44 A45 ELINGUAGENS, CÓDIGOSE SUAS TECNOLOGIASCIÊNCIAS HUMANASE SUAS TECNOLOGIAS';
const INEP_2024_D2_AMARELO = 'AmareloCADERNO 5Gabarito 2024diaº2QUESTÃO GABARITO91 C92 A93 E94 D95 A96 A97 C98 C99 A100 E101 E102 Anulado103 C104 B105 B106 A107 E108 D109 B110 B111 C112 A113 A114 C115 D116 E117 D118 C119 B120 C121 E122 E123 C124 A125 A126 E127 D128 D129 D130 E131 B132 B133 D134 D135 BQUESTÃO GABARITO136 C137 E138 C139 E140 B141 E142 D143 A144 D145 C146 A147 A148 D149 E150 C151 D152 B153 B154 C155 E156 B157 D158 C159 C160 C161 A162 C163 A164 B165 B166 A167 B168 B169 A170 D171 D172 D173 C174 E175 A176 D177 B178 B179 C180 ECIÊNCIAS DA NATUREZAE SUAS TECNOLOGIASMATEMÁTICA E SUASTECNOLOGIAS';

describe('Gabarito Inteligente — gabarito oficial do PDF do INEP', () => {
  it('1º dia 2023 (Azul): cabeçalho, 1–9 com um dígito e as duas línguas', () => {
    const g = parseOfficialGabarito(INEP_2023_D1_AZUL);
    expect([g.year, g.day, g.bookletColor, g.bookletNumber]).toEqual([2023, 1, 'Azul', 1]);
    expect(g.items.filter((i) => i.number === 1)).toEqual([
      { number: 1, letter: 'A', language: 'ESPANHOL' },
      { number: 1, letter: 'B', language: 'INGLES' },
    ]);
    expect(g.items.find((i) => i.number === 3 && i.language === 'ESPANHOL')?.letter).toBe('E');
    expect(g.items.find((i) => i.number === 6)).toEqual({ number: 6, letter: 'D', language: '' });
    expect(g.items.find((i) => i.number === 45)?.letter).toBe('E');
    expect(g.items).toHaveLength(95); // 90 questões + 5 da segunda língua
    expect(checkInepGabarito(g)).toEqual([]);
  });

  it('2º dia 2024 (Amarelo): 91–180 e questão anulada', () => {
    const g = parseOfficialGabarito(INEP_2024_D2_AMARELO);
    expect([g.year, g.day, g.bookletColor, g.bookletNumber]).toEqual([2024, 2, 'Amarelo', 5]);
    expect(g.items).toHaveLength(90);
    expect(g.items.find((i) => i.number === 102)?.letter).toBeNull();
    expect(g.items.find((i) => i.number === 180)?.letter).toBe('E');
    expect(checkInepGabarito(g)).toEqual([]);
  });

  it('recusa gabarito incompleto em vez de gravar como oficial', () => {
    const cut = parseOfficialGabarito(INEP_2024_D2_AMARELO.slice(0, 300));
    expect(checkInepGabarito(cut).join(' ')).toMatch(/Faltam as questões/);
  });

  it('só administrador importa; reimportar o mesmo PDF devolve o existente', async () => {
    const enem = { fetchOfficialGabarito: vi.fn().mockResolvedValue(parseOfficialGabarito(INEP_2024_D2_AMARELO)) };
    const dto = { gabaritoUrl: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_GB_impresso_D2_CD5.pdf', publishedAt: '2024-11-20' };
    await expect(new AnswerKeysService({} as never, enem as never).importFromInep({ id: 't', accountType: 'TEACHER' }, dto)).rejects.toBeInstanceOf(ForbiddenException);

    const items = parseOfficialGabarito(INEP_2024_D2_AMARELO).items.map((i) => ({ number: i.number, language: i.language, answer: letterToPosition(i.letter) }));
    const prisma = {
      exam: { findFirst: vi.fn().mockResolvedValue({ id: 'exam-2024' }), create: vi.fn() },
      answerKey: { findFirst: vi.fn().mockResolvedValue({ id: 'key-1', items }), create: vi.fn() },
    };
    const service = new AnswerKeysService(prisma as never, enem as never);
    const get = vi.spyOn(service, 'get').mockResolvedValue({ id: 'key-1' } as never);
    await expect(service.importFromInep({ id: 'admin', accountType: 'ADMIN' }, dto)).resolves.toMatchObject({ id: 'key-1' });
    expect(prisma.answerKey.create).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(expect.anything(), 'key-1', true);

    prisma.answerKey.findFirst.mockResolvedValue({ id: 'key-1', items: items.map((i) => (i.number === 91 ? { ...i, answer: 5 } : i)) });
    await expect(service.importFromInep({ id: 'admin', accountType: 'ADMIN' }, dto)).rejects.toBeInstanceOf(ConflictException);
  });
});

/** Página sintética do cartão (marcadores, código e bolhas marcadas), em px. */
function renderKeySheet(layout: ReturnType<typeof answerKeySheetLayout>, marks: Record<number, number[]>, pxPerMm = 6) {
  const width = Math.round(layout.page.width * pxPerMm);
  const height = Math.round(layout.page.height * pxPerMm);
  const data = new Uint8Array(width * height).fill(240);
  const fill = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = Math.round(y0 * pxPerMm); y < (y0 + h) * pxPerMm; y++) for (let x = Math.round(x0 * pxPerMm); x < (x0 + w) * pxPerMm; x++) data[y * width + x] = v;
  };
  const s = layout.fiducialSize;
  for (const f of layout.fiducials) fill(f.x - s / 2, f.y - s / 2, s, s, 15);
  answerKeySheetBits().forEach((bit, i) => { const c = layout.codeCells[i]; if (bit) fill(c.x, c.y, c.size, c.size, 20); });
  for (const q of layout.questions) {
    for (const b of q.bubbles) {
      const ring = (r: number, v: number, solid: boolean) => {
        for (let y = -r; y <= r; y += 1 / pxPerMm) for (let x = -r; x <= r; x += 1 / pxPerMm) {
          const d = Math.hypot(x, y);
          if (solid ? d < r : Math.abs(d - r) < 0.2) data[Math.round((b.y + y) * pxPerMm) * width + Math.round((b.x + x) * pxPerMm)] = v;
        }
      };
      ring(b.r, 110, false);
      if (marks[q.displayNumber ?? q.number]?.includes(b.position)) ring(b.r * 0.95, 25, true);
    }
  }
  return { width, height, data };
}

describe('Gabarito Inteligente — cartão por foto', () => {
  it('cartão do 2º dia numera 91–180 e usa o código reservado 0', () => {
    const layout = answerKeySheetLayout(Array.from({ length: 90 }, (_, i) => 91 + i), false);
    expect(layout.questions[0].displayNumber).toBe(91);
    expect(layout.questions[89].displayNumber).toBe(180);
    expect(() => answerKeySheetLayout([1, 2, 4], false)).toThrow(/sequência/);
  });

  it('lê a foto do cartão e devolve as respostas para o aluno conferir, sem gravar', async () => {
    const numbers = Array.from({ length: 45 }, (_, i) => 136 + i);
    const layout = answerKeySheetLayout(numbers, false);
    const marks: Record<number, number[]> = {};
    numbers.forEach((n, i) => { if (i % 10 !== 9) marks[n] = [(i % 5) + 1]; });
    marks[140] = [1, 3]; // dupla marcação
    const pdf = grayImagesToPdf([renderKeySheet(layout, marks)]);
    const service = new AnswerKeysService({} as never);
    vi.spyOn(service, 'get').mockResolvedValue({ numbers, needsLanguage: false } as never);
    const result = await service.readSheet({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, 'key', `data:application/pdf;base64,${pdf.toString('base64')}`);
    const byNumber = new Map(result.answers.map((a) => [a.number, a]));
    expect(byNumber.get(136)?.selected).toBe(1);
    expect(byNumber.get(139)?.selected).toBe(4);
    expect(byNumber.get(145)?.selected).toBeNull(); // em branco
    expect(byNumber.get(140)).toMatchObject({ selected: null, status: 'MULTIPLE', review: true });
    const wrong = numbers.filter((n, i) => n !== 140 && byNumber.get(n)?.selected !== (i % 10 === 9 ? null : (i % 5) + 1));
    expect(wrong).toEqual([]);
  });
});

describe('Gabarito Inteligente — painel do professor', () => {
  it('só alunos das turmas do professor, última conferência de cada um, questão mais difícil e distrator', async () => {
    const items = [
      { number: 1, language: '', answer: 1, area: 'Geral', validated: true },
      { number: 2, language: '', answer: 2, area: 'Geral', validated: true },
    ];
    const user = (id: string, firstName: string) => ({ id, email: `${id}@x`, profile: { firstName, lastName: null } });
    const findMany = vi.fn().mockResolvedValue([
      { userId: 'a1', language: null, answersJson: { 1: 1, 2: 3 }, createdAt: new Date('2026-11-03'), user: user('a1', 'Ana') },
      { userId: 'a2', language: null, answersJson: { 1: 1, 2: 3 }, createdAt: new Date('2026-11-02'), user: user('a2', 'Bia') },
      { userId: 'a1', language: null, answersJson: { 1: 4, 2: 4 }, createdAt: new Date('2026-11-01'), user: user('a1', 'Ana') },
    ]);
    const prisma = {
      classMember: { findMany: vi.fn().mockResolvedValue([{ user: user('a1', 'Ana') }, { user: user('a2', 'Bia') }]) },
      answerKeyCheck: { findMany },
      answerKeyItem: { findMany: vi.fn().mockResolvedValue(items) },
    };
    const service = new AnswerKeysService(prisma as never);
    vi.spyOn(service as unknown as { loadVisible: () => Promise<unknown> }, 'loadVisible').mockResolvedValue({ id: 'k', exam: {}, creator: user('p', 'Prof'), _count: { items: 2 }, origin: 'OFFICIAL' } as never);
    await expect(service.stats({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, 'k')).rejects.toBeInstanceOf(ForbiddenException);
    const s = await service.stats({ id: 'prof', accountType: 'TEACHER' }, 'k');
    expect(findMany.mock.calls[0][0].where.userId).toEqual({ in: ['a1', 'a2'] });
    expect(s.students).toBe(2);
    expect(s.averagePercent).toBe(50);
    expect(s.questions[0]).toMatchObject({ number: 2, correctPercent: 0, topDistractor: { position: 3, count: 2 } });
    expect(s.ranking.map((r) => r.name)).toEqual(['Ana', 'Bia']);
  });
});

describe('Gabarito Inteligente — gabarito comunitário', () => {
  it('estimativa provisória com os pendentes, sem entrar no resultado oficial', () => {
    const items = [item(91, 1), item(92, 2, { validated: false, confidence: 0.8 }), item(93, 3, { validated: false, confidence: 0.5 })];
    const r = gradeAnswers(items, { 91: 1, 92: 2, 93: 1 });
    expect([r.correct, r.pending, r.percent]).toEqual([1, 2, 100]);
    expect(r.provisional).toEqual({ matches: 1, differs: 1, blank: 0 });
    expect(r.questions[1]).toMatchObject({ status: 'PENDING', agreement: 0.8 });
  });

  it('mais votada com concordância; menos de 3 votos não vira resposta; empate avisado', async () => {
    const created: unknown[] = [];
    const tx = {
      answerKeyVote: {
        upsert: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { number: 91, language: '', answer: 2 }, { number: 91, language: '', answer: 2 }, { number: 91, language: '', answer: 4 },
          { number: 92, language: '', answer: 1 }, { number: 92, language: '', answer: 1 },
          { number: 93, language: '', answer: 1 }, { number: 93, language: '', answer: 3 }, { number: 93, language: '', answer: 1 }, { number: 93, language: '', answer: 3 },
        ]),
      },
      answerKeyItem: { deleteMany: vi.fn(), createMany: vi.fn(async ({ data }: { data: unknown[] }) => created.push(...data)) },
    };
    const prisma = {
      exam: { findUnique: vi.fn().mockResolvedValue({ id: 'e', name: 'ENEM' }) },
      answerKey: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'c1' }) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const service = new AnswerKeysService(prisma as never);
    vi.spyOn(service, 'get').mockResolvedValue({ id: 'c1' } as never);
    await service.contribute({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, { examId: 'e', day: 2, answers: { 91: 2, 92: 1, 93: null } });
    expect(tx.answerKeyVote.upsert).toHaveBeenCalledTimes(2); // em branco não é voto
    expect(created).toEqual([
      expect.objectContaining({ number: 91, answer: 2, votes: 3, confidence: 0.67, validated: false }),
      expect.objectContaining({ number: 93, votes: 4, confidence: 0.5, justification: expect.stringContaining('empate') }),
    ]);
  });

  it('não abre comunitário onde já existe oficial; fora da prova é recusado', async () => {
    const prisma = { exam: { findUnique: vi.fn().mockResolvedValue({ id: 'e', name: 'ENEM' }) }, answerKey: { findFirst: vi.fn().mockResolvedValue({ id: 'oficial' }) } };
    await expect(new AnswerKeysService(prisma as never).contribute({ id: 'a', accountType: 'STUDENT_INDEPENDENT' }, { examId: 'e', day: 2, answers: { 91: 1 } })).rejects.toBeInstanceOf(ConflictException);
    prisma.answerKey.findFirst.mockResolvedValue(null);
    await expect(new AnswerKeysService(prisma as never).contribute({ id: 'a', accountType: 'STUDENT_INDEPENDENT' }, { examId: 'e', day: 2, answers: { 12: 1 } })).rejects.toThrow(/fora da prova/);
  });

  it('só a administração modera', async () => {
    await expect(new AnswerKeysService({} as never).removeVotes({ id: 'p', accountType: 'TEACHER' }, 'k', 'u')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Gabarito Inteligente — vínculo com o banco e explicação da LuminIA', () => {
  it('sourceId do Enem: dia, número e sufixo da língua', () => {
    expect(enemQuestionSourceId(2024, 2, { number: 91, language: '' })).toBe('enem-2024-d2-q91');
    expect(enemQuestionSourceId(2023, 1, { number: 1, language: 'INGLES' })).toBe('enem-2023-d1-q1-ingles');
    expect(enemQuestionSourceId(2023, 1, { number: 1, language: 'ESPANHOL' })).toBe('enem-2023-d1-q1-espanhol');
  });

  it('só liga questão do banco público, nunca de um workspace particular', () => {
    const candidates = [{ id: 'particular', workspaceId: 'w1' }, { id: 'publica', workspaceId: 'banco' }];
    expect(pickQuestion(candidates, 'banco')).toBe('publica');
    expect(pickQuestion([{ id: 'particular', workspaceId: 'w1' }], 'banco')).toBeNull();
    expect(pickQuestion(candidates, null)).toBeNull();
  });

  it('limpa a marcação de markdown que a IA devolve, sem mexer no conteúdo', () => {
    expect(plainExplanation('A **alternativa C** é a correta.\n\n## Resumo\nUse __atenção__.'))
      .toBe('A alternativa C é a correta.\n\nResumo\nUse atenção.');
    expect(plainExplanation('  texto puro  ')).toBe('texto puro');
  });

  it('sem IA, o roteiro de revisão é honesto e não inventa conteúdo', () => {
    const text = fallbackExplanation({
      correct: 2,
      selected: 4,
      stem: 'Enunciado qualquer',
      alternatives: [{ position: 2, text: 'Alternativa correta' }, { position: 4, text: 'Alternativa marcada' }],
    });
    expect(text).toContain('alternativa B');
    expect(text).toContain('Alternativa correta');
    expect(text).toContain('alternativa D');
    expect(text).toMatch(/não está disponível/);
    expect(text).toMatch(/sem conteúdo inventado/);
  });

  it('liga apenas as questões que existem no banco público e devolve o que faltou', async () => {
    const prisma = {
      answerKey: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: 'k', origin: 'TEACHER', createdBy: 'prof', exam: { name: 'ENEM' } })
          .mockResolvedValue({ examId: 'exam', day: 2, exam: { name: 'ENEM', year: 2024 } }),
      },
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'i91', number: 91, language: '', questionId: null },
          { id: 'i92', number: 92, language: '', questionId: null },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'banco' }) },
      question: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'q91', sourceId: 'enem-2024-d2-q91', workspaceId: 'banco' },
          { id: 'q92', sourceId: 'enem-2024-d2-q92', workspaceId: 'particular' },
        ]),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const service = new AnswerKeysService(prisma as never);
    const result = await service.linkQuestions({ id: 'prof', accountType: 'TEACHER' }, 'k');
    expect(result).toEqual({ linked: 1, total: 2, missing: [92] });
    expect(prisma.answerKeyItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.answerKeyItem.update).toHaveBeenCalledWith({ where: { id: 'i91' }, data: { questionId: 'q91' } });
  });

  it('explica com a IA usando o enunciado e as alternativas reais', async () => {
    const prisma = {
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([{
          number: 91, language: '', answer: 2, area: 'Ciências da Natureza e suas Tecnologias',
          question: {
            id: 'q91', workspaceId: 'banco', stem: 'Um texto de biologia.', subject: 'Biologia', imageUrl: null,
            alternatives: [{ position: 1, text: 'Errada A' }, { position: 2, text: 'Certa B' }],
          },
        }]),
      },
    };
    const ai = { generateStructured: vi.fn().mockResolvedValue({ text: 'A **resposta é B** porque o texto diz isso.', model: 'modelo-x' }) };
    const access = { assertCanUse: vi.fn().mockResolvedValue(undefined) };
    const service = new AnswerKeysService(prisma as never, undefined, ai as never, access as never);
    vi.spyOn(service as unknown as { loadVisible: () => Promise<unknown> }, 'loadVisible').mockResolvedValue({ id: 'k' } as never);

    const result = await service.explainQuestion({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, 'k', 91, 1, null);
    expect(result).toMatchObject({ source: 'ai', model: 'modelo-x', correct: 2, selected: 1, questionId: 'q91' });
    expect(result.explanation).toContain('porque o texto diz isso');
    expect(result.explanation).not.toContain('**');
    expect(access.assertCanUse).toHaveBeenCalledWith('aluno', 'banco');
    expect(ai.generateStructured.mock.calls[0][0].prompt).toContain('Um texto de biologia.');
    expect(ai.generateStructured.mock.calls[0][0].prompt).toContain('B) Certa B');
  });

  it('se a IA falhar, devolve o roteiro determinístico marcado como rules', async () => {
    const prisma = {
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([{
          number: 91, language: '', answer: 2, area: null,
          question: { id: 'q91', workspaceId: 'banco', stem: 'Enunciado', subject: 'Biologia', imageUrl: null, alternatives: [{ position: 2, text: 'Certa' }] },
        }]),
      },
    };
    const ai = { generateStructured: vi.fn().mockRejectedValue(new Error('fora do ar')) };
    const service = new AnswerKeysService(prisma as never, undefined, ai as never);
    vi.spyOn(service as unknown as { loadVisible: () => Promise<unknown> }, 'loadVisible').mockResolvedValue({ id: 'k' } as never);
    const result = await service.explainQuestion({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, 'k', 91, 2, null);
    expect(result).toMatchObject({ source: 'rules', model: null });
    expect(result.explanation).toMatch(/não está disponível/);
  });

  it('sem questão ligada, recusa explicar em vez de inventar', async () => {
    const prisma = {
      answerKeyItem: {
        findMany: vi.fn().mockResolvedValue([{ number: 91, language: '', answer: 2, area: null, question: null }]),
      },
    };
    const service = new AnswerKeysService(prisma as never);
    vi.spyOn(service as unknown as { loadVisible: () => Promise<unknown> }, 'loadVisible').mockResolvedValue({ id: 'k' } as never);
    await expect(service.explainQuestion({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' }, 'k', 91, 1, null)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('cadeia de modelos do gabarito', () => {
  it('usa AI_ANSWER_KEY_MODELS; sem ela, a cadeia da redação; sem nenhuma, a padrão', () => {
    expect(answerKeyModels({ AI_ANSWER_KEY_MODELS: ' gemini:gemini-3.5-flash-lite , gemini:gemini-3.5-flash ', AI_ESSAY_MODELS: 'x:y' })).toEqual([
      'gemini:gemini-3.5-flash-lite',
      'gemini:gemini-3.5-flash',
    ]);
    expect(answerKeyModels({ AI_ANSWER_KEY_MODELS: '  ', AI_ESSAY_MODELS: 'gemini:gemini-3.5-flash-lite,openrouter:modelo' })).toEqual(['gemini:gemini-3.5-flash-lite', 'openrouter:modelo']);
    expect(answerKeyModels({})).toEqual([]);
  });
});
