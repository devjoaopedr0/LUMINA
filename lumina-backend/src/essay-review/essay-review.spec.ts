import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AccountType, EssayLearningLevel, EssayReviewDecision, EssayReviewStatus } from '@prisma/client';
import { EssayReviewService } from './essay-review.service';
import { buildReviewChatPrompt, fallbackReviewReply } from './essay-review.prompt';

const NOW = new Date('2026-11-05T12:00:00.000Z');
type AiDetail = {
  competency: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  score: number;
  justification: string;
  evidenceJson: { evidence: string[] };
};
const AI_DETAILS: AiDetail[] = [
  { competency: 'C1', score: 120, justification: 'Domínio parcial da norma.', evidenceJson: { evidence: ['Trecho C1'] } },
  { competency: 'C2', score: 120, justification: 'Tema compreendido.', evidenceJson: { evidence: ['Trecho C2'] } },
  { competency: 'C3', score: 120, justification: 'Argumentos pouco desenvolvidos.', evidenceJson: { evidence: ['Trecho C3'] } },
  { competency: 'C4', score: 120, justification: 'Coesão parcial.', evidenceJson: { evidence: ['Trecho C4'] } },
  { competency: 'C5', score: 120, justification: 'Proposta incompleta.', evidenceJson: { evidence: ['Trecho C5'] } },
];

const essay = {
  id: 'essay',
  userId: 'student',
  title: 'A escola e a herança africana',
  theme: 'Desafios para a valorização da herança africana no Brasil',
  content: 'Texto da redação para teste.',
  version: 1,
  wordCount: 30,
  createdAt: NOW,
  updatedAt: NOW,
  correction: {
    id: 'correction',
    essayId: 'essay',
    status: 'COMPLETED',
    totalScore: 600,
    generalFeedback: 'Correção de referência.',
    essayVersion: 1,
    updatedAt: NOW,
    competenciesJson: { C1: 120, C2: 120, C3: 120, C4: 120, C5: 120 },
    details: AI_DETAILS,
  },
  user: { id: 'student', accountType: AccountType.STUDENT_INDEPENDENT, profile: { firstName: 'Aluno', lastName: 'Um' } },
};

function profile(firstName: string, lastName: string) {
  return { firstName, lastName };
}

function setup(overrides: { essay?: unknown; user?: unknown } = {}) {
  const db: any = {
    essay: { findUnique: vi.fn().mockResolvedValue(overrides.essay ?? essay), findFirst: vi.fn().mockResolvedValue(overrides.essay ?? essay) },
    classMember: { findFirst: vi.fn().mockResolvedValue({ id: 'class' }) },
    workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) },
    essayReview: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    essayLearningRecord: {
      createMany: vi.fn().mockResolvedValue({ count: 5 }),
      updateMany: vi.fn().mockResolvedValue({ count: 5 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    essayReviewMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    essayAuditEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(db)),
  };
  const ai = { generateStructured: vi.fn().mockResolvedValue(null) };
  return { db, ai, service: new EssayReviewService(db, ai as any) };
}

function savedReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review',
    essayId: 'essay',
    correctionId: 'correction',
    essayVersion: 1,
    status: EssayReviewStatus.SUBMITTED,
    decision: EssayReviewDecision.ADJUST,
    aiTotalScore: 600,
    totalScore: 760,
    aiCompetenciesJson: { C1: 120, C2: 120, C3: 120, C4: 120, C5: 120 },
    competenciesJson: { C1: 120, C2: 120, C3: 200, C4: 200, C5: 120 },
    divergenceJson: { total: 160, maxCompetency: 80, diffs: { C1: 0, C2: 0, C3: 80, C4: 80, C5: 0 }, discrepant: true },
    generalFeedback: null,
    validationLevel: EssayLearningLevel.STRUCTURED,
    validatedAt: null,
    validationNotes: null,
    submittedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    evaluator: { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') },
    validatedByUser: null,
    details: AI_DETAILS.map((detail, index) => ({
      id: `detail-${index + 1}`,
      reviewId: 'review',
      ...detail,
      humanScore: detail.competency === 'C3' || detail.competency === 'C4' ? 200 : detail.score,
      decision: detail.competency === 'C3' || detail.competency === 'C4' ? EssayReviewDecision.ADJUST : EssayReviewDecision.AGREE,
      criterion: detail.competency === 'C3' ? 'desenvolvimento argumentativo' : null,
      evidenceJson: detail.competency === 'C3' ? { evidence: ['Trecho C3'], anchorText: 'Trecho C3' } : detail.evidenceJson,
    })),
    ...overrides,
  };
}

describe('EssayReviewService — submissão humana', () => {
  it('registra concordância sem transformar em conhecimento validado', async () => {
    const { db, service } = setup();
    db.essayReview.create.mockImplementation(async ({ data }: any) => ({
      ...savedReview(),
      status: EssayReviewStatus.SUBMITTED,
      decision: EssayReviewDecision.AGREE,
      totalScore: 600,
      divergenceJson: { total: 0, maxCompetency: 0, diffs: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 }, discrepant: false },
      details: data.details.create.map((detail: any, index: number) => ({ id: `detail-${index + 1}`, ...detail })),
    }));

    const result = await service.submitReview(
      { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') } as any,
      'essay',
      {
        competencies: AI_DETAILS.map((detail) => ({
          competency: detail.competency,
          score: detail.score,
          justification: detail.justification,
          evidence: [detail.competency === 'C3' ? 'Trecho C3' : ''],
        })),
      },
    );

    expect(result).toMatchObject({
      status: EssayReviewStatus.SUBMITTED,
      decision: EssayReviewDecision.AGREE,
      validationLevel: EssayLearningLevel.STRUCTURED,
    });
    const learning = db.essayLearningRecord.createMany.mock.calls[0][0].data;
    expect(learning).toHaveLength(5);
    expect(learning.every((item: any) => item.level === EssayLearningLevel.STRUCTURED)).toBe(true);
    expect(db.essayAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REVIEW_SUBMITTED' }) }),
    );
  });

  it('registra discordância justificada com evidência e mantém o aprendizado em STRUCTURED', async () => {
    const { db, service } = setup();
    db.essayReview.create.mockImplementation(async ({ data }: any) => ({
      ...savedReview(),
      status: EssayReviewStatus.DISPUTED,
      decision: EssayReviewDecision.ADJUST,
      totalScore: 760,
      divergenceJson: { total: 160, maxCompetency: 80, diffs: { C1: 0, C2: 0, C3: 80, C4: 80, C5: 0 }, discrepant: true },
      details: data.details.create.map((detail: any, index: number) => ({ id: `detail-${index + 1}`, ...detail })),
    }));

    const result = await service.submitReview(
      { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') } as any,
      'essay',
      {
        competencies: AI_DETAILS.map((detail) => ({
          competency: detail.competency,
          score: detail.competency === 'C3' || detail.competency === 'C4' ? 200 : detail.score,
          criterion: detail.competency === 'C3' ? 'desenvolvimento argumentativo' : undefined,
          justification: detail.competency === 'C3' ? 'A explicação contextualizada demonstra desenvolvimento.' : undefined,
          evidence: detail.competency === 'C3' ? ['Trecho C3'] : undefined,
          anchorText: detail.competency === 'C3' ? 'Trecho C3' : undefined,
        })),
      },
    );

    expect(result).toMatchObject({ status: EssayReviewStatus.DISPUTED, totalScore: 760 });
    const learning = db.essayLearningRecord.createMany.mock.calls[0][0].data;
    const c3 = learning.find((item: any) => item.competency === 'C3');
    expect(c3).toMatchObject({
      aiScore: 120,
      humanScore: 200,
      criterion: 'desenvolvimento argumentativo',
      humanJustification: 'A explicação contextualizada demonstra desenvolvimento.',
      level: EssayLearningLevel.STRUCTURED,
      anonymized: false,
    });
    expect(c3.evidence).toContain('Trecho C3');
  });

  it('não aceita concordância quando as notas divergem', async () => {
    const { service } = setup();
    await expect(
      service.submitReview(
        { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') } as any,
        'essay',
        {
          decision: EssayReviewDecision.AGREE,
          competencies: AI_DETAILS.map((detail) => ({
            competency: detail.competency,
            score: detail.competency === 'C3' ? 160 : detail.score,
          })),
        },
      ),
    ).rejects.toThrow('Para concordar');
  });
});

describe('EssayReviewService — validação e governança', () => {
  const reviewForValidation = (overrides: Record<string, unknown> = {}) =>
    savedReview({
      evaluatorId: 'teacher',
      essay: { id: 'essay', userId: 'student' },
      learningRecords: [
        { id: 'learning-1', level: EssayLearningLevel.STRUCTURED, anonymized: false, consentAt: null },
      ],
      ...overrides,
    });

  it('coordenador valida com consentimento e os exemplos passam a ser anonimizados', async () => {
    const { db, service } = setup();
    const review = reviewForValidation();
    db.essayReview.findUnique.mockResolvedValue(review);
    db.essayReview.update.mockImplementation(async ({ data }: any) => ({
      ...savedReview(),
      ...data,
      validatedByUser: { id: 'coord', profile: profile('Coordenação', 'A') },
    }));

    const result = await service.validateReview(
      { id: 'coord', accountType: AccountType.COORDINATOR, profile: profile('Coordenação', 'A') } as any,
      'review',
      { level: EssayLearningLevel.VALIDATED, consentConfirmed: true, notes: 'Critério consistente.' },
    );

    expect(result).toMatchObject({ validationLevel: EssayLearningLevel.VALIDATED });
    expect(db.essayLearningRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: EssayLearningLevel.VALIDATED, anonymized: true }),
      }),
    );
    expect(db.essayAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REVIEW_VALIDATED' }) }),
    );
  });

  it('impede que o próprio avaliador valide a revisão', async () => {
    const { db, service } = setup();
    db.essayReview.findUnique.mockResolvedValue(reviewForValidation());
    await expect(
      service.validateReview(
        { id: 'teacher', accountType: AccountType.COORDINATOR, profile: profile('Professor', 'A') } as any,
        'review',
        { level: EssayLearningLevel.VALIDATED },
      ),
    ).rejects.toThrow('não pode validar a própria revisão');
  });

  it('exige validação independente antes de consolidar', async () => {
    const { db, service } = setup();
    db.essayReview.findUnique.mockResolvedValue(reviewForValidation());
    await expect(
      service.validateReview(
        { id: 'coord', accountType: AccountType.COORDINATOR, profile: profile('Coordenação', 'A') } as any,
        'review',
        { level: EssayLearningLevel.CONSOLIDATED, consentConfirmed: true },
      ),
    ).rejects.toThrow('Consolide somente depois');
  });

  it('exige consentimento para consolidar um aprendizado validado', async () => {
    const { db, service } = setup();
    db.essayReview.findUnique.mockResolvedValue(
      reviewForValidation({
        validationLevel: EssayLearningLevel.VALIDATED,
        learningRecords: [{ id: 'learning-1', level: EssayLearningLevel.VALIDATED, anonymized: false, consentAt: null }],
      }),
    );
    await expect(
      service.validateReview(
        { id: 'coord', accountType: AccountType.COORDINATOR, profile: profile('Coordenação', 'A') } as any,
        'review',
        { level: EssayLearningLevel.CONSOLIDATED },
      ),
    ).rejects.toThrow('consentimento');
  });
});

describe('EssayReviewService — chat contextual', () => {
  it('usa RAG oficial, ignora exemplos não validados e exclui a própria redação da recuperação', async () => {
    const { db, ai, service } = setup();
    db.essayLearningRecord.findMany.mockResolvedValue([
      { id: 'example-1', competency: 'C3', criterion: 'desenvolvimento', learning: 'Explicação contextualizada basta.', humanScore: 160, evidence: 'Trecho anonimizado' },
    ]);
    db.essayReviewMessage.create
      .mockImplementationOnce(async ({ data }: any) => ({ id: 'message-user', ...data, createdAt: NOW }))
      .mockImplementationOnce(async ({ data }: any) => ({ id: 'message-ai', ...data, createdAt: NOW }));

    const result = await service.chat(
      { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') } as any,
      'essay',
      { message: 'Por que a C3 ficou em 120?', competency: 'C3', anchorText: 'Trecho C3' },
    );

    expect(db.essayLearningRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          level: { in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] },
          anonymized: true,
          consentAt: { not: null },
          essayId: { not: 'essay' },
        }),
      }),
    );
    expect(ai.generateStructured).toHaveBeenCalledOnce();
    const prompt = ai.generateStructured.mock.calls[0][0].prompt;
    expect(prompt).toContain('[c3-niveis]');
    expect(prompt).toContain('Explicação contextualizada basta.');
    expect(prompt).toContain('Trecho C3');
    expect(result.citations.some((citation: any) => citation.id === 'c3-niveis')).toBe(true);
    expect(result.messages[1].content).toContain('Não consegui acionar o modelo');
    expect(result.messages[1].role).toBe('AI');
  });

  it('preserva a resposta do modelo e o modelo usado quando há provedor', async () => {
    const { db, ai, service } = setup();
    ai.generateStructured.mockResolvedValue({ text: 'A divergência está no critério de desenvolvimento.', model: 'modelo-teste' });
    db.essayReviewMessage.create
      .mockImplementationOnce(async ({ data }: any) => ({ id: 'message-user', ...data, createdAt: NOW }))
      .mockImplementationOnce(async ({ data }: any) => ({ id: 'message-ai', ...data, createdAt: NOW }));

    const result = await service.chat(
      { id: 'teacher', accountType: AccountType.TEACHER, profile: profile('Professor', 'A') } as any,
      'essay',
      { message: 'Explique a divergência.', competency: 'C3' },
    );

    expect(result.model).toBe('modelo-teste');
    expect(result.messages[1].content).toBe('A divergência está no critério de desenvolvimento.');
    expect(result.messages[1].model).toBe('modelo-teste');
  });

  it('não abre o chat para o autor da redação', async () => {
    const { service } = setup();
    await expect(
      service.chat(
        { id: 'student', accountType: AccountType.STUDENT_INDEPENDENT, profile: profile('Aluno', 'Um') } as any,
        'essay',
        { message: 'Por que minha nota foi essa?' },
      ),
    ).rejects.toThrow('Somente professores');
  });
});

describe('EssayReviewService — privacidade e relatórios', () => {
  it('aluno vê apenas revisões validadas e não recebe o chat bruto', async () => {
    const { db, service } = setup();
    db.essayReview.findMany.mockResolvedValue([]);
    db.essayLearningRecord.findMany.mockResolvedValue([]);

    const result = await service.getWorkspace(
      { id: 'student', accountType: AccountType.STUDENT_INDEPENDENT, profile: profile('Aluno', 'Um') } as any,
      'essay',
    );

    expect(result.canReview).toBe(false);
    expect(result.messages).toEqual([]);
    const reviewWhere = db.essayReview.findMany.mock.calls[0][0].where;
    expect(reviewWhere.validationLevel).toEqual({ in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] });
    const learningWhere = db.essayLearningRecord.findMany.mock.calls[0][0].where;
    expect(learningWhere).toMatchObject({ anonymized: true, consentAt: { not: null } });
    expect(db.essayReviewMessage.findMany).not.toHaveBeenCalled();
  });

  it('autor não abre por id uma revisão ainda não validada', async () => {
    const { db, service } = setup();
    db.essayReview.findUnique.mockResolvedValue({
      ...savedReview(),
      validationLevel: EssayLearningLevel.STRUCTURED,
      essay: { id: 'essay', userId: 'student', title: 'Redação', theme: 'Tema', version: 1 },
      learningRecords: [],
    });

    await expect(
      service.getReview(
        { id: 'student', accountType: AccountType.STUDENT_INDEPENDENT, profile: profile('Aluno', 'Um') } as any,
        'review',
      ),
    ).rejects.toThrow('não encontrada');
  });

  it('agrega divergências por competência e critérios recorrentes', async () => {
    const { db, service } = setup();
    db.essayReview.findMany.mockResolvedValue([
      {
        id: 'review-1',
        essayId: 'essay',
        aiTotalScore: 600,
        totalScore: 760,
        status: EssayReviewStatus.DISPUTED,
        validationLevel: EssayLearningLevel.VALIDATED,
        essay: { id: 'essay', title: 'Redação', theme: 'Tema' },
        details: [
          { competency: 'C3', aiScore: 120, humanScore: 200, criterion: 'desenvolvimento argumentativo', justification: 'Contexto suficiente.' },
          { competency: 'C4', aiScore: 120, humanScore: 160, criterion: 'coesão', justification: 'Conectivo implícito.' },
        ],
      },
      {
        id: 'review-2',
        essayId: 'essay-2',
        aiTotalScore: 600,
        totalScore: 640,
        status: EssayReviewStatus.SUBMITTED,
        validationLevel: EssayLearningLevel.STRUCTURED,
        essay: { id: 'essay-2', title: 'Redação 2', theme: 'Tema' },
        details: [
          { competency: 'C3', aiScore: 160, humanScore: 160, criterion: 'desenvolvimento argumentativo', justification: null },
        ],
      },
    ]);

    const report = await service.divergences(
      { id: 'coord', accountType: AccountType.COORDINATOR, profile: profile('Coordenação', 'A') } as any,
    );

    expect(report.summary).toMatchObject({ reviews: 2, disputed: 1, validated: 1, consolidated: 0 });
    const c3 = report.byCompetency.find((item: any) => item.competency === 'C3');
    expect(c3).toMatchObject({ reviews: 2, disagreements: 1, maxDifference: 80 });
    expect(report.summary.topCriteria[0]).toMatchObject({ criterion: 'desenvolvimento argumentativo', count: 2 });
    expect(report.note).toContain('não substitui');
  });
});

describe('Prompt do chat de revisão', () => {
  it('separa critério oficial, interpretação profissional e interpretação da IA', () => {
    const { system, prompt } = buildReviewChatPrompt({
      essay: { title: 'Título', theme: 'Tema', content: 'Texto da redação.' },
      ai: { totalScore: 600, generalFeedback: 'Comentário', competencies: AI_DETAILS.map((detail) => ({ ...detail, evidence: ['Trecho C1'] })) },
      history: [],
      question: 'Discordo da C3.',
      competency: 'C3',
      hits: [],
      learningExamples: [],
    });
    expect(system).toContain('CRITÉRIO OFICIAL');
    expect(system).toContain('INTERPRETAÇÃO PROFISSIONAL');
    expect(system).toContain('INTERPRETAÇÃO DA IA');
    expect(system).toContain('não altera a nota');
    expect(prompt).toContain('<redacao>');
    expect(prompt).toContain('<contexto_oficial>');
  });

  it('fallback de nota final mostra o total e pede a competência a revisar', () => {
    const reply = fallbackReviewReply({
      essay: { title: '', theme: '', content: '' },
      ai: {
        totalScore: 600,
        generalFeedback: null,
        competencies: AI_DETAILS.map((detail) => ({ ...detail, evidence: ['Trecho'] })),
      },
      humanScores: { C1: 120, C2: 120, C3: 160, C4: 120, C5: 120 },
      history: [],
      question: 'A nota final deveria ser maior.',
      hits: [],
      learningExamples: [],
    });
    expect(reply).toContain('600 pontos no total');
    expect(reply).toContain('soma 640 pontos');
    expect(reply).toContain('nota final');
    expect(reply).toContain('critério oficial');
  });

  it('fallback não cria nota nova e pede critério e evidência', () => {
    const reply = fallbackReviewReply({
      essay: { title: '', theme: '', content: '' },
      ai: {
        totalScore: 600,
        generalFeedback: null,
        competencies: [{ competency: 'C3', score: 120, justification: 'Argumentos limitados.', evidence: ['Trecho C3'] }],
      },
      humanScores: { C3: 160 },
      history: [],
      question: 'Quero 160.',
      competency: 'C3',
      hits: [],
      learningExamples: [],
    });
    expect(reply).toContain('120 pontos');
    expect(reply).toContain('160 pontos');
    expect(reply).toContain('critério oficial');
    expect(reply).toContain('decisão final');
  });
});
