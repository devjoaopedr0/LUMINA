import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AccountType,
  EssayAuditAction,
  EssayLearningLevel,
  EssayReviewDecision,
  EssayReviewMessageRole,
  EssayReviewStatus,
  EssayCorrectionStatus,
  Prisma,
  WorkspaceMemberStatus,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { COMPETENCY_IDS, CompetencyId } from '../essay-correction/knowledge';
import { CompetencyEvaluation, discrepancyBetween, EvaluatorRun } from '../essay-correction/grading/essay-grader';
import { EssayKnowledgeBase } from '../essay-correction/rag/knowledge-base';
import { UserWithProfile } from '../users/users.repository';
import { WORKSPACE_PERMISSIONS } from '../workspaces/workspace-permissions.constants';
import {
  CreateEssayLearningDto,
  EssayReviewChatDto,
  SubmitEssayReviewDto,
  ValidateEssayReviewDto,
} from './essay-review.dto';
import {
  buildReviewChatPrompt,
  COMPETENCY_LABELS,
  fallbackReviewReply,
  REVIEW_CHAT_PROMPT_VERSION,
  ReviewChatLearningExample,
} from './essay-review.prompt';

const REVIEWER_ROLES = new Set<AccountType>([
  AccountType.TEACHER,
  AccountType.COORDINATOR,
  AccountType.DIRECTOR,
  AccountType.ADMIN,
]);
const VALIDATOR_ROLES = new Set<AccountType>([AccountType.COORDINATOR, AccountType.DIRECTOR, AccountType.ADMIN]);
const REVIEW_PERMISSIONS = [WORKSPACE_PERMISSIONS.ESSAY_REVIEW, WORKSPACE_PERMISSIONS.REPORT_VIEW, WORKSPACE_PERMISSIONS.CLASS_MANAGE];
const VALIDATE_PERMISSIONS = [WORKSPACE_PERMISSIONS.ESSAY_VALIDATE, WORKSPACE_PERMISSIONS.CLASS_MANAGE];

type EssayWithCorrection = Prisma.EssayGetPayload<{
  include: {
    correction: { include: { details: true } };
    user: { select: { id: true; accountType: true; profile: { select: { firstName: true; lastName: true } } } };
    scans: { select: { id: true; status: true; transcribedText: true; lineCount: true; illegibleWords: true; ocrConfidence: true; warningsJson: true; createdAt: true } };
  };
}>;

type ReviewWithDetails = Prisma.EssayReviewGetPayload<{
  include: {
    details: true;
    evaluator: { select: { id: true; accountType: true; profile: { select: { firstName: true; lastName: true } } } };
    validatedByUser: { select: { id: true; profile: { select: { firstName: true; lastName: true } } } };
  };
}>;

@Injectable()
export class EssayReviewService {
  private readonly logger = new Logger(EssayReviewService.name);
  private readonly knowledge = new EssayKnowledgeBase();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ leitura

  async getWorkspace(user: UserWithProfile, essayId: string) {
    const essay = await this.loadEssay(essayId);
    const hasAccess = await this.hasEssayAccess(user, essay);
    if (!hasAccess) throw new ForbiddenException('Você não possui acesso a esta redação.');

    const isOwner = essay.userId === user.id;
    const canReview =
      !isOwner &&
      REVIEWER_ROLES.has(user.accountType) &&
      essay.correction?.status === EssayCorrectionStatus.COMPLETED;
    const canValidate =
      !isOwner &&
      (VALIDATOR_ROLES.has(user.accountType) || (await this.hasWorkspacePermission(user.id, essay.userId, VALIDATE_PERMISSIONS)));

    const reviews = await this.prisma.essayReview.findMany({
      where: {
        essayId,
        ...(isOwner && !canReview
          ? { validationLevel: { in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] } }
          : {}),
      },
      include: {
        details: true,
        evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
        validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const [messages, learning] = await Promise.all([
      canReview
        ? this.prisma.essayReviewMessage.findMany({
            where: { essayId },
            include: { author: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
            orderBy: { createdAt: 'asc' },
            take: 200,
          })
        : Promise.resolve([]),
      this.prisma.essayLearningRecord.findMany({
        where: {
          essayId,
          archivedAt: null,
          ...(isOwner && !canReview
            ? {
                level: { in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] },
                anonymized: true,
                consentAt: { not: null },
              }
            : {}),
        },
        include: {
          createdByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);

    return {
      essay: this.essayResponse(essay),
      correction: essay.correction
        ? {
            id: essay.correction.id,
            status: essay.correction.status,
            totalScore: essay.correction.totalScore,
            generalFeedback: essay.correction.generalFeedback,
            essayVersion: essay.correction.essayVersion,
            updatedAt: essay.correction.updatedAt,
            confidence: essay.correction.confidence,
            annulmentJson: essay.correction.annulmentJson,
            auditJson: essay.correction.auditJson,
            competenciesJson: essay.correction.competenciesJson,
            details: essay.correction.details.map((detail) => ({
              competency: detail.competency,
              score: detail.score,
              justification: detail.justification,
              evidenceJson: detail.evidenceJson,
            })),
          }
        : null,
      reviews,
      messages,
      learning,
      canReview,
      canValidate,
      latestReview: reviews[0] ?? null,
      knowledge: {
        activeDocument: this.knowledge.currentDocument(),
        promptVersion: REVIEW_CHAT_PROMPT_VERSION,
      },
    };
  }

  async getReview(user: UserWithProfile, reviewId: string) {
    const review = await this.prisma.essayReview.findUnique({
      where: { id: reviewId },
      include: {
        details: true,
        evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
        validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        essay: { select: { id: true, userId: true, title: true, theme: true, version: true } },
        learningRecords: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!review) throw new NotFoundException('Revisão não encontrada.');
    const essay = await this.loadEssay(review.essayId);
    if (!(await this.hasEssayAccess(user, essay))) throw new ForbiddenException('Você não possui acesso a esta revisão.');
    this.assertOwnerCanSeeReview(user, essay, review);
    return this.reviewResponse(review);
  }

  async getAudit(user: UserWithProfile, reviewId: string) {
    const review = await this.prisma.essayReview.findUnique({
      where: { id: reviewId },
      select: { essayId: true, validationLevel: true },
    });
    if (!review) throw new NotFoundException('Revisão não encontrada.');
    const essay = await this.loadEssay(review.essayId);
    if (!(await this.hasEssayAccess(user, essay))) throw new ForbiddenException('Você não possui acesso a esta revisão.');
    this.assertOwnerCanSeeReview(user, essay, review);

    const events = await this.prisma.essayAuditEvent.findMany({
      where: { entity: 'EssayReview', entityId: reviewId },
      include: { actor: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return { reviewId, events };
  }

  async queue(user: UserWithProfile, status?: EssayReviewStatus) {
    if (!REVIEWER_ROLES.has(user.accountType)) {
      throw new ForbiddenException('Somente avaliadores podem consultar a fila de revisão.');
    }
    const scope = await this.reviewScopeWhere(user);
    const rows = await this.prisma.essayReview.findMany({
      where: { ...(scope ? { AND: [scope] } : {}), ...(status ? { status } : {}) },
      include: {
        essay: {
          select: {
            id: true,
            title: true,
            theme: true,
            version: true,
            userId: true,
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        evaluator: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        details: { select: { competency: true, aiScore: true, humanScore: true, decision: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 150,
    });

    return {
      items: rows.map((review) => ({
        id: review.id,
        status: review.status,
        validationLevel: review.validationLevel,
        totalScore: review.totalScore,
        aiTotalScore: review.aiTotalScore,
        divergence: review.divergenceJson,
        updatedAt: review.updatedAt,
        evaluator: {
          id: review.evaluator.id,
          name: this.displayName(review.evaluator.profile),
        },
        essay: {
          id: review.essay.id,
          title: review.essay.title,
          theme: review.essay.theme,
          version: review.essay.version,
          owner: this.displayName(review.essay.user.profile),
        },
        competencies: review.details,
      })),
    };
  }

  async divergences(user: UserWithProfile) {
    if (!REVIEWER_ROLES.has(user.accountType)) {
      throw new ForbiddenException('Somente avaliadores podem consultar os relatórios de divergência.');
    }
    const scope = await this.reviewScopeWhere(user);
    const reviews = await this.prisma.essayReview.findMany({
      where: scope ? { AND: [scope] } : {},
      include: {
        details: true,
        essay: { select: { id: true, title: true, theme: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });

    const byCompetency = Object.fromEntries(
      COMPETENCY_IDS.map((id) => [
        id,
        {
          competency: id,
          label: COMPETENCY_LABELS[id],
          reviews: 0,
          disagreements: 0,
          averageDifference: 0,
          averageSignedDifference: 0,
          maxDifference: 0,
          criteria: {} as Record<string, number>,
          examples: [] as { reviewId: string; essayId: string; aiScore: number; humanScore: number; justification: string | null }[],
        },
      ]),
    ) as Record<
      CompetencyId,
      {
        competency: CompetencyId;
        label: string;
        reviews: number;
        disagreements: number;
        averageDifference: number;
        averageSignedDifference: number;
        maxDifference: number;
        criteria: Record<string, number>;
        examples: { reviewId: string; essayId: string; aiScore: number; humanScore: number; justification: string | null }[];
      }
    >;

    const summary = {
      reviews: reviews.length,
      disputed: 0,
      validated: 0,
      consolidated: 0,
      averageTotalDifference: 0,
      totalDifferenceSum: 0,
      topCriteria: {} as Record<string, number>,
    };

    for (const review of reviews) {
      if (review.status === EssayReviewStatus.DISPUTED) summary.disputed += 1;
      if (review.validationLevel === EssayLearningLevel.VALIDATED) summary.validated += 1;
      if (review.validationLevel === EssayLearningLevel.CONSOLIDATED) summary.consolidated += 1;
      summary.totalDifferenceSum += review.totalScore - review.aiTotalScore;
      for (const detail of review.details) {
        const bucket = byCompetency[detail.competency as CompetencyId];
        if (!bucket) continue;
        const difference = detail.humanScore - detail.aiScore;
        bucket.reviews += 1;
        bucket.averageDifference += Math.abs(difference);
        bucket.averageSignedDifference += difference;
        bucket.maxDifference = Math.max(bucket.maxDifference, Math.abs(difference));
        if (difference !== 0) bucket.disagreements += 1;
        if (detail.criterion) {
          const key = detail.criterion.trim();
          bucket.criteria[key] = (bucket.criteria[key] ?? 0) + 1;
          summary.topCriteria[key] = (summary.topCriteria[key] ?? 0) + 1;
        }
        if (difference !== 0 && bucket.examples.length < 4) {
          bucket.examples.push({
            reviewId: review.id,
            essayId: review.essayId,
            aiScore: detail.aiScore,
            humanScore: detail.humanScore,
            justification: detail.justification,
          });
        }
      }
    }

    for (const bucket of Object.values(byCompetency)) {
      if (bucket.reviews) {
        bucket.averageDifference = Number((bucket.averageDifference / bucket.reviews).toFixed(2));
        bucket.averageSignedDifference = Number((bucket.averageSignedDifference / bucket.reviews).toFixed(2));
      }
    }

    return {
      summary: {
        ...summary,
        averageTotalDifference: reviews.length ? Number((summary.totalDifferenceSum / reviews.length).toFixed(2)) : 0,
        totalDifferenceSum: undefined,
        topCriteria: Object.entries(summary.topCriteria)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([criterion, count]) => ({ criterion, count })),
      },
      byCompetency: Object.values(byCompetency),
      note: 'Relatório descritivo. Média de notas não substitui a análise técnica de cada divergência.',
    };
  }

  // ------------------------------------------------------------- revisão/notas

  async submitReview(user: UserWithProfile, essayId: string, dto: SubmitEssayReviewDto) {
    const essay = await this.loadEssay(essayId);
    await this.assertCanReview(user, essay);
    if (!essay.correction || essay.correction.status !== EssayCorrectionStatus.COMPLETED) {
      throw new ConflictException('A correção por IA ainda não foi concluída.');
    }
    if (essay.correction.essayVersion !== null && essay.correction.essayVersion !== essay.version) {
      throw new ConflictException('A correção está desatualizada em relação à versão atual da redação. Peça uma nova correção antes de revisar.');
    }

    const byCompetency = new Map(dto.competencies.map((item) => [item.competency, item]));
    if (byCompetency.size !== 5 || COMPETENCY_IDS.some((id) => !byCompetency.has(id))) {
      throw new BadRequestException('Envie exatamente as cinco competências, sem repetição.');
    }

    const aiDetails = new Map(essay.correction.details.map((detail) => [detail.competency, detail]));
    if (COMPETENCY_IDS.some((id) => !aiDetails.has(id))) {
      throw new ConflictException('A correção da IA não possui as cinco competências.');
    }

    const aiScores = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, aiDetails.get(id)!.score])) as Record<CompetencyId, number>;
    const humanScores = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, byCompetency.get(id)!.score])) as Record<CompetencyId, number>;
    const aiTotalScore = COMPETENCY_IDS.reduce((sum, id) => sum + aiScores[id], 0);
    const totalScore = COMPETENCY_IDS.reduce((sum, id) => sum + humanScores[id], 0);
    const allAgree = COMPETENCY_IDS.every((id) => humanScores[id] === aiScores[id]);
    const decision = dto.decision ?? (allAgree ? EssayReviewDecision.AGREE : EssayReviewDecision.ADJUST);
    if (decision === EssayReviewDecision.AGREE && !allAgree) {
      throw new BadRequestException('Para concordar, as cinco notas precisam ser iguais às da IA. Use ADJUST ou DISAGREE quando houver mudança.');
    }
    if (decision === EssayReviewDecision.DISAGREE && allAgree) {
      throw new BadRequestException('Não há divergência de nota para registrar como DISAGREE.');
    }

    const aiJustifications = Object.fromEntries(
      COMPETENCY_IDS.map((id) => [id, aiDetails.get(id)!.justification ?? '']),
    ) as Record<CompetencyId, string>;
    const humanJustifications = Object.fromEntries(
      COMPETENCY_IDS.map((id) => [id, byCompetency.get(id)!.justification ?? '']),
    ) as Record<CompetencyId, string>;
    const aiRun = this.runFromScores('IA', aiScores, aiJustifications);
    const humanRun = this.runFromScores('Avaliador', humanScores, humanJustifications);
    const divergence = discrepancyBetween(aiRun, humanRun);
    const status = divergence.discrepant ? EssayReviewStatus.DISPUTED : EssayReviewStatus.SUBMITTED;
    const essayVersion = essay.correction.essayVersion ?? essay.version;
    const existing = await this.prisma.essayReview.findFirst({
      where: { correctionId: essay.correction.id, evaluatorId: user.id, essayVersion },
      include: {
        details: true,
        evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
        validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    const detailsData = dto.competencies.map((item) => {
      const ai = aiDetails.get(item.competency)!;
      const changed = item.score !== ai.score;
      return {
        competency: item.competency,
        aiScore: ai.score,
        humanScore: item.score,
        decision: item.decision ?? (changed ? decision : EssayReviewDecision.AGREE),
        criterion: item.criterion?.trim() || null,
        justification: item.justification?.trim() || null,
        evidenceJson: this.evidenceJson(item.evidence, item.anchorText),
      };
    });

    const review = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      let saved: ReviewWithDetails;
      if (existing) {
        if (existing.validationLevel === EssayLearningLevel.VALIDATED || existing.validationLevel === EssayLearningLevel.CONSOLIDATED) {
          await tx.essayAuditEvent.create({
            data: {
              actorId: user.id,
              action: EssayAuditAction.REVIEW_RESET,
              entity: 'EssayReview',
              entityId: existing.id,
              beforeJson: { validationLevel: existing.validationLevel } as Prisma.InputJsonValue,
              afterJson: { validationLevel: EssayLearningLevel.STRUCTURED } as Prisma.InputJsonValue,
              metadataJson: { reason: 'avaliador alterou a revisão depois da validação' } as Prisma.InputJsonValue,
            },
          });
        }
        saved = await tx.essayReview.update({
          where: { id: existing.id },
          data: {
            evaluatorRole: user.accountType,
            status,
            decision,
            aiCompetenciesJson: aiScores as unknown as Prisma.InputJsonValue,
            aiTotalScore,
            aiGeneralFeedback: essay.correction!.generalFeedback,
            competenciesJson: humanScores as unknown as Prisma.InputJsonValue,
            totalScore,
            generalFeedback: dto.generalFeedback?.trim() || null,
            divergenceJson: divergence as unknown as Prisma.InputJsonValue,
            validationLevel: EssayLearningLevel.STRUCTURED,
            validatedBy: null,
            validatedAt: null,
            validationNotes: null,
            submittedAt: now,
            details: { deleteMany: {}, create: detailsData },
          },
          include: {
            details: true,
            evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
            validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        });
      } else {
        saved = await tx.essayReview.create({
          data: {
            essayId,
            correctionId: essay.correction!.id,
            essayVersion,
            evaluatorId: user.id,
            evaluatorRole: user.accountType,
            status,
            decision,
            aiCompetenciesJson: aiScores as unknown as Prisma.InputJsonValue,
            aiTotalScore,
            aiGeneralFeedback: essay.correction!.generalFeedback,
            competenciesJson: humanScores as unknown as Prisma.InputJsonValue,
            totalScore,
            generalFeedback: dto.generalFeedback?.trim() || null,
            divergenceJson: divergence as unknown as Prisma.InputJsonValue,
            validationLevel: EssayLearningLevel.STRUCTURED,
            submittedAt: now,
            details: { create: detailsData },
          },
          include: {
            details: true,
            evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
            validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        });
      }

      const archived = await tx.essayLearningRecord.updateMany({
        where: { reviewId: saved.id, archivedAt: null },
        data: { archivedAt: now },
      });
      if (archived.count) {
        await tx.essayAuditEvent.create({
          data: {
            actorId: user.id,
            action: EssayAuditAction.LEARNING_ARCHIVED,
            entity: 'EssayReview',
            entityId: saved.id,
            metadataJson: { archived: archived.count, reason: 'nova versão da revisão' } as Prisma.InputJsonValue,
          },
        });
      }

      const detailsByCompetency = new Map(saved.details.map((detail) => [detail.competency, detail]));
      const learningData = COMPETENCY_IDS.map((id) => {
        const detail = detailsByCompetency.get(id)!;
        const ai = aiDetails.get(id)!;
        const item = byCompetency.get(id)!;
        const difference = item.score - ai.score;
        const criterion = item.criterion?.trim() || null;
        const justification = item.justification?.trim() || null;
        const evidence = item.evidence?.join('\n') || item.anchorText?.trim() || null;
        return {
          essayId,
          correctionId: essay.correction!.id,
          reviewId: saved.id,
          reviewDetailId: detail.id,
          competency: id,
          criterion,
          aiScore: ai.score,
          humanScore: item.score,
          evidence,
          aiJustification: ai.justification,
          humanJustification: justification,
          divergenceReason: difference === 0 ? 'concordância' : 'nota diferente da IA',
          decision: detail.decision,
          learning:
            difference === 0
              ? `O avaliador confirmou ${ai.score} pontos em ${id} (${COMPETENCY_LABELS[id]}).${criterion ? ` Critério: ${criterion}.` : ''}${justification ? ` Justificativa: ${justification}` : ''}`
              : `Em ${id} (${COMPETENCY_LABELS[id]}), a IA atribuiu ${ai.score} e o avaliador propôs ${item.score} (${difference > 0 ? '+' : ''}${difference}).${criterion ? ` Critério discutido: ${criterion}.` : ''}${justification ? ` Justificativa: ${justification}` : ''}`,
          confidence: null,
          applicability: null,
          level: EssayLearningLevel.STRUCTURED,
          origin: 'HUMAN_REVIEW',
          anonymized: false,
          createdBy: user.id,
        };
      });
      await tx.essayLearningRecord.createMany({ data: learningData });
      await tx.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: EssayAuditAction.REVIEW_SUBMITTED,
          entity: 'EssayReview',
          entityId: saved.id,
          beforeJson: existing ? this.reviewSnapshot(existing) : Prisma.DbNull,
          afterJson: this.reviewSnapshot(saved),
          metadataJson: { essayId, essayVersion, learningCreated: learningData.length } as Prisma.InputJsonValue,
        },
      });
      return saved;
    });

    return this.reviewResponse(review);
  }

  // --------------------------------------------------------------- chat/RAG

  async chat(user: UserWithProfile, essayId: string, dto: EssayReviewChatDto) {
    const essay = await this.loadEssay(essayId);
    await this.assertCanReview(user, essay);
    if (!essay.correction || essay.correction.status !== EssayCorrectionStatus.COMPLETED) {
      throw new ConflictException('A correção por IA ainda não está disponível para conversa.');
    }

    const competency = dto.competency as CompetencyId | undefined;
    const historyRows = await this.prisma.essayReviewMessage.findMany({
      where: { essayId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const history = historyRows
      .reverse()
      .filter((message) => message.role !== EssayReviewMessageRole.SYSTEM)
      .map((message) => ({ role: message.role === EssayReviewMessageRole.EVALUATOR ? ('EVALUATOR' as const) : ('AI' as const), content: message.content }));

    const query = [dto.message, dto.anchorText, competency].filter(Boolean).join(' ');
    const hits = competency
      ? this.knowledge.contextFor(competency, query, 3)
      : this.knowledge.search(query, { limit: 5, includeGeneral: true });

    const learning = await this.prisma.essayLearningRecord.findMany({
      where: {
        competency: competency ?? undefined,
        level: { in: [EssayLearningLevel.VALIDATED, EssayLearningLevel.CONSOLIDATED] },
        archivedAt: null,
        anonymized: true,
        consentAt: { not: null },
        essayId: { not: essayId },
      },
      orderBy: { validatedAt: 'desc' },
      take: 3,
      select: { id: true, competency: true, criterion: true, learning: true, humanScore: true, evidence: true },
    });

    const aiCompetencies = COMPETENCY_IDS.map((id) => {
      const detail = essay.correction!.details.find((item) => item.competency === id);
      const evidence = this.aiEvidence(detail?.evidenceJson);
      return {
        competency: id,
        score: detail?.score ?? 0,
        justification: detail?.justification ?? null,
        evidence,
      };
    });
    const relevantReview = dto.reviewId
      ? await this.prisma.essayReview.findFirst({ where: { id: dto.reviewId, essayId }, select: { competenciesJson: true } })
      : await this.prisma.essayReview.findFirst({
          where: { essayId, evaluatorId: user.id },
          orderBy: { updatedAt: 'desc' },
          select: { competenciesJson: true },
        });

    const humanScores = (relevantReview?.competenciesJson ?? null) as Partial<Record<CompetencyId, number>> | null;
    const context = {
      essay: { title: essay.title, theme: essay.theme, content: essay.content },
      ai: {
        totalScore: essay.correction.totalScore,
        generalFeedback: essay.correction.generalFeedback,
        competencies: aiCompetencies,
      },
      humanScores: humanScores ?? undefined,
      history,
      question: dto.message,
      competency,
      anchorText: dto.anchorText,
      hits,
      learningExamples: learning as ReviewChatLearningExample[],
    };
    const { system, prompt, citations } = buildReviewChatPrompt(context);

    let content: string | null = null;
    let model: string | null = null;
    try {
      const generated = await this.ai.generateStructured({
        system,
        prompt,
        maxTokens: 900,
        timeoutMs: 30_000,
        temperature: 0.2,
      });
      if (generated?.text?.trim()) {
        content = generated.text.trim();
        model = generated.model;
      }
    } catch (error) {
      this.logger.warn(`Chat de revisão falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!content) content = fallbackReviewReply(context);

    const reviewId = dto.reviewId && (await this.prisma.essayReview.count({ where: { id: dto.reviewId, essayId } })) ? dto.reviewId : null;
    const saved = await this.prisma.$transaction(async (tx) => {
      const evaluatorMessage = await tx.essayReviewMessage.create({
        data: {
          essayId,
          correctionId: essay.correction!.id,
          reviewId,
          authorId: user.id,
          role: EssayReviewMessageRole.EVALUATOR,
          content: dto.message,
          anchorJson: dto.anchorText ? ({ text: dto.anchorText } as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      const aiMessage = await tx.essayReviewMessage.create({
        data: {
          essayId,
          correctionId: essay.correction!.id,
          reviewId,
          role: EssayReviewMessageRole.AI,
          content,
          citationsJson: citations as unknown as Prisma.InputJsonValue,
          anchorJson: dto.anchorText ? ({ text: dto.anchorText } as Prisma.InputJsonValue) : Prisma.DbNull,
          model,
        },
      });
      await tx.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: EssayAuditAction.MESSAGE_CREATED,
          entity: 'EssayReview',
          entityId: reviewId ?? evaluatorMessage.id,
          metadataJson: {
            essayId,
            evaluatorMessageId: evaluatorMessage.id,
            aiMessageId: aiMessage.id,
            model,
            promptVersion: REVIEW_CHAT_PROMPT_VERSION,
            citations: citations.map((citation) => citation.id),
          } as Prisma.InputJsonValue,
        },
      });
      return { evaluatorMessage, aiMessage };
    });

    return {
      messages: [saved.evaluatorMessage, saved.aiMessage],
      citations,
      model,
      promptVersion: REVIEW_CHAT_PROMPT_VERSION,
    };
  }

  async createLearning(user: UserWithProfile, essayId: string, dto: CreateEssayLearningDto) {
    const essay = await this.loadEssay(essayId);
    await this.assertCanReview(user, essay);
    const review = await this.prisma.essayReview.findFirst({
      where: { essayId, evaluatorId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, correctionId: true },
    });
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.essayLearningRecord.create({
        data: {
          essayId,
          correctionId: review?.correctionId ?? essay.correction?.id ?? null,
          reviewId: review?.id ?? null,
          competency: dto.competency,
          criterion: dto.criterion?.trim() || null,
          evidence: dto.evidence?.trim() || null,
          humanJustification: dto.justification?.trim() || null,
          decision: EssayReviewDecision.ADJUST,
          learning: dto.learning.trim(),
          applicability: dto.applicability?.trim() || null,
          confidence: dto.confidence ?? null,
          level: EssayLearningLevel.RECEIVED,
          origin: 'HUMAN_CHAT',
          anonymized: false,
          createdBy: user.id,
        },
      });
      await tx.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: EssayAuditAction.LEARNING_CREATED,
          entity: 'EssayLearningRecord',
          entityId: created.id,
          afterJson: { competency: created.competency, level: created.level, origin: created.origin } as Prisma.InputJsonValue,
          metadataJson: { essayId, reviewId: review?.id ?? null } as Prisma.InputJsonValue,
        },
      });
      return created;
    });
    return record;
  }

  async deleteLearning(user: UserWithProfile, learningId: string) {
    const learning = await this.prisma.essayLearningRecord.findUnique({
      where: { id: learningId },
      include: { essay: { select: { id: true, userId: true } } },
    });
    if (!learning) throw new NotFoundException('Aprendizado não encontrado.');
    const essay = await this.loadEssay(learning.essayId);
    await this.assertCanReview(user, essay);
    if (learning.createdBy !== user.id && !VALIDATOR_ROLES.has(user.accountType)) {
      throw new ForbiddenException('Somente o autor ou um coordenador pode arquivar este aprendizado.');
    }
    await this.prisma.$transaction([
      this.prisma.essayLearningRecord.update({
        where: { id: learningId },
        data: { archivedAt: new Date() },
      }),
      this.prisma.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: EssayAuditAction.LEARNING_ARCHIVED,
          entity: 'EssayLearningRecord',
          entityId: learningId,
          beforeJson: { level: learning.level, archivedAt: learning.archivedAt?.toISOString() ?? null } as Prisma.InputJsonValue,
          afterJson: { archivedAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      }),
    ]);
    return { id: learningId, archived: true };
  }

  // ------------------------------------------------------------- validação

  async validateReview(user: UserWithProfile, reviewId: string, dto: ValidateEssayReviewDto) {
    const review = await this.prisma.essayReview.findUnique({
      where: { id: reviewId },
      include: { learningRecords: { where: { archivedAt: null } }, essay: { select: { id: true, userId: true } } },
    });
    if (!review) throw new NotFoundException('Revisão não encontrada.');
    const essay = await this.loadEssay(review.essayId);
    await this.assertCanValidate(user, essay);
    if (review.evaluatorId === user.id) {
      throw new ForbiddenException('Quem avaliou não pode validar a própria revisão. A validação exige independência.');
    }
    if (dto.level !== EssayLearningLevel.VALIDATED && dto.level !== EssayLearningLevel.CONSOLIDATED) {
      throw new BadRequestException('A validação só pode avançar para VALIDATED ou CONSOLIDATED.');
    }
    if (dto.level === EssayLearningLevel.VALIDATED && review.validationLevel === EssayLearningLevel.CONSOLIDATED) {
      throw new BadRequestException('Um aprendizado consolidado não pode ser rebaixado por este endpoint.');
    }
    if (dto.level === EssayLearningLevel.CONSOLIDATED && review.validationLevel !== EssayLearningLevel.VALIDATED) {
      throw new BadRequestException('Consolide somente depois de uma validação independente (VALIDATED).');
    }
    const alreadyConsented = review.learningRecords.length > 0 && review.learningRecords.every((record) => record.anonymized && record.consentAt);
    if (dto.level === EssayLearningLevel.CONSOLIDATED && !dto.consentConfirmed && !alreadyConsented) {
      throw new BadRequestException('Para consolidar, confirme o consentimento e a anonimização dos trechos.');
    }

    const now = new Date();
    const shouldConsent = Boolean(dto.consentConfirmed) || alreadyConsented;
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.essayReview.update({
        where: { id: reviewId },
        data: {
          validationLevel: dto.level,
          status: review.decision === EssayReviewDecision.AGREE ? EssayReviewStatus.ACCEPTED : EssayReviewStatus.DISPUTED,
          validatedBy: user.id,
          validatedAt: now,
          validationNotes: dto.notes?.trim() || null,
        },
        include: {
          details: true,
          evaluator: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
          validatedByUser: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        },
      });
      await tx.essayLearningRecord.updateMany({
        where: { reviewId, archivedAt: null },
        data: {
          level: dto.level,
          validatedBy: user.id,
          validatedAt: now,
          ...(shouldConsent ? { anonymized: true, consentAt: now } : {}),
        },
      });
      await tx.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: dto.level === EssayLearningLevel.CONSOLIDATED ? EssayAuditAction.REVIEW_CONSOLIDATED : EssayAuditAction.REVIEW_VALIDATED,
          entity: 'EssayReview',
          entityId: reviewId,
          beforeJson: { validationLevel: review.validationLevel } as Prisma.InputJsonValue,
          afterJson: {
            validationLevel: dto.level,
            consentConfirmed: shouldConsent,
            notes: dto.notes?.trim() || null,
          } as Prisma.InputJsonValue,
          metadataJson: { essayId: review.essayId, evaluatorId: review.evaluatorId } as Prisma.InputJsonValue,
        },
      });
      return saved;
    });
    // Feedback de redação (item 51): o aluno sabe que um professor revisou a correção.
    await this.notifications?.notify([review.essay.userId], {
      kind: 'essay.reviewed',
      title: 'Um professor revisou a correção da sua redação',
      body: 'Veja os comentários na sua redação.',
      link: `/app/redacoes/${review.essayId}`,
    });
    return this.reviewResponse(updated);
  }

  async validateLearning(user: UserWithProfile, learningId: string, dto: ValidateEssayReviewDto) {
    const learning = await this.prisma.essayLearningRecord.findUnique({ where: { id: learningId } });
    if (!learning) throw new NotFoundException('Aprendizado não encontrado.');
    const essay = await this.loadEssay(learning.essayId);
    await this.assertCanValidate(user, essay);
    if (learning.createdBy === user.id) {
      throw new ForbiddenException('Quem registrou o aprendizado não pode validá-lo sozinho.');
    }
    if (dto.level !== EssayLearningLevel.VALIDATED && dto.level !== EssayLearningLevel.CONSOLIDATED) {
      throw new BadRequestException('A validação só pode avançar para VALIDATED ou CONSOLIDATED.');
    }
    if (dto.level === EssayLearningLevel.VALIDATED && learning.level === EssayLearningLevel.CONSOLIDATED) {
      throw new BadRequestException('Um aprendizado consolidado não pode ser rebaixado por este endpoint.');
    }
    if (dto.level === EssayLearningLevel.CONSOLIDATED && learning.level !== EssayLearningLevel.VALIDATED) {
      throw new BadRequestException('Consolide somente depois de uma validação independente (VALIDATED).');
    }
    if (dto.level === EssayLearningLevel.CONSOLIDATED && !dto.consentConfirmed && !(learning.anonymized && learning.consentAt)) {
      throw new BadRequestException('Para consolidar, confirme o consentimento e a anonimização dos trechos.');
    }
    const now = new Date();
    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.essayLearningRecord.update({
        where: { id: learningId },
        data: {
          level: dto.level,
          validatedBy: user.id,
          validatedAt: now,
          ...(dto.consentConfirmed ? { anonymized: true, consentAt: now } : {}),
        },
      });
      await tx.essayAuditEvent.create({
        data: {
          actorId: user.id,
          action: dto.level === EssayLearningLevel.CONSOLIDATED ? EssayAuditAction.REVIEW_CONSOLIDATED : EssayAuditAction.REVIEW_VALIDATED,
          entity: 'EssayLearningRecord',
          entityId: learningId,
          beforeJson: { level: learning.level } as Prisma.InputJsonValue,
          afterJson: { level: dto.level, consentConfirmed: Boolean(dto.consentConfirmed) } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
    return saved;
  }

  // --------------------------------------------------------------- internos

  /**
   * Fotografia completa da revisão para o audit trail. Como a edição substitui
   * os detalhes (deleteMany/create), sem esta cópia a justificativa anterior
   * desapareceria e a trilha não permitiria reconstruir o histórico.
   */
  private reviewSnapshot(review: ReviewWithDetails): Prisma.InputJsonValue {
    return {
      status: review.status,
      decision: review.decision,
      aiTotalScore: review.aiTotalScore,
      totalScore: review.totalScore,
      generalFeedback: review.generalFeedback,
      validationLevel: review.validationLevel,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      details: review.details.map((detail) => ({
        competency: detail.competency,
        aiScore: detail.aiScore,
        humanScore: detail.humanScore,
        decision: detail.decision,
        criterion: detail.criterion,
        justification: detail.justification,
        evidenceJson: detail.evidenceJson,
      })),
    } as Prisma.InputJsonValue;
  }

  private async loadEssay(essayId: string): Promise<EssayWithCorrection> {
    const essay = await this.prisma.essay.findUnique({
      where: { id: essayId },
      include: {
        correction: { include: { details: true } },
        user: { select: { id: true, accountType: true, profile: { select: { firstName: true, lastName: true } } } },
        scans: {
          select: {
            id: true,
            status: true,
            transcribedText: true,
            lineCount: true,
            illegibleWords: true,
            ocrConfidence: true,
            warningsJson: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!essay) throw new NotFoundException('Redação não encontrada.');
    return essay;
  }

  /**
   * O autor da redação só enxerga revisões que passaram por validação
   * independente. Sem isso, conhecer o UUID de uma revisão em STRUCTURED
   * contornaria o filtro aplicado na tela e exporia notas/chat ainda não
   * validados.
   */
  private assertOwnerCanSeeReview(
    user: UserWithProfile,
    essay: EssayWithCorrection,
    review: { validationLevel: EssayLearningLevel },
  ) {
    if (essay.userId !== user.id) return;
    if (
      review.validationLevel !== EssayLearningLevel.VALIDATED &&
      review.validationLevel !== EssayLearningLevel.CONSOLIDATED
    ) {
      throw new NotFoundException('Revisão não encontrada.');
    }
  }

  private async assertCanReview(user: UserWithProfile, essay: EssayWithCorrection) {
    if (!REVIEWER_ROLES.has(user.accountType)) {
      throw new ForbiddenException('Somente professores, coordenadores, diretores ou administradores podem revisar redações.');
    }
    if (essay.userId === user.id) {
      throw new ForbiddenException('O autor não pode revisar a própria redação.');
    }
    if (!(await this.hasEssayAccess(user, essay))) {
      throw new ForbiddenException('Você não possui acesso a esta redação.');
    }
  }

  private async assertCanValidate(user: UserWithProfile, essay: EssayWithCorrection) {
    if (essay.userId === user.id) {
      throw new ForbiddenException('O autor da redação não pode validar o aprendizado sobre ela.');
    }
    if (VALIDATOR_ROLES.has(user.accountType)) {
      if (await this.hasEssayAccess(user, essay)) return;
      throw new ForbiddenException('Você não possui acesso a esta redação.');
    }
    if (await this.hasWorkspacePermission(user.id, essay.userId, VALIDATE_PERMISSIONS)) return;
    throw new ForbiddenException('A validação exige coordenação, direção, administração ou permissão específica no workspace.');
  }

  private async hasEssayAccess(user: UserWithProfile, essay: EssayWithCorrection): Promise<boolean> {
    if (user.id === essay.userId) return true;
    if (user.accountType === AccountType.ADMIN) return true;

    const classAccess = await this.prisma.classMember.findFirst({
      where: {
        userId: essay.userId,
        class: {
          archived: false,
          OR: [
            { createdBy: user.id },
            { coordinatorId: user.id },
            { teachers: { some: { userId: user.id } } },
            {
              workspace: {
                members: {
                  some: {
                    userId: user.id,
                    status: WorkspaceMemberStatus.ACTIVE,
                    role: { rolePermissions: { some: { permission: { code: { in: REVIEW_PERMISSIONS } } } } },
                  },
                },
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    if (classAccess) return true;

    return this.hasWorkspacePermission(user.id, essay.userId, REVIEW_PERMISSIONS);
  }

  private async hasWorkspacePermission(userId: string, ownerId: string, permissions: string[]): Promise<boolean> {
    if (userId === ownerId) return false;
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
        workspace: {
          members: { some: { userId: ownerId, status: WorkspaceMemberStatus.ACTIVE } },
        },
        role: {
          rolePermissions: { some: { permission: { code: { in: permissions } } } },
        },
      },
      select: { id: true },
    });
    return Boolean(membership);
  }

  private async reviewScopeWhere(user: UserWithProfile): Promise<Prisma.EssayReviewWhereInput | null> {
    if (user.accountType === AccountType.ADMIN) return null;
    const reviewerClassScope: Prisma.EssayWhereInput = {
      user: {
        classMemberships: {
          some: {
            class: {
              archived: false,
              OR: [
                { createdBy: user.id },
                { coordinatorId: user.id },
                { teachers: { some: { userId: user.id } } },
              ],
            },
          },
        },
      },
    };
    const reviewerWorkspaceScope: Prisma.EssayWhereInput = {
      user: {
        workspaceMembers: {
          some: {
            workspace: {
              members: {
                some: {
                  userId: user.id,
                  status: WorkspaceMemberStatus.ACTIVE,
                  role: { rolePermissions: { some: { permission: { code: { in: REVIEW_PERMISSIONS } } } } },
                },
              },
            },
          },
        },
      },
    };
    return {
      OR: [{ evaluatorId: user.id }, { essay: reviewerClassScope }, { essay: reviewerWorkspaceScope }],
    };
  }

  private essayResponse(essay: EssayWithCorrection) {
    return {
      id: essay.id,
      title: essay.title,
      theme: essay.theme,
      content: essay.content,
      version: essay.version,
      wordCount: essay.wordCount,
      createdAt: essay.createdAt,
      updatedAt: essay.updatedAt,
      scans: (essay.scans ?? []).map((scan) => ({
        id: scan.id,
        status: scan.status,
        transcribedText: scan.transcribedText,
        lineCount: scan.lineCount,
        illegibleWords: scan.illegibleWords,
        ocrConfidence: scan.ocrConfidence,
        warnings: Array.isArray(scan.warningsJson) ? scan.warningsJson.filter((item): item is string => typeof item === 'string') : [],
        createdAt: scan.createdAt,
      })),
      owner: {
        id: essay.user.id,
        name: this.displayName(essay.user.profile),
        accountType: essay.user.accountType,
      },
    };
  }

  private reviewResponse(review: ReviewWithDetails) {
    return {
      id: review.id,
      essayId: review.essayId,
      correctionId: review.correctionId,
      essayVersion: review.essayVersion,
      status: review.status,
      decision: review.decision,
      aiTotalScore: review.aiTotalScore,
      totalScore: review.totalScore,
      aiCompetenciesJson: review.aiCompetenciesJson,
      competenciesJson: review.competenciesJson,
      divergenceJson: review.divergenceJson,
      generalFeedback: review.generalFeedback,
      validationLevel: review.validationLevel,
      validatedAt: review.validatedAt,
      validationNotes: review.validationNotes,
      submittedAt: review.submittedAt,
      evaluator: {
        id: review.evaluator.id,
        accountType: review.evaluator.accountType,
        name: this.displayName(review.evaluator.profile),
      },
      validatedBy: review.validatedByUser
        ? { id: review.validatedByUser.id, name: this.displayName(review.validatedByUser.profile) }
        : null,
      details: review.details,
    };
  }

  private runFromScores(
    evaluator: string,
    scores: Record<CompetencyId, number>,
    justifications: Record<CompetencyId, string>,
  ): EvaluatorRun {
    const competencies = Object.fromEntries(
      COMPETENCY_IDS.map((id) => [
        id,
        {
          score: scores[id],
          justification: justifications[id] ?? '',
          strengths: [],
          problems: [],
          levelExplanation: '',
          evidence: [],
          references: [],
        } satisfies CompetencyEvaluation,
      ]),
    ) as unknown as Record<CompetencyId, CompetencyEvaluation>;
    return {
      evaluator,
      method: 'llm',
      model: null,
      annulment: null,
      tangencia: false,
      humanRightsViolation: false,
      competencies,
      total: COMPETENCY_IDS.reduce((sum, id) => sum + scores[id], 0),
      generalComment: '',
    };
  }

  private evidenceJson(evidence?: string[], anchorText?: string): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!evidence?.length && !anchorText?.trim()) return Prisma.DbNull;
    return {
      evidence: evidence?.map((item) => item.trim()).filter(Boolean) ?? [],
      anchorText: anchorText?.trim() || null,
    } as Prisma.InputJsonValue;
  }

  private aiEvidence(value: Prisma.JsonValue | null | undefined): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const evidence = (value as { evidence?: unknown }).evidence;
    return Array.isArray(evidence) ? evidence.filter((item): item is string => typeof item === 'string') : [];
  }

  private displayName(profile: { firstName: string | null; lastName: string | null } | null): string {
    if (!profile) return 'Avaliador';
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || 'Avaliador';
  }
}
