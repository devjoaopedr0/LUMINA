import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { enemArea, gradeAnswers, GradingError, GradingItem, letterToPosition } from './answer-key.grading';
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
      { origin: 'TEACHER', status: 'PUBLISHED', createdBy: { in: ['prof-1', 'prof-2'] } },
    ]);
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
