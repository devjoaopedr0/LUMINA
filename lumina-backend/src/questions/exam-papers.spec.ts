import { describe, expect, it, vi } from 'vitest';
import { QuestionCatalogService } from './question-catalog.service';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from './question-access.service';

function setup() {
  const paper = {
    id: 'paper-1',
    examId: 'exam-1',
    year: 2023,
    status: 'PUBLISHED',
    exam: { id: 'exam-1', name: 'ENEM' },
  };
  const db = {
    examPaper: {
      findMany: vi.fn().mockResolvedValue([paper]),
      findFirst: vi.fn().mockResolvedValue(paper),
      findUnique: vi.fn().mockResolvedValue(paper),
    },
    examPaperPage: { findMany: vi.fn().mockResolvedValue([]) },
    exam: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'exam-1', name: 'ENEM' },
        { id: 'exam-2', name: 'FUVEST' },
        { id: 'exam-2024', name: 'enem' },
      ]),
    },
    examPaperQuestion: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'q1', questionId: 'question-1', number: 1, pageNumber: 1, boundsJson: null, area: null, question: { subject: 'Matemática' } },
      ]),
    },
  };
  const access = { getPersonalWorkspaceOrThrow: vi.fn().mockResolvedValue({ id: 'ws-1' }) };
  const service = new QuestionCatalogService(
    db as unknown as PrismaService,
    access as unknown as QuestionAccessService,
    {} as never,
    {} as never,
    {} as never,
  );
  return { db, access, service, paper };
}

describe('Provas antigas no catálogo (item 19)', () => {
  it('lista apenas provas publicadas, com o vestibular anexado', async () => {
    const { service, db, access } = setup();
    await service.listExamPapers('aluno');
    expect(access.getPersonalWorkspaceOrThrow).toHaveBeenCalledWith('aluno');
    expect(db.examPaper.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('detalhe, páginas e questões exigem uma prova publicada', async () => {
    const { service, db } = setup();
    await expect(service.getExamPaper('aluno', 'paper-1')).resolves.toMatchObject({ id: 'paper-1' });

    await service.getExamPaperPages('aluno', 'paper-1');
    expect(db.examPaperPage.findMany).toHaveBeenCalledWith({
      where: { paperId: 'paper-1' },
      orderBy: { pageNumber: 'asc' },
    });

    const rows = await service.getExamPaperQuestions('aluno', 'paper-1');
    // Achata `question.subject` para o frontend não precisar navegar a relação.
    expect(rows[0]).toEqual({ id: 'q1', questionId: 'question-1', number: 1, pageNumber: 1, boundsJson: null, area: null, subject: 'Matemática' });
  });

  it('rascunho e arquivada respondem 404, como se não existissem', async () => {
    const { service, db } = setup();
    db.examPaper.findFirst.mockResolvedValue(null);
    db.examPaper.findUnique.mockResolvedValue(null);
    await expect(service.getExamPaper('aluno', 'rascunho')).rejects.toThrow('Prova não encontrada');
    await expect(service.getExamPaperPages('aluno', 'rascunho')).rejects.toThrow('Prova não encontrada');
    expect(db.examPaperPage.findMany).not.toHaveBeenCalled();
  });
});

describe('Comparação de edições (item 19)', () => {
  it('mede quantas questões a edição nova repete da antiga', async () => {
    const { service, db } = setup();
    db.examPaper.findFirst
      .mockResolvedValueOnce({ id: 'base', examId: 'exam-1', year: 2022, status: 'PUBLISHED' })
      .mockResolvedValueOnce({ id: 'cmp', examId: 'exam-1', year: 2023, status: 'PUBLISHED' });
    db.examPaperQuestion.findMany
      .mockResolvedValueOnce([{ questionId: 'q1' }, { questionId: 'q2' }])
      .mockResolvedValueOnce([{ questionId: 'q2' }, { questionId: 'q3' }]);

    await expect(service.compareExamPapers('aluno', 'base', 'cmp')).resolves.toEqual({
      base: { id: 'base', year: 2022 },
      compare: { id: 'cmp', year: 2023 },
      repeatedCount: 1,
      newCount: 1,
      similarityScore: 33,
    });
  });

  it('recusa comparar a edição com ela mesma ou com outro vestibular', async () => {
    const { service, db } = setup();
    await expect(service.compareExamPapers('aluno', 'paper-1', 'paper-1')).rejects.toThrow('edições diferentes');

    db.examPaper.findFirst
      .mockResolvedValueOnce({ id: 'base', examId: 'exam-1', year: 2022, status: 'PUBLISHED' })
      .mockResolvedValueOnce({ id: 'cmp', examId: 'exam-2', year: 2023, status: 'PUBLISHED' });
    await expect(service.compareExamPapers('aluno', 'base', 'cmp')).rejects.toThrow('mesmo vestibular');
  });

  it('ENEM de anos diferentes (um registro de Exam por ano) pode ser comparado', async () => {
    const { service, db } = setup();
    db.examPaper.findFirst
      .mockResolvedValueOnce({ id: 'base', examId: 'exam-1', year: 2023, status: 'PUBLISHED' })
      .mockResolvedValueOnce({ id: 'cmp', examId: 'exam-2024', year: 2024, status: 'PUBLISHED' });
    db.examPaperQuestion.findMany.mockResolvedValue([]);
    await expect(service.compareExamPapers('aluno', 'base', 'cmp')).resolves.toMatchObject({ base: { year: 2023 }, compare: { year: 2024 } });
  });

  it('prova não publicada não entra na comparação', async () => {
    const { service, db } = setup();
    db.examPaper.findFirst
      .mockResolvedValueOnce({ id: 'base', examId: 'exam-1', year: 2022, status: 'PUBLISHED' })
      .mockResolvedValueOnce(null);
    await expect(service.compareExamPapers('aluno', 'base', 'rascunho')).rejects.toThrow('Prova não encontrada');
  });
});
