import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AnswerSheetStatus, AnswerSheetProcessingStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';

interface Marker { name: string; x: number; y: number }
interface Bubble { position: number; x: number; y: number; radius: number }
interface LayoutItem { questionNumber: number; bubbles: Bubble[] }
interface TemplateData { markers: Marker[]; layout: LayoutItem[]; expectedWidth?: number; expectedHeight?: number }
interface ProcessingResult {
  detectedAnswers: Record<number, number>;
  confidence: Record<number, number>;
  warnings: string[];
  answeredCount: number;
  lowConfidenceCount: number;
}

const CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_BUBBLE_RADIUS = 12;

@Injectable()
export class AnswerSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionAccess: QuestionAccessService,
  ) {}

  // ---------- Templates ----------

  async createTemplate(userId: string, dto: { name: string; description?: string; markers: Marker[]; layout: LayoutItem[]; expectedWidth?: number; expectedHeight?: number }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const markersJson = dto.markers.reduce((acc, m) => ({ ...acc, [m.name]: { x: m.x, y: m.y } }), {});
    const layoutJson = dto.layout.reduce((acc, l) => ({ ...acc, [l.questionNumber]: l.bubbles }), {});

    return this.prisma.answerSheetTemplate.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        markersJson,
        layoutJson,
        expectedWidth: dto.expectedWidth ?? null,
        expectedHeight: dto.expectedHeight ?? null,
      },
    });
  }

  async listTemplates(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    return this.prisma.answerSheetTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(userId: string, id: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const t = await this.prisma.answerSheetTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template não encontrado.');
    return t;
  }

  async deleteTemplate(userId: string, id: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    await this.prisma.answerSheetTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Upload (Presigned URL) ----------

  async createPresignedUpload(userId: string, dto: { templateId: string; simulationId?: string; contentType: string }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const template = await this.prisma.answerSheetTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Template não encontrado.');

    if (dto.simulationId) {
      const sim = await this.prisma.simulation.findUnique({ where: { id: dto.simulationId } });
      if (!sim) throw new NotFoundException('Simulado não encontrado.');
    }

    const upload = await this.prisma.answerSheetUpload.create({
      data: {
        templateId: dto.templateId,
        simulationId: dto.simulationId ?? null,
        studentId: userId,
        fileUrl: '', // placeholder, atualizado após upload
        metaJson: { contentType: dto.contentType },
        status: 'PENDING',
      },
    });

    // Em produção, aqui geraria presigned URL do S3/MinIO/Blob Storage.
    // Para desenvolvimento local, devolvemos um endpoint local de upload.
    const uploadUrl = `/api/v1/simulations/answer-sheets/upload/${upload.id}`;
    const expiresIn = 3600;

    return { uploadUrl, uploadId: upload.id, key: upload.id, expiresIn };
  }

  async completeUpload(uploadId: string, fileUrl: string, meta: { width: number; height: number; sizeBytes: number }) {
    const upload = await this.prisma.answerSheetUpload.update({
      where: { id: uploadId },
      data: {
        fileUrl,
        metaJson: meta,
        status: 'PROCESSING',
      },
    });

    // Dispara processamento assíncrono (fire-and-forget)
    void this.processUpload(upload.id);

    return { status: 'PROCESSING' };
  }

  // ---------- Processamento ----------

  /** Processa o upload: detecta bolhas, compara com template, grava resultado. */
  async processUpload(uploadId: string) {
    const upload = await this.prisma.answerSheetUpload.findUnique({
      where: { id: uploadId },
      include: { template: true },
    });
    if (!upload) return;

    try {
      // 1) Baixa/processa imagem (em produção: Sharp + OpenCV.js ou worker Python)
      // Aqui simulamos a detecção usando o layout do template.
      const template = upload.template;
      const layout = (template.layoutJson as unknown) as Record<number, Bubble[]>;
      const totalQuestions = Object.keys(layout).length;

      // Simulação de detecção: para cada questão, escolhe aleatoriamente uma bolha
      // com alta confiança; em 10% dos casos marca baixa confiança ou múltipla.
      const detected: Record<number, number> = {};
      const confidence: Record<number, number> = {};
      const warnings: string[] = [];

      for (const [qNumStr, bubbles] of Object.entries(layout)) {
        const qNum = Number(qNumStr);
        // Simula detecção: 85% acerta a bolha correta, 10% baixa confiança, 5% múltipla
        const rand = Math.random();
        if (rand < 0.85) {
          detected[qNum] = bubbles[0].position; // assume primeira bolha como "detectada"
          confidence[qNum] = 0.92 + Math.random() * 0.08;
        } else if (rand < 0.95) {
          detected[qNum] = bubbles[0].position;
          confidence[qNum] = 0.5 + Math.random() * 0.2; // baixa confiança
          warnings.push(`Q${qNum}: confiança baixa (${Math.round(confidence[qNum] * 100)}%)`);
        } else {
          // múltipla marcação simulada
          detected[qNum] = bubbles[0].position;
          confidence[qNum] = 0.6;
          warnings.push(`Q${qNum}: possível marcação múltipla`);
        }
      }

      const answeredCount = Object.keys(detected).length;
      const lowConfidenceCount = Object.values(confidence).filter(c => c < CONFIDENCE_THRESHOLD).length;

      // 2) Grava processing
      const processing = await this.prisma.answerSheetProcessing.create({
        data: {
          uploadId: upload.id,
          detectedAnswers: detected,
          confidenceJson: confidence,
          warningsJson: warnings,
          totalQuestions,
          answeredCount,
          lowConfidenceCount,
          status: lowConfidenceCount > 0 ? 'COMPLETED' : 'COMPLETED',
          finishedAt: new Date(),
        },
      });

      // 3) Atualiza upload (usa NEEDS_REVIEW no upload, que tem esse status)
      await this.prisma.answerSheetUpload.update({
        where: { id: uploadId },
        data: { status: lowConfidenceCount > 0 ? 'NEEDS_REVIEW' : 'COMPLETED' },
      });

      // 4) Se simulado vinculado e sem necessidade de revisão, cria submissão automática
      if (upload.simulationId && lowConfidenceCount === 0) {
        await this.createSubmissionFromProcessing(upload, processing);
      }

    } catch (err) {
      await this.prisma.answerSheetProcessing.create({
        data: {
          uploadId,
          detectedAnswers: {},
          confidenceJson: {},
          warningsJson: [`Erro no processamento: ${err instanceof Error ? err.message : 'desconhecido'}`],
          totalQuestions: 0,
          answeredCount: 0,
          lowConfidenceCount: 0,
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
          finishedAt: new Date(),
        },
      });
      await this.prisma.answerSheetUpload.update({
        where: { id: uploadId },
        data: { status: 'FAILED' },
      });
    }
  }

  private async createSubmissionFromProcessing(upload: { id: string; simulationId: string | null; studentId: string; templateId: string }, processing: { id: string; detectedAnswers: Prisma.JsonValue; confidenceJson: Prisma.JsonValue }) {
    if (!upload.simulationId) return;

    const sim = await this.prisma.simulation.findUnique({
      where: { id: upload.simulationId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!sim) return;

    // Mapeia detectedAnswers (por questionNumber) para posições do simulado
    const finalAnswers: Record<number, number> = {};
    let correct = 0;
    const detectedAnswers = processing.detectedAnswers as Record<number, number>;

    for (const item of sim.items) {
      const detected = detectedAnswers[item.position];
      if (detected !== undefined) {
        finalAnswers[item.position] = detected;
        if (detected === item.correctPosition) correct++;
      }
    }

    try {
      await this.prisma.answerSheetSubmission.create({
        data: {
          processingId: processing.id,
          simulationId: upload.simulationId!,
          studentId: upload.studentId,
          finalAnswers,
          correct,
          total: sim.items.length,
          reviewedBy: null,
          reviewedAt: null,
        },
      });

      // Também cria a SimulationSubmission padrão para integração com dashboard
      await this.prisma.simulationSubmission.upsert({
        where: { simulationId_userId: { simulationId: upload.simulationId!, userId: upload.studentId } },
        create: {
          simulationId: upload.simulationId!,
          userId: upload.studentId,
          answers: Object.entries(finalAnswers).map(([pos, sel]) => ({ position: Number(pos), selectedPosition: sel })),
          correct,
          total: sim.items.length,
        },
        update: {},
      });

    } catch (e) {
      // Ignora conflitos (submissão já existente)
    }
  }

  // ---------- Consulta / Revisão ----------

  async getProcessing(userId: string, processingId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const p = await this.prisma.answerSheetProcessing.findUnique({
      where: { id: processingId },
      include: { upload: { include: { template: true, simulation: true } } },
    });
    if (!p) throw new NotFoundException('Processamento não encontrado.');
    // Verifica permissão: aluno dono ou professor/turma
    if (p.upload.studentId !== userId) {
      // TODO: verificar se userId é professor da turma do simulado
    }
    return p;
  }

  async listUploads(userId: string, simulationId?: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const where: Prisma.AnswerSheetUploadWhereInput = { studentId: userId };
    if (simulationId) where.simulationId = simulationId;
    return this.prisma.answerSheetUpload.findMany({
      where,
      include: { template: true, processing: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Revisão humana: professor/aluno corrige respostas de baixa confiança. */
  async reviewProcessing(userId: string, processingId: string, finalAnswers: Record<number, number>) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const processing = await this.prisma.answerSheetProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true },
    });
    if (!processing) throw new NotFoundException('Processamento não encontrado.');

    // Recalcula acertos se simulado vinculado
    let correct = 0;
    let total = 0;
    if (processing.upload.simulationId) {
      const sim = await this.prisma.simulation.findUnique({
        where: { id: processing.upload.simulationId },
        include: { items: true },
      });
      if (sim) {
        total = sim.items.length;
        for (const item of sim.items) {
          if (finalAnswers[item.position] === item.correctPosition) correct++;
        }
      }
    }

    await this.prisma.$transaction([
      this.prisma.answerSheetProcessing.update({
        where: { id: processingId },
        data: {
          detectedAnswers: finalAnswers,
          status: 'COMPLETED',
          lowConfidenceCount: 0,
        },
      }),
      this.prisma.answerSheetUpload.update({
        where: { id: processing.uploadId },
        data: { status: 'COMPLETED' },
      }),
      ...(processing.upload.simulationId ? [
        this.prisma.answerSheetSubmission.upsert({
          where: { processingId },
          create: {
            processingId,
            simulationId: processing.upload.simulationId!,
            studentId: processing.upload.studentId,
            finalAnswers,
            correct,
            total,
            reviewedBy: userId,
            reviewedAt: new Date(),
          },
          update: { finalAnswers, correct, total, reviewedBy: userId, reviewedAt: new Date() },
        }),
        // Atualiza também a SimulationSubmission
        this.prisma.simulationSubmission.upsert({
          where: { simulationId_userId: { simulationId: processing.upload.simulationId!, userId: processing.upload.studentId } },
          create: {
            simulationId: processing.upload.simulationId!,
            userId: processing.upload.studentId,
            answers: Object.entries(finalAnswers).map(([pos, sel]) => ({ position: Number(pos), selectedPosition: sel })),
            correct,
            total,
          },
          update: { answers: Object.entries(finalAnswers).map(([pos, sel]) => ({ position: Number(pos), selectedPosition: sel })), correct, total },
        }),
      ] : []),
    ]);

    return { updated: true };
  }

  // ---------- Stats ----------

  async getStats(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const [uploads, processings, submissions] = await Promise.all([
      this.prisma.answerSheetUpload.count({ where: { studentId: userId } }),
      this.prisma.answerSheetProcessing.count({ where: { upload: { studentId: userId } } }),
      this.prisma.answerSheetSubmission.count({ where: { studentId: userId } }),
    ]);
    return { uploads, processings, submissions };
  }
}