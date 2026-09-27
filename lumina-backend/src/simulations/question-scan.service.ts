import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, QuestionDifficulty, ErrorReason } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';

interface QuestionScanProcessingResult {
  stemText: string | null;
  alternatives: { position: number; text: string }[] | null;
  subject: string | null;
  topic: string | null;
  difficulty: QuestionDifficulty | null;
  explanationJson: Record<number, string> | null;
  confidence: number | null;
  warnings: string[];
}

@Injectable()
export class QuestionScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionAccess: QuestionAccessService,
  ) {}

  // ---------- Upload (Presigned URL) ----------

  async createPresignedUpload(userId: string, dto: { contentType: string }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const upload = await this.prisma.questionScanUpload.create({
      data: {
        userId,
        fileUrl: '',
        metaJson: { contentType: dto.contentType },
        status: 'PENDING',
      },
    });

    // Em produção: presigned URL S3/MinIO. Aqui endpoint local.
    const uploadUrl = `/api/v1/simulations/question-scans/upload/${upload.id}`;
    const expiresIn = 3600;

    return { uploadUrl, uploadId: upload.id, key: upload.id, expiresIn };
  }

  async completeUpload(uploadId: string, fileUrl: string, meta: { width: number; height: number; sizeBytes: number }) {
    const upload = await this.prisma.questionScanUpload.update({
      where: { id: uploadId },
      data: {
        fileUrl,
        metaJson: meta,
        status: 'PROCESSING',
      },
    });

    // Dispara processamento assíncrono
    void this.processUpload(upload.id);

    return { status: 'PROCESSING' };
  }

  // ---------- Processamento ----------

  /** Processa o upload: OCR simulado + identificação de disciplina/assunto + LuminIA. */
  async processUpload(uploadId: string) {
    const upload = await this.prisma.questionScanUpload.findUnique({ where: { id: uploadId } });
    if (!upload) return;

    try {
      // 1) Simula OCR + classificação (em produção: Tesseract/OpenCV + LLM)
      const result = await this.simulateOcrAndClassification(upload);

      // 2) Grava processing
      const processing = await this.prisma.questionScanProcessing.create({
        data: {
          uploadId: upload.id,
          stemText: result.stemText ?? null,
          alternativesJson: result.alternatives ?? Prisma.JsonNull,
          subject: result.subject ?? null,
          topic: result.topic ?? null,
          difficulty: result.difficulty,
          explanationJson: result.explanationJson ?? Prisma.JsonNull,
          confidence: result.confidence,
          warningsJson: result.warnings.length > 0 ? result.warnings : Prisma.JsonNull,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      });

      // 3) Atualiza upload
      await this.prisma.questionScanUpload.update({
        where: { id: uploadId },
        data: { status: 'COMPLETED' },
      });

    } catch (err) {
      await this.prisma.questionScanProcessing.create({
        data: {
          uploadId,
          stemText: null,
          alternativesJson: Prisma.JsonNull,
          subject: null,
          topic: null,
          difficulty: null,
          explanationJson: Prisma.JsonNull,
          confidence: null,
          warningsJson: [`Erro no processamento: ${err instanceof Error ? err.message : 'desconhecido'}`],
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
          finishedAt: new Date(),
        },
      });
      await this.prisma.questionScanUpload.update({
        where: { id: uploadId },
        data: { status: 'FAILED' },
      });
    }
  }

  /** Simula OCR + classificação + explicação LuminIA.
   *  Em produção: chamaria serviço de OCR (Tesseract/Google Vision/Azure) +
   *  classificador de disciplina/assunto + LLM para explicação. */
  private async simulateOcrAndClassification(upload: { metaJson: Prisma.JsonValue }): Promise<QuestionScanProcessingResult> {
    const meta = upload.metaJson as { width: number; height: number; mimeType: string } | null;
    const isLandscape = (meta?.width ?? 0) > (meta?.height ?? 0);

    // Simula enunciado extraído
    const stemText = 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:';

    // Simula alternativas
    const alternatives = [
      { position: 1, text: '4' },
      { position: 2, text: '8' },
      { position: 3, text: '16' },
      { position: 4, text: '32' },
    ];

    // Simula identificação de disciplina/assunto (por palavras-chave no enunciado)
    let subject = 'Matemática';
    let topic = 'Funções exponenciais';
    let difficulty: QuestionDifficulty = 'MEDIA';

    if (stemText.includes('termodinâmica') || stemText.includes('calor') || stemText.includes('energia')) {
      subject = 'Física';
      topic = 'Termodinâmica';
      difficulty = 'DIFICIL';
    } else if (stemText.includes('reação') || stemText.includes('mol') || stemText.includes('química')) {
      subject = 'Química';
      topic = 'Estequiometria';
      difficulty = 'MEDIA';
    }

    // Simula explicação LuminIA por alternativa
    const explanationJson: Record<number, string> = {
      1: '2^2 = 4: o expoente foi trocado pela base.',
      2: '2^3 = 8: base 2 elevada ao expoente 3.',
      3: 'O dobro de 8 seria 16, mas 2^3 = 8.',
      4: '4 é a base; a resposta seria 4^3 se o enunciado pedisse outra coisa.',
    };

    // Confiança simulada baseada em qualidade da imagem (meta)
    const baseConfidence = 0.85;
    const sizePenalty = (meta?.width ?? 1920) < 800 ? 0.15 : 0;
    const confidence = Math.max(0.5, baseConfidence - sizePenalty - Math.random() * 0.1);

    const warnings: string[] = [];
    if (confidence < 0.7) warnings.push('Confiança baixa: imagem pode estar borrada ou com ruído.');
    if (!meta || (meta.width < 600 && meta.height < 600)) warnings.push('Resolução da imagem baixa; recomenda-se foto com mais detalhes.');
    if (isLandscape) warnings.push('Imagem em paisagem; preferir retrato para melhor OCR.');

    return {
      stemText,
      alternatives,
      subject,
      topic,
      difficulty,
      explanationJson,
      confidence,
      warnings,
    };
  }

  // ---------- Salvar resultado (criar questão ou adicionar ao caderno) ----------

  /** Salva o resultado do scanner como questão oficial do banco. */
  async saveAsQuestion(userId: string, processingId: string, dto: {
    finalStem: string;
    finalAlternatives: { position: number; text: string; isCorrect?: boolean }[];
    finalSubject: string;
    finalTopic: string;
    finalDifficulty: QuestionDifficulty;
    finalExplanation?: Record<number, string>;
    exam?: string;
  }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const processing = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true },
    });
    if (!processing) throw new NotFoundException('Processamento não encontrado.');
    if (processing.upload.userId !== userId) throw new BadRequestException('Não autorizado.');

    const workspaceId = (await this.questionAccess.getPersonalWorkspaceOrThrow(userId)).id;

    // Valida alternativas: exatamente uma correta
    const correctCount = dto.finalAlternatives.filter(a => a.isCorrect).length;
    if (correctCount !== 1) throw new BadRequestException('Deve haver exatamente uma alternativa correta.');

    const question = await this.prisma.question.create({
      data: {
        workspaceId,
        subject: dto.finalSubject,
        topic: dto.finalTopic,
        difficulty: dto.finalDifficulty,
        exam: dto.exam ?? 'SCANNER',
        stem: dto.finalStem,
        alternatives: {
          create: dto.finalAlternatives.map(a => ({
            position: a.position,
            text: a.text,
            isCorrect: a.isCorrect ?? false,
            explanation: dto.finalExplanation?.[a.position] ?? null,
          })),
        },
      },
    });

    // Liga ao resultado do scanner
    await this.prisma.questionScanResult.create({
      data: {
        processingId,
        userId,
        questionId: question.id,
        finalStem: dto.finalStem,
        finalAlternatives: dto.finalAlternatives,
        finalSubject: dto.finalSubject,
        finalTopic: dto.finalTopic,
        finalDifficulty: dto.finalDifficulty,
        finalExplanation: dto.finalExplanation ?? Prisma.JsonNull,
      },
    });

    return question;
  }

  /** Adiciona o resultado do scanner ao caderno de erros do aluno. */
  async saveToErrorNotebook(userId: string, processingId: string, dto: {
    finalStem: string;
    finalAlternatives: { position: number; text: string; isCorrect?: boolean }[];
    finalSubject: string;
    finalTopic: string;
    finalDifficulty: QuestionDifficulty;
    finalExplanation?: Record<number, string>;
    reason?: ErrorReason;
    notes?: string;
  }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const processing = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true },
    });
    if (!processing) throw new NotFoundException('Processamento não encontrado.');
    if (processing.upload.userId !== userId) throw new BadRequestException('Não autorizado.');

    // Cria ou reutiliza a questão (não oficial, sourceType=IMPORTED)
    const workspaceId = (await this.questionAccess.getPersonalWorkspaceOrThrow(userId)).id;

    const question = await this.prisma.question.create({
      data: {
        workspaceId,
        subject: dto.finalSubject,
        topic: dto.finalTopic,
        difficulty: dto.finalDifficulty,
        exam: 'SCANNER',
        stem: dto.finalStem,
        sourceType: 'IMPORTED',
        sourceName: 'Scanner de Questões',
        sourceId: `scan:${processingId}`,
        alternatives: {
          create: dto.finalAlternatives.map(a => ({
            position: a.position,
            text: a.text,
            isCorrect: a.isCorrect ?? false,
            explanation: dto.finalExplanation?.[a.position] ?? null,
          })),
        },
      },
    });

    // Cria entrada no caderno de erros
    const entry = await this.prisma.errorNotebookEntry.create({
      data: {
        userId,
        questionId: question.id,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        status: 'ABERTA',
        wrongAttempts: 1,
        correctStreak: 0,
        evolution: 'E',
        reviewScheduledAt: null,
        firstWrongAt: new Date(),
        lastWrongAt: new Date(),
      },
    });

    // Liga ao resultado do scanner
    await this.prisma.questionScanResult.create({
      data: {
        processingId,
        userId,
        questionId: question.id,
        errorNotebookEntryId: entry.id,
        finalStem: dto.finalStem,
        finalAlternatives: dto.finalAlternatives,
        finalSubject: dto.finalSubject,
        finalTopic: dto.finalTopic,
        finalDifficulty: dto.finalDifficulty,
        finalExplanation: dto.finalExplanation ?? Prisma.JsonNull,
      },
    });

    return { question, entry };
  }

  // ---------- Consulta ----------

  async getProcessing(userId: string, processingId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const p = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true, result: true },
    });
    if (!p) throw new NotFoundException('Processamento não encontrado.');
    if (p.upload.userId !== userId) throw new BadRequestException('Não autorizado.');
    return p;
  }

  async listUploads(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    return this.prisma.questionScanUpload.findMany({
      where: { userId },
      include: { processing: true, result: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const [uploads, processings, results] = await Promise.all([
      this.prisma.questionScanUpload.count({ where: { userId } }),
      this.prisma.questionScanProcessing.count({ where: { upload: { userId } } }),
      this.prisma.questionScanResult.count({ where: { userId } }),
    ]);
    return { uploads, processings, results };
  }
}