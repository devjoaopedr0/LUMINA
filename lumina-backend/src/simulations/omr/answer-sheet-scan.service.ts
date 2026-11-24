import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { AnswerSheetProcessingStatus, AnswerSheetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SimulationsService } from '../simulations.service';
import { GrayImage, LOW_CONFIDENCE, OmrError, QuestionReading, readSheet } from './omr';
import { extractPdfImages, grayToPng, PdfError } from './pdf';
import { buildSheetLayout, defaultSheetOptions, encodeSheetCode, MAX_SHEET_CODE, SheetOptions } from './sheet-layout';
import { upsertSheetTemplate } from './sheet-template';

const MIN_SIDE = 600;
const MAX_SIDE = 2400;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Layout de referência só para achar marcadores e ler o código (iguais em todo cartão v2). */
const PROBE_LAYOUT = buildSheetLayout([2]);

/** Quem personaliza o cartão: o gestor (professor, coordenação, direção). */
const SHEET_MANAGER_ACCOUNT_TYPES = ['TEACHER', 'COORDINATOR', 'DIRECTOR', 'ADMIN'];

interface SimulationAccess {
  id: string;
  title: string;
  createdBy: string;
  enemDay: number | null;
  items: { position: number; alternatives: unknown; correctPosition: number }[];
  class: { name: string; members: { userId: string; user: { email: string; profile: { firstName: string; lastName: string | null } | null } }[]; teachers: { userId: string }[] } | null;
}

function studentName(user: { email: string; profile: { firstName: string; lastName: string | null } | null }) {
  return user.profile ? `${user.profile.firstName} ${user.profile.lastName ?? ''}`.trim() : user.email;
}

/** O PDF chega como data URL (application/pdf). */
export function decodePdf(dataUrl: string): Buffer {
  const match = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new BadRequestException('Envie o PDF das folhas como data URL (application/pdf).');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > MAX_PDF_BYTES) throw new BadRequestException('O PDF pode ter no máximo 25 MB.');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('O arquivo enviado não é um PDF.');
  return bytes;
}

/** A questão precisa de olho humano? Branco e dupla marcação nítidos não: valem como erro, como no Enem. */
export function needsReview(q: QuestionReading): boolean {
  return q.status === 'AMBIGUOUS' || q.confidence < LOW_CONFIDENCE;
}

@Injectable()
export class AnswerSheetScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulations: SimulationsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Nova nota (item 51): avisa o aluno que o cartão dele foi lançado. */
  private async notifyGrade(studentId: string, simulationId: string, correct: number, total: number) {
    if (!this.notifications) return;
    const sim = await this.prisma.simulation.findUnique({ where: { id: simulationId }, select: { title: true } });
    await this.notifications.notify([studentId], {
      kind: 'grade.released',
      title: `Sua nota saiu: ${sim?.title ?? 'simulado'}`,
      body: `Você acertou ${correct} de ${total} questões.`,
      link: `/app/simulados?id=${simulationId}`,
    });
  }

  private async loadSimulation(id: string): Promise<SimulationAccess> {
    const sim = await this.prisma.simulation.findUnique({
      where: { id },
      select: {
        id: true, title: true, createdBy: true, enemDay: true,
        items: { select: { position: true, alternatives: true, correctPosition: true }, orderBy: { position: 'asc' } },
        class: { select: { name: true, members: { select: { userId: true, user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } } }, teachers: { select: { userId: true } } } },
      },
    });
    if (!sim) throw new NotFoundException('Simulado não encontrado.');
    return sim;
  }

  private isStaff(userId: string, sim: SimulationAccess) {
    return sim.createdBy === userId || Boolean(sim.class?.teachers.some((t) => t.userId === userId));
  }

  private isMember(userId: string, sim: SimulationAccess) {
    return sim.createdBy === userId || Boolean(sim.class?.members.some((m) => m.userId === userId));
  }

  private async codeFor(templateId: string, studentId: string | null, createdBy: string): Promise<number> {
    const existing = await this.prisma.answerSheetCode.findFirst({ where: { templateId, studentId } });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomInt(1, MAX_SHEET_CODE + 1);
      try {
        await this.prisma.answerSheetCode.create({ data: { code, templateId, studentId, createdBy } });
        return code;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    throw new ConflictException('Não foi possível gerar o código da folha. Tente novamente.');
  }

  /**
   * Folhas para imprimir. Professor/autor: uma personalizada por aluno da
   * turma (ou os escolhidos), mais uma genérica. Aluno: só a dele.
   */
  async prepareSheets(userId: string, simulationId: string, studentIds?: string[], accountType?: string) {
    const sim = await this.loadSimulation(simulationId);
    const staff = this.isStaff(userId, sim);
    if (!staff && !this.isMember(userId, sim)) throw new NotFoundException('Simulado não encontrado.');
    const { template, layout } = await upsertSheetTemplate(this.prisma, sim);
    const members = sim.class?.members ?? [];
    let targets: { id: string | null; name: string }[];
    if (!staff) {
      const me = members.find((m) => m.userId === userId);
      targets = [{ id: userId, name: me ? studentName(me.user) : '' }];
    } else {
      const chosen = studentIds?.length ? members.filter((m) => studentIds.includes(m.userId)) : members;
      if (studentIds?.length && chosen.length !== studentIds.length) throw new BadRequestException('Algum aluno escolhido não é da turma deste simulado.');
      targets = [...chosen.map((m) => ({ id: m.userId, name: studentName(m.user) })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), { id: null, name: '' }];
    }
    const sheets = [];
    for (const t of targets) {
      const code = await this.codeFor(template.id, t.id, userId);
      sheets.push({ code, bits: encodeSheetCode(code), studentId: t.id, studentName: t.name || null });
    }
    const canCustomize = staff && SHEET_MANAGER_ACCOUNT_TYPES.includes(accountType ?? '');
    const locked = canCustomize ? (await this.prisma.answerSheetUpload.count({ where: { templateId: template.id } })) > 0 : false;
    return {
      simulation: { id: sim.id, title: sim.title, className: sim.class?.name ?? null, questionCount: sim.items.length },
      layout,
      sheets,
      // Cartão antigo (sem opções): o painel parte dos padrões e aplicar passa para o modelo novo.
      customization: { canCustomize, locked, legacy: !layout.options, options: layout.options ?? defaultSheetOptions({ enemDay: sim.enemDay }), notes: layout.notes ?? [] },
    };
  }

  /**
   * O gestor escolhe o que o cartão traz. Muda a posição das bolhas, então só
   * vale enquanto nenhuma folha do simulado foi lida — depois disso, as folhas
   * já impressas precisam continuar legíveis com o layout em que saíram.
   */
  async saveSheetOptions(userId: string, accountType: string, simulationId: string, options: SheetOptions) {
    const sim = await this.loadSimulation(simulationId);
    if (!this.isStaff(userId, sim) || !SHEET_MANAGER_ACCOUNT_TYPES.includes(accountType)) throw new ForbiddenException('Só o professor ou a gestão do simulado personaliza o cartão-resposta.');
    const current = await this.prisma.answerSheetTemplate.findUnique({ where: { simulationId }, select: { id: true } });
    if (current && (await this.prisma.answerSheetUpload.count({ where: { templateId: current.id } })) > 0) {
      throw new ConflictException('Este cartão já tem folhas lidas: mudar o layout deixaria as folhas impressas ilegíveis. Crie outro simulado para usar um cartão diferente.');
    }
    try {
      await upsertSheetTemplate(this.prisma, sim, options);
    } catch (error) {
      if (error instanceof Error && !(error instanceof HttpException)) throw new BadRequestException(error.message);
      throw error;
    }
    return this.prepareSheets(userId, simulationId, undefined, accountType);
  }

  /**
   * Lê o PDF (uma folha por página). Cada página vira uma leitura em
   * conferência: nada é lançado sem o corretor confirmar — ele pode ajustar
   * qualquer bolha que a leitura não pegou. Uma página com problema (sem
   * marcadores, de outro simulado, sem permissão) não derruba as outras.
   */
  async scan(userId: string, input: { pdf: string; simulationId?: string }) {
    const pdf = decodePdf(input.pdf);
    let pages: GrayImage[];
    try {
      pages = extractPdfImages(pdf);
    } catch (error) {
      if (error instanceof PdfError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    for (const page of pages) {
      if (Math.min(page.width, page.height) < MIN_SIDE || Math.max(page.width, page.height) > MAX_SIDE) {
        throw new UnprocessableEntityException(`Cada página precisa ter entre ${MIN_SIDE} e ${MAX_SIDE} px de lado.`);
      }
    }
    const batch = await this.prisma.answerSheetBatch.create({ data: { scannedById: userId, pdf: new Uint8Array(pdf), pages: pages.length, sizeBytes: pdf.length } });
    const results: { page: number; scan: Awaited<ReturnType<AnswerSheetScanService['getScan']>> | null; error: string | null }[] = [];
    for (const [index, page] of pages.entries()) {
      try {
        const uploadId = await this.readPage(userId, page, { batchId: batch.id, pageIndex: index, simulationId: input.simulationId });
        results.push({ page: index + 1, scan: await this.getScan(userId, uploadId), error: null });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() < 500) results.push({ page: index + 1, scan: null, error: error.message });
        else throw error;
      }
    }
    return { batchId: batch.id, pages: pages.length, results };
  }

  private async readPage(userId: string, img: GrayImage, origin: { batchId: string; pageIndex: number; simulationId?: string }): Promise<string> {
    let code: number | null;
    try {
      code = readSheet(img, PROBE_LAYOUT).code;
    } catch (error) {
      if (error instanceof OmrError) throw new UnprocessableEntityException(error.message);
      throw error;
    }

    let sim: SimulationAccess;
    let studentId: string;
    const warnings: string[] = [];
    const codeRow = code !== null ? await this.prisma.answerSheetCode.findUnique({ where: { code }, include: { template: { select: { simulationId: true } } } }) : null;
    if (codeRow?.template.simulationId) {
      if (origin.simulationId && origin.simulationId !== codeRow.template.simulationId) {
        const other = await this.prisma.simulation.findUnique({ where: { id: codeRow.template.simulationId }, select: { title: true } });
        throw new ConflictException(`Este cartão é do simulado "${other?.title ?? 'outro simulado'}", não do escolhido.`);
      }
      sim = await this.loadSimulation(codeRow.template.simulationId);
      studentId = codeRow.studentId ?? userId;
    } else {
      if (!origin.simulationId) {
        throw new UnprocessableEntityException('Não deu para ler o código do cartão. Escolha o simulado e fotografe de novo, com a faixa de quadrados do topo nítida.');
      }
      sim = await this.loadSimulation(origin.simulationId);
      studentId = userId;
      warnings.push(code === null ? 'Código do cartão ilegível: a folha foi atribuída a você.' : 'Código de cartão desconhecido: a folha foi atribuída a você.');
    }

    const staff = this.isStaff(userId, sim);
    if (studentId !== userId && !staff) throw new ForbiddenException('Este cartão é de outro aluno. Só o professor da turma pode escaneá-lo.');
    if (studentId === userId && !this.isMember(userId, sim) && !staff) throw new NotFoundException('Simulado não encontrado.');
    if (studentId !== userId && !this.isMember(studentId, sim)) throw new ForbiddenException('O aluno deste cartão não faz parte da turma do simulado.');

    const { template, layout } = await upsertSheetTemplate(this.prisma, sim);
    let reading;
    try {
      reading = readSheet(img, layout);
    } catch (error) {
      if (error instanceof OmrError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    warnings.push(...reading.warnings.filter((w) => !w.startsWith('Não deu para ler o código')));
    const review = reading.questions.filter(needsReview);

    const upload = await this.prisma.answerSheetUpload.create({
      data: {
        templateId: template.id,
        simulationId: sim.id,
        studentId,
        scannedById: userId,
        sheetCode: code,
        batchId: origin.batchId,
        pageIndex: origin.pageIndex,
        fileUrl: '',
        metaJson: { width: img.width, height: img.height, rotation: reading.rotation },
        image: new Uint8Array(grayToPng(img)),
        imageMime: 'image/png',
        // Sempre em conferência: a nota só entra quando o corretor confirma.
        status: AnswerSheetStatus.NEEDS_REVIEW,
        processing: {
          create: {
            detectedAnswers: Object.fromEntries(reading.questions.map((q) => [q.number, q.selected ?? 0])),
            confidenceJson: Object.fromEntries(reading.questions.map((q) => [q.number, q.confidence])),
            warningsJson: warnings,
            detailsJson: reading.questions as unknown as Prisma.InputJsonValue,
            threshold: reading.threshold,
            totalQuestions: reading.questions.length,
            answeredCount: reading.questions.filter((q) => q.selected !== null).length,
            lowConfidenceCount: review.length,
            status: AnswerSheetProcessingStatus.COMPLETED,
            finishedAt: new Date(),
          },
        },
      },
    });
    return upload.id;
  }

  /**
   * Lança (ou corrige) a nota no simulado. O domínio por tópico NÃO é
   * mexido aqui: ele só é aplicado no lançamento final (finalizeScan), uma
   * vez, com as respostas definitivas — correções intermediárias não deixam
   * rastro no domínio.
   */
  private async finalize(uploadId: string, reviewerId: string, answers: Record<number, number>, adjusted: number[]) {
    const upload = await this.prisma.answerSheetUpload.findUniqueOrThrow({ where: { id: uploadId }, include: { processing: { include: { submission: true } } } });
    const processing = upload.processing!;
    const simulationId = upload.simulationId!;
    const studentId = upload.studentId;
    const list = Object.entries(answers).map(([position, selectedPosition]) => ({ position: Number(position), selectedPosition }));
    const reviewed = { reviewedBy: reviewerId, reviewedAt: new Date() };

    if (processing.submission) {
      const sim = await this.loadSimulation(simulationId);
      const correct = sim.items.filter((item) => answers[item.position] === item.correctPosition).length;
      await this.prisma.$transaction([
        this.prisma.answerSheetSubmission.update({ where: { id: processing.submission.id }, data: { finalAnswers: answers, correct, total: sim.items.length, ...reviewed } }),
        this.prisma.simulationSubmission.update({ where: { simulationId_userId: { simulationId, userId: studentId } }, data: { answers: list, correct } }),
        this.prisma.answerSheetProcessing.update({ where: { id: processing.id }, data: { detectedAnswers: answers, lowConfidenceCount: 0, adjustedJson: adjusted } }),
      ]);
      await this.notifyGrade(studentId, simulationId, correct, sim.items.length);
      return;
    }

    let result: { correct: number; total: number } | null = null;
    let message: string | null = null;
    try {
      result = (await this.simulations.submit(studentId, simulationId, list, { allowBlank: true, deferMastery: true })) as { correct: number; total: number };
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      message = 'Este aluno já tinha enviado este simulado por outro caminho: o resultado anterior foi mantido.';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.answerSheetProcessing.update({
        where: { id: processing.id },
        data: { detectedAnswers: answers, lowConfidenceCount: 0, adjustedJson: adjusted, ...(message ? { errorMessage: message } : {}) },
      });
      await tx.answerSheetUpload.update({ where: { id: uploadId }, data: { status: AnswerSheetStatus.COMPLETED } });
      if (result) {
        await tx.answerSheetSubmission.create({ data: { processingId: processing.id, simulationId, studentId, finalAnswers: answers, correct: result.correct, total: result.total, ...reviewed } });
      }
    });
    if (result) await this.notifyGrade(studentId, simulationId, result.correct, result.total);
  }

  private async ownedUpload(userId: string, uploadId: string) {
    const upload = await this.prisma.answerSheetUpload.findUnique({ where: { id: uploadId }, include: { processing: { include: { submission: true } } } });
    if (!upload) throw new NotFoundException('Leitura não encontrada.');
    if (upload.studentId !== userId && upload.scannedById !== userId) {
      const sim = upload.simulationId ? await this.loadSimulation(upload.simulationId) : null;
      if (!sim || !this.isStaff(userId, sim)) throw new NotFoundException('Leitura não encontrada.');
    }
    return upload;
  }

  async getScan(userId: string, uploadId: string) {
    const upload = await this.ownedUpload(userId, uploadId);
    const [sim, student] = await Promise.all([
      upload.simulationId ? this.prisma.simulation.findUnique({ where: { id: upload.simulationId }, select: { id: true, title: true } }) : null,
      this.prisma.user.findUnique({ where: { id: upload.studentId }, select: { email: true, profile: { select: { firstName: true, lastName: true } } } }),
    ]);
    const p = upload.processing;
    const meta = (upload.metaJson ?? {}) as { width?: number; height?: number };
    const questions = (p?.detailsJson ?? []) as unknown as QuestionReading[];
    return {
      id: upload.id,
      status: upload.status,
      simulation: sim,
      studentId: upload.studentId,
      studentName: student ? studentName(student) : null,
      scannedByMe: upload.scannedById === userId,
      sheetCode: upload.sheetCode,
      batchId: upload.batchId,
      page: upload.pageIndex !== null ? upload.pageIndex + 1 : null,
      hasImage: Boolean(upload.image),
      image: { width: meta.width ?? null, height: meta.height ?? null },
      questions,
      answers: p?.detectedAnswers ?? {},
      adjusted: (p?.adjustedJson ?? []) as number[],
      warnings: (p?.warningsJson ?? []) as string[],
      message: p?.errorMessage ?? null,
      reviewCount: upload.status === AnswerSheetStatus.NEEDS_REVIEW ? questions.filter(needsReview).length : 0,
      result: p?.submission ? { correct: p.submission.correct, total: p.submission.total, reviewed: Boolean(p.submission.reviewedBy), finalizedAt: p.submission.finalizedAt } : null,
      createdAt: upload.createdAt,
    };
  }

  async getImage(userId: string, uploadId: string) {
    const upload = await this.ownedUpload(userId, uploadId);
    if (!upload.image) throw new NotFoundException('Esta leitura não guardou a imagem.');
    return { mime: upload.imageMime ?? 'image/png', bytes: Buffer.from(upload.image) };
  }

  /** O PDF enviado — só para quem o enviou. */
  async getBatchPdf(userId: string, batchId: string) {
    const batch = await this.prisma.answerSheetBatch.findFirst({ where: { id: batchId, scannedById: userId } });
    if (!batch) throw new NotFoundException('PDF não encontrado.');
    return Buffer.from(batch.pdf);
  }

  /**
   * Conferência do corretor: `answers` traz as questões que ele ajustou —
   * qualquer uma, não só as duvidosas (ex.: bolha pintada que a leitura não
   * pegou). As duvidosas precisam estar todas resolvidas. Confirmar lança a
   * nota; numa folha já lançada, corrige a nota.
   */
  async review(userId: string, uploadId: string, answers: { number: number; selected: number }[]) {
    const upload = await this.ownedUpload(userId, uploadId);
    if (!upload.processing) throw new ConflictException('Esta leitura não tem resultado.');
    if (upload.status === AnswerSheetStatus.COMPLETED && !upload.processing.submission) {
      throw new ConflictException('A nota deste aluno veio de outro envio do simulado; esta folha não pode alterá-la.');
    }
    if (upload.processing.submission?.finalizedAt) {
      throw new ConflictException('A correção desta folha já foi finalizada: a nota e o domínio por tópico não mudam mais.');
    }
    const details = (upload.processing.detailsJson ?? []) as unknown as QuestionReading[];
    const current = (upload.processing.detectedAnswers ?? {}) as Record<string, number>;
    const final: Record<number, number> = Object.fromEntries(details.map((q) => [q.number, current[String(q.number)] ?? q.selected ?? 0]));
    const pending = new Set(upload.status === AnswerSheetStatus.NEEDS_REVIEW ? details.filter(needsReview).map((q) => q.number) : []);
    const sim = await this.loadSimulation(upload.simulationId!);
    const adjusted = new Set((upload.processing.adjustedJson ?? []) as number[]);
    for (const a of answers) {
      const item = sim.items.find((i) => i.position === a.number);
      if (!item) throw new BadRequestException(`Questão ${a.number} não existe neste simulado.`);
      const count = Array.isArray(item.alternatives) ? item.alternatives.length : 5;
      if (!Number.isInteger(a.selected) || a.selected < 0 || a.selected > count) throw new BadRequestException(`Resposta inválida na questão ${a.number}.`);
      const read = details.find((q) => q.number === a.number)?.selected ?? 0;
      if (a.selected !== read) adjusted.add(a.number);
      else adjusted.delete(a.number);
      final[a.number] = a.selected;
      pending.delete(a.number);
    }
    if (pending.size) throw new BadRequestException(`Faltam conferir as questões ${[...pending].join(', ')}.`);
    await this.finalize(upload.id, userId, final, [...adjusted].sort((a, b) => a - b));
    return this.getScan(userId, uploadId);
  }

  /**
   * Lançamento final: aplica o domínio por tópico do aluno com as respostas
   * definitivas, uma única vez, e trava a folha. A marcação de finalizada e
   * o domínio vão na mesma transação — duas finalizações simultâneas não
   * contam o simulado duas vezes.
   */
  async finalizeScan(userId: string, uploadId: string) {
    const upload = await this.ownedUpload(userId, uploadId);
    const submission = upload.processing?.submission;
    if (!submission) throw new ConflictException('Lance a nota antes de finalizar a correção.');
    if (submission.finalizedAt) return this.getScan(userId, uploadId);
    const answers = Object.entries(submission.finalAnswers as Record<string, number>).map(([position, selectedPosition]) => ({ position: Number(position), selectedPosition }));
    await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.answerSheetSubmission.updateMany({ where: { id: submission.id, finalizedAt: null }, data: { finalizedAt: new Date() } });
        if (!claimed.count) return;
        await this.simulations.registerSimulationMastery(submission.studentId, submission.simulationId, answers, tx);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    return this.getScan(userId, uploadId);
  }

  /** Finaliza de uma vez as folhas do PDF com nota lançada. */
  async finalizeBatch(userId: string, batchId: string) {
    const batch = await this.prisma.answerSheetBatch.findFirst({ where: { id: batchId, scannedById: userId }, include: { uploads: { include: { processing: { include: { submission: true } } } } } });
    if (!batch) throw new NotFoundException('PDF não encontrado.');
    let finalized = 0;
    let notPosted = 0;
    for (const upload of batch.uploads) {
      const submission = upload.processing?.submission;
      if (!submission) {
        notPosted++;
        continue;
      }
      if (submission.finalizedAt) continue;
      await this.finalizeScan(userId, upload.id);
      finalized++;
    }
    return { finalized, notPosted };
  }

  /** Lança de uma vez as folhas do PDF que não têm nenhuma questão duvidosa. */
  async confirmBatch(userId: string, batchId: string) {
    const batch = await this.prisma.answerSheetBatch.findFirst({ where: { id: batchId, scannedById: userId }, include: { uploads: { include: { processing: true } } } });
    if (!batch) throw new NotFoundException('PDF não encontrado.');
    let confirmed = 0;
    let pending = 0;
    for (const upload of batch.uploads) {
      if (upload.status !== AnswerSheetStatus.NEEDS_REVIEW || !upload.processing) continue;
      const details = (upload.processing.detailsJson ?? []) as unknown as QuestionReading[];
      if (details.some(needsReview)) {
        pending++;
        continue;
      }
      await this.finalize(upload.id, userId, Object.fromEntries(details.map((q) => [q.number, q.selected ?? 0])), []);
      confirmed++;
    }
    return { confirmed, pending };
  }

  async list(userId: string, simulationId?: string) {
    const rows = await this.prisma.answerSheetUpload.findMany({
      where: { OR: [{ studentId: userId }, { scannedById: userId }], ...(simulationId ? { simulationId } : {}), processing: { detailsJson: { not: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, status: true, createdAt: true, studentId: true, batchId: true, pageIndex: true,
        simulation: { select: { id: true, title: true } },
        student: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        processing: { select: { detailsJson: true, submission: { select: { correct: true, total: true, finalizedAt: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      simulation: r.simulation,
      studentName: studentName(r.student),
      batchId: r.batchId,
      page: r.pageIndex !== null ? r.pageIndex + 1 : null,
      reviewCount: r.status === AnswerSheetStatus.NEEDS_REVIEW ? ((r.processing?.detailsJson ?? []) as unknown as QuestionReading[]).filter(needsReview).length : 0,
      result: r.processing?.submission ?? null,
    }));
  }
}
