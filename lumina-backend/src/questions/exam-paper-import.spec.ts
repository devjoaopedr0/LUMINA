import { describe, expect, it, vi } from 'vitest';
import { enemEdition, ExamPaperImportService, questionIdsByNumber } from './exam-paper-import.service';

const admin = { id: 'admin', accountType: 'ADMIN' } as any;
const item = { year: 2024, day: 2 as const, provaUrl: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_PV_impresso_D2_CD7.pdf', gabaritoUrl: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_GB_impresso_D2_CD7.pdf' };

function setup() {
  const prisma = {
    question: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'q91', sourceId: 'enem-2024-d2-q91', examNumber: 91 },
        { id: 'q92', sourceId: 'enem-2024-d2-q92', examNumber: 92 },
      ]),
    },
    exam: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'exam-2024' }) },
    examPaper: { upsert: vi.fn(async ({ create }: any) => ({ id: 'paper-1', ...create })), findUnique: vi.fn() },
    examPaperQuestion: { deleteMany: vi.fn().mockReturnValue('del'), createMany: vi.fn().mockReturnValue('create') },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const enem = {
    fetchExam: vi.fn().mockResolvedValue({
      questions: [{ examNumber: 91, subject: 'Ciências da Natureza' }, { examNumber: 92, subject: 'Ciências da Natureza' }],
      skipped: [{ questionNumber: 93, reason: 'imagem' }],
      totalPages: 32,
      pageOf: { 91: 3, 92: 4 },
      answers: { 91: 2, 92: 5 },
      bookletColor: 'Amarelo',
    }),
    download: vi.fn(),
  };
  const importer = { importScrapedQuestions: vi.fn().mockResolvedValue({ imported: 2, duplicates: 0, invalid: 0 }) };
  const questions = { getImportWorkspace: vi.fn().mockResolvedValue({ id: 'bank' }) };
  const access = { getBankWorkspace: vi.fn().mockResolvedValue({ id: 'bank' }) };
  const service = new ExamPaperImportService(prisma as any, enem as any, importer as any, questions as any, access as any);
  return { service, prisma, enem, importer, questions };
}

describe('importação em lote de provas do ENEM', () => {
  it('edição pelo dia e pela cor do caderno (sem acento)', () => {
    expect(enemEdition(2, 'Amarelo')).toBe('D2-AMARELO');
    expect(enemEdition(1, 'Azul')).toBe('D1-AZUL');
    expect(enemEdition(1, null)).toBe('D1');
  });

  it('liga cada número à questão do banco, preferindo a versão sem língua ou em inglês', () => {
    const map = questionIdsByNumber([
      { id: 'esp', sourceId: 'enem-2024-d1-q1-espanhol', examNumber: 1 },
      { id: 'ing', sourceId: 'enem-2024-d1-q1-ingles', examNumber: 1 },
      { id: 'q6', sourceId: 'enem-2024-d1-q6', examNumber: 6 },
    ]);
    expect(map.get(1)).toBe('ing');
    expect(map.get(6)).toBe('q6');
  });

  it('importa questões, cria a prova com PDF e gabarito e liga questão → página', async () => {
    const { service, prisma, importer } = setup();
    const { items } = await service.importEnemBatch(admin, [item], true);
    expect(importer.importScrapedQuestions).toHaveBeenCalledWith(expect.any(Array), [{ questionNumber: 93, reason: 'imagem' }], 'bank', 'admin');
    const upsert = prisma.examPaper.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ examId_year_edition: { examId: 'exam-2024', year: 2024, edition: 'D2-AMARELO' } });
    expect(upsert.create).toMatchObject({ pdfUrl: item.provaUrl, gabaritoJson: { 91: 2, 92: 5 }, status: 'PUBLISHED' });
    expect(upsert.create.metadataJson).toMatchObject({ day: 2, totalPages: 32, bookletColor: 'Amarelo', hasGabarito: true });
    expect(prisma.examPaperQuestion.createMany).toHaveBeenCalledWith({
      data: [
        { paperId: 'paper-1', questionId: 'q91', number: 91, pageNumber: 3, area: 'Ciências da Natureza' },
        { paperId: 'paper-1', questionId: 'q92', number: 92, pageNumber: 4, area: 'Ciências da Natureza' },
      ],
    });
    expect(items[0]).toMatchObject({ status: 'OK', edition: 'D2-AMARELO', linked: 2, totalPages: 32, questions: { imported: 2, skipped: 1 } });
  });

  it('sem publicar, a prova fica em rascunho', async () => {
    const { service, prisma } = setup();
    await service.importEnemBatch(admin, [item], false);
    expect(prisma.examPaper.upsert.mock.calls[0][0].create.status).toBe('DRAFT');
    expect(prisma.examPaper.upsert.mock.calls[0][0].update).not.toHaveProperty('status');
  });

  it('um caderno que falha não interrompe os outros', async () => {
    const { service, enem } = setup();
    enem.fetchExam.mockRejectedValueOnce(new Error('PDF fora do ar'));
    const { items } = await service.importEnemBatch(admin, [item, { ...item, day: 2, year: 2023 }], false);
    expect(items[0]).toMatchObject({ status: 'ERROR', message: 'PDF fora do ar' });
    expect(items[1]).toMatchObject({ status: 'OK' });
  });

  it('admin da plataforma importa direto no banco central, sem precisar do cargo do banco', async () => {
    const { service, questions } = setup();
    await service.importEnemBatch(admin, [item], true);
    expect(questions.getImportWorkspace).not.toHaveBeenCalled();
  });

  it('gestor do banco (sem ser admin) importa; quem não tem o cargo recebe 403', async () => {
    const manager = setup();
    await expect(manager.service.importEnemBatch({ id: 'gestor', accountType: 'STUDENT_INDEPENDENT' } as any, [item], true)).resolves.toMatchObject({ items: [{ status: 'OK' }] });
    expect(manager.questions.getImportWorkspace).toHaveBeenCalledWith('gestor', 'BANK');

    const other = setup();
    other.questions.getImportWorkspace.mockRejectedValue(new Error('sem permissão'));
    await expect(other.service.importEnemBatch({ id: 'prof', accountType: 'TEACHER' } as any, [item], true)).rejects.toThrow('Só a administração ou a gestão do banco');
  });
});

describe('PDF da prova', () => {
  it('só serve prova publicada com PDF do INEP', async () => {
    const { service, prisma } = setup();
    prisma.examPaper.findUnique.mockResolvedValueOnce({ id: 'p', status: 'DRAFT', pdfUrl: item.provaUrl });
    await expect(service.examPaperPdf({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' } as any, 'p')).rejects.toThrow('não encontrado');
    prisma.examPaper.findUnique.mockResolvedValueOnce({ id: 'p', status: 'PUBLISHED', pdfUrl: 'https://exemplo.com/prova.pdf' });
    await expect(service.examPaperPdf({ id: 'aluno', accountType: 'STUDENT_INDEPENDENT' } as any, 'p')).rejects.toThrow('não disponível');
  });
});
