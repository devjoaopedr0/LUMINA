import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountType, ExamPaperStatus } from '@prisma/client';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { UserWithProfile } from '../users/users.repository';
import { EnemImportService } from './import/enem/enem-import.service';
import { QuestionImportService } from './import/question-import.service';
import { QuestionsService } from './questions.service';
import { QuestionAccessService } from './question-access.service';

export interface EnemPaperImportItem {
  year: number;
  day: 1 | 2;
  provaUrl: string;
  gabaritoUrl: string;
}

export interface EnemPaperImportResult {
  year: number;
  day: number;
  status: 'OK' | 'ERROR';
  paperId?: string;
  edition?: string;
  totalPages?: number;
  questions?: { imported: number; duplicates: number; invalid: number; skipped: number };
  linked?: number;
  message?: string;
}

/** Edição do caderno: "D1" ou "D2", com a cor quando o gabarito informa ("D2-AMARELO"). */
export function enemEdition(day: number, bookletColor: string | null): string {
  const color = bookletColor?.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return `D${day}${color ? `-${color}` : ''}`;
}

/** Número da questão → id no banco, preferindo a versão sem língua ou a de inglês. */
export function questionIdsByNumber(rows: { id: string; sourceId: string | null; examNumber: number | null }[]): Map<number, string> {
  const map = new Map<number, string>();
  const rank = (sourceId: string | null) => (sourceId?.endsWith('-espanhol') ? 1 : 0);
  for (const row of [...rows].sort((a, b) => rank(a.sourceId) - rank(b.sourceId))) {
    if (row.examNumber !== null && !map.has(row.examNumber)) map.set(row.examNumber, row.id);
  }
  return map;
}

const PDF_CACHE_DIR = join(__dirname, '..', '..', '.cache', 'exam-pdfs');
const INEP_PREFIX = 'https://download.inep.gov.br/';

/**
 * Acervo de provas anteriores a partir dos cadernos oficiais do INEP:
 * importação em lote (questões no banco + prova no acervo + vínculo
 * questão → página) e o PDF da prova servido pelo próprio backend.
 */
@Injectable()
export class ExamPaperImportService {
  private readonly logger = new Logger(ExamPaperImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enem: EnemImportService,
    private readonly importer: QuestionImportService,
    private readonly questions: QuestionsService,
    private readonly access: QuestionAccessService,
  ) {}

  /**
   * Importa vários cadernos do ENEM, um de cada vez (cada PDF tem dezenas de
   * MB). Um caderno que falha não interrompe os outros: o relatório diz o que
   * entrou e o que deu errado em cada um.
   */
  async importEnemBatch(user: UserWithProfile, items: EnemPaperImportItem[], publish: boolean): Promise<{ items: EnemPaperImportResult[] }> {
    const workspace = await this.importWorkspace(user);
    const results: EnemPaperImportResult[] = [];
    for (const item of items) {
      try {
        results.push(await this.importOne(item, workspace.id, user.id, publish));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Importação do ENEM ${item.year} dia ${item.day} falhou: ${message}`);
        results.push({ year: item.year, day: item.day, status: 'ERROR', message });
      }
    }
    return { items: results };
  }

  /**
   * Quem importa: a administração da plataforma (as questões vão para o banco
   * central) ou quem tem o cargo de gestor do banco (QUESTION_MANAGE). As duas
   * coisas são separadas no app: o admin não recebe o cargo do banco
   * automaticamente.
   */
  private async importWorkspace(user: UserWithProfile) {
    if (user.accountType === AccountType.ADMIN) {
      const bank = await this.access.getBankWorkspace();
      if (!bank) throw new NotFoundException('Banco central de questões não encontrado.');
      return bank;
    }
    try {
      return await this.questions.getImportWorkspace(user.id, 'BANK');
    } catch {
      throw new ForbiddenException('Só a administração ou a gestão do banco de questões importa provas para o acervo.');
    }
  }

  private async importOne(item: EnemPaperImportItem, workspaceId: string, userId: string, publish: boolean): Promise<EnemPaperImportResult> {
    const fetched = await this.enem.fetchExam(item);
    const report = await this.importer.importScrapedQuestions(fetched.questions, fetched.skipped, workspaceId, userId);

    // Questões já existentes (reimportação) também entram no vínculo.
    const prefix = `enem-${item.year}-d${item.day}-q`;
    const rows = await this.prisma.question.findMany({
      where: { workspaceId, sourceId: { startsWith: prefix } },
      select: { id: true, sourceId: true, examNumber: true },
    });
    const ids = questionIdsByNumber(rows);

    const exam =
      (await this.prisma.exam.findFirst({ where: { name: { equals: 'ENEM', mode: 'insensitive' }, year: item.year }, select: { id: true } })) ??
      (await this.prisma.exam.create({ data: { name: 'ENEM', year: item.year, institution: 'INEP' }, select: { id: true } }));
    const edition = enemEdition(item.day, fetched.bookletColor);
    const now = new Date();
    const data = {
      pdfUrl: item.provaUrl,
      metadataJson: {
        day: item.day,
        bookletColor: fetched.bookletColor,
        totalPages: fetched.totalPages,
        sourceUrl: item.provaUrl,
        gabaritoUrl: item.gabaritoUrl,
        hasGabarito: Object.keys(fetched.answers).length > 0,
        hasCaderno: true,
        importedAt: now.toISOString(),
      },
      gabaritoJson: fetched.answers,
      ...(publish ? { status: ExamPaperStatus.PUBLISHED, publishedAt: now } : {}),
    };
    const paper = await this.prisma.examPaper.upsert({
      where: { examId_year_edition: { examId: exam.id, year: item.year, edition } },
      create: { examId: exam.id, year: item.year, edition, status: publish ? ExamPaperStatus.PUBLISHED : ExamPaperStatus.DRAFT, publishedAt: publish ? now : null, ...data },
      update: data,
    });

    // Vínculo questão → página, refeito a cada importação.
    const links = [...ids.entries()].map(([number, questionId]) => ({
      paperId: paper.id,
      questionId,
      number,
      pageNumber: fetched.pageOf[number] ?? 1,
      area: fetched.questions.find((q) => q.examNumber === number)?.subject ?? null,
    }));
    await this.prisma.$transaction([
      this.prisma.examPaperQuestion.deleteMany({ where: { paperId: paper.id } }),
      this.prisma.examPaperQuestion.createMany({ data: links }),
    ]);

    return {
      year: item.year,
      day: item.day,
      status: 'OK',
      paperId: paper.id,
      edition,
      totalPages: fetched.totalPages,
      questions: { imported: report.imported, duplicates: report.duplicates, invalid: report.invalid, skipped: fetched.skipped.length },
      linked: links.length,
    };
  }

  /**
   * PDF da prova para o visualizador embutido. O navegador não baixa direto
   * do INEP (sem CORS e com cadeia de certificados incompleta), então o
   * backend busca uma vez, guarda em disco e serve daí. Só PDFs do INEP.
   */
  async examPaperPdf(user: UserWithProfile, paperId: string): Promise<{ path: string; size: number }> {
    const paper = await this.prisma.examPaper.findUnique({ where: { id: paperId }, select: { id: true, status: true, pdfUrl: true } });
    const visible = paper && (paper.status === ExamPaperStatus.PUBLISHED || user.accountType === AccountType.ADMIN);
    if (!paper || !visible || !paper.pdfUrl) throw new NotFoundException('PDF da prova não encontrado.');
    if (!paper.pdfUrl.startsWith(INEP_PREFIX)) throw new NotFoundException('PDF da prova não disponível para visualização.');

    const path = join(PDF_CACHE_DIR, `${paper.id}.pdf`);
    if (!existsSync(path)) {
      const bytes = await this.enem.download(paper.pdfUrl);
      mkdirSync(PDF_CACHE_DIR, { recursive: true });
      writeFileSync(path, bytes);
    }
    return { path, size: statSync(path).size };
  }

  openPdf(path: string) {
    return createReadStream(path);
  }
}
