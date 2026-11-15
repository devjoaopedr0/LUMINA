import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MaterialKind, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { MATERIAL_SYSTEM, askPrompt, parseAsk, parseQuestions, questionsPrompt, type MaterialCitation } from './material-ai';
import { decodeMaterialPdf, extractPages } from './material-pdf';
import { contextFromHits, searchPages, type PageText } from './material-text';
import { AskMaterialsDto, CreateMaterialDto, GenerateQuestionsDto, ListMaterialsQueryDto } from './materials.dto';

const FILE_KINDS: MaterialKind[] = ['PDF', 'SLIDES', 'APOSTILA', 'LISTA'];
const URL_KINDS: MaterialKind[] = ['LINK', 'VIDEO'];
const MIN_TEXT_CHARS = 50;

const LIST_SELECT = {
  id: true, ownerId: true, classId: true, subjectId: true, topicId: true, title: true, description: true, kind: true, url: true,
  mimeType: true, sizeBytes: true, pageCount: true, textStatus: true, createdAt: true,
  class: { select: { name: true } },
  owner: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.MaterialSelect;

/** Modelos da LuminIA nos materiais: AI_NOTEBOOK_MODELS → AI_ESSAY_MODELS → padrão. */
function materialModels(env: Record<string, string | undefined> = process.env): string[] {
  const parse = (raw?: string) => (raw ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const own = parse(env.AI_NOTEBOOK_MODELS);
  return own.length ? own : parse(env.AI_ESSAY_MODELS);
}

/**
 * Central de materiais (itens 48 a 50). Professor envia e organiza; alunos
 * das turmas leem, buscam e perguntam à LuminIA com base no material.
 * Quem vê um material: o dono e, se ele estiver numa turma, os alunos e
 * professores dessa turma.
 */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly planUsage?: PlanUsageService,
  ) {}

  /** Turmas cujos materiais o usuário vê (membro ou professor). */
  private async classIdsOf(userId: string): Promise<string[]> {
    const classes = await this.prisma.class.findMany({
      where: { archived: false, OR: [{ members: { some: { userId } } }, { teachers: { some: { userId } } }] },
      select: { id: true },
    });
    return classes.map((c) => c.id);
  }

  private async visibleWhere(userId: string, classId?: string): Promise<Prisma.MaterialWhereInput> {
    const classIds = await this.classIdsOf(userId);
    if (classId) {
      if (!classIds.includes(classId)) throw new NotFoundException('Turma não encontrada.');
      return { classId };
    }
    return { OR: [{ ownerId: userId }, { classId: { in: classIds } }] };
  }

  private async findVisible(id: string, userId: string) {
    const where = await this.visibleWhere(userId);
    const material = await this.prisma.material.findFirst({ where: { AND: [{ id }, where] } });
    if (!material) throw new NotFoundException('Material não encontrado.');
    return material;
  }

  /** Dono ou professor da turma do material. */
  private async assertCanManage(material: { ownerId: string; classId: string | null }, userId: string) {
    if (material.ownerId === userId) return;
    if (material.classId) {
      const teaches = await this.prisma.class.count({ where: { id: material.classId, teachers: { some: { userId } } } });
      if (teaches) return;
    }
    throw new ForbiddenException('Só quem enviou o material ou um professor da turma pode fazer isso.');
  }

  async create(userId: string, dto: CreateMaterialDto) {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId }, select: { userId: true } });
    if (!teacher) throw new ForbiddenException('Apenas professores enviam materiais.');
    if (dto.classId) {
      const teaches = await this.prisma.class.count({ where: { id: dto.classId, archived: false, teachers: { some: { userId } } } });
      if (!teaches) throw new ForbiddenException('Você só pode publicar materiais nas suas turmas.');
    }

    let file: Buffer | null = null;
    let pages: string[] = [];
    if (FILE_KINDS.includes(dto.kind)) {
      if (!dto.file) throw new BadRequestException('Envie o arquivo em PDF.');
      file = decodeMaterialPdf(dto.file);
      pages = await extractPages(file);
    } else if (URL_KINDS.includes(dto.kind)) {
      if (!dto.url) throw new BadRequestException('Informe o endereço do link ou do vídeo.');
    }
    const textChars = pages.reduce((sum, p) => sum + p.length, 0);

    const material = await this.prisma.material.create({
      data: {
        ownerId: userId,
        classId: dto.classId ?? null,
        subjectId: dto.subjectId ?? null,
        topicId: dto.topicId ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        kind: dto.kind,
        url: URL_KINDS.includes(dto.kind) ? dto.url!.trim() : null,
        file: file ? new Uint8Array(file) : null,
        mimeType: file ? 'application/pdf' : null,
        sizeBytes: file?.length ?? null,
        pageCount: file ? pages.length : null,
        textStatus: file ? (textChars >= MIN_TEXT_CHARS ? 'OK' : 'NO_TEXT') : 'NONE',
        pages: textChars >= MIN_TEXT_CHARS ? { create: pages.map((text, i) => ({ page: i + 1, text })).filter((p) => p.text.length > 0) } : undefined,
      },
      select: LIST_SELECT,
    });
    return this.toView(material, userId);
  }



  private toView(m: Prisma.MaterialGetPayload<{ select: typeof LIST_SELECT }>, userId: string) {
    const ownerName = [m.owner.profile?.firstName, m.owner.profile?.lastName].filter(Boolean).join(' ') || m.owner.email;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      kind: m.kind,
      url: m.url,
      hasFile: !!m.mimeType,
      sizeBytes: m.sizeBytes,
      pageCount: m.pageCount,
      textStatus: m.textStatus,
      classId: m.classId,
      className: m.class?.name ?? null,
      subjectId: m.subjectId,
      topicId: m.topicId,
      ownerName,
      isOwner: m.ownerId === userId,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async list(userId: string, query: ListMaterialsQueryDto) {
    const where = await this.visibleWhere(userId, query.classId);
    const rows = await this.prisma.material.findMany({
      where: { AND: [where, query.subjectId ? { subjectId: query.subjectId } : {}, query.topicId ? { topicId: query.topicId } : {}, query.kind ? { kind: query.kind } : {}] },
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toView(r, userId));
  }

  async file(id: string, userId: string) {
    const material = await this.findVisible(id, userId);
    if (!material.file) throw new NotFoundException('Este material não tem arquivo.');
    return { buffer: Buffer.from(material.file), title: material.title };
  }

  async remove(id: string, userId: string) {
    const material = await this.findVisible(id, userId);
    await this.assertCanManage(material, userId);
    await this.prisma.material.delete({ where: { id } });
  }

  /** Páginas dos materiais visíveis (opcionalmente de uma turma ou de um material). */
  private async pagesFor(userId: string, opts: { classId?: string; materialId?: string }): Promise<Array<PageText & { title: string }>> {
    const where = opts.materialId ? { id: (await this.findVisible(opts.materialId, userId)).id } : await this.visibleWhere(userId, opts.classId);
    const rows = await this.prisma.materialPage.findMany({
      where: { material: where },
      select: { materialId: true, page: true, text: true, material: { select: { title: true } } },
      take: 5000,
    });
    return rows.map((r) => ({ materialId: r.materialId, page: r.page, text: r.text, title: r.material.title }));
  }

  /** Busca inteligente (item 50): trechos com material e página. Também acha título e descrição de links e vídeos. */
  async search(userId: string, q: string, classId?: string) {
    const pages = await this.pagesFor(userId, { classId });
    const titles = new Map(pages.map((p) => [p.materialId, p.title]));
    const hits = searchPages(pages, q, 15).map((h) => ({ materialId: h.materialId, title: titles.get(h.materialId) ?? '', page: h.page, snippet: h.snippet, matched: h.matched }));
    const where = await this.visibleWhere(userId, classId);
    const term = q.trim();
    const byTitle = term.length >= 3
      ? await this.prisma.material.findMany({
          where: { AND: [where, { OR: [{ title: { contains: term, mode: 'insensitive' } }, { description: { contains: term, mode: 'insensitive' } }] }] },
          select: { id: true, title: true, kind: true, url: true },
          take: 10,
        })
      : [];
    return { query: q, pages: hits, materials: byTitle };
  }

  /** LuminIA responde com base nos materiais (item 49), citando material e página. */
  async ask(userId: string, dto: AskMaterialsDto) {
    if (!this.ai) throw new ServiceUnavailableException('A LuminIA não está disponível agora.');
    let pages = await this.pagesFor(userId, { classId: dto.classId, materialId: dto.materialId });
    if (dto.materialId && dto.page) pages = pages.filter((p) => p.page === dto.page);
    const hits = dto.page ? pages.map((p) => ({ ...p, score: 1, snippet: '', matched: [] })) : searchPages(pages, dto.question, 4);
    if (!hits.length) {
      return { found: false, answer: 'Não encontrei esse assunto nos materiais disponíveis. Tente outras palavras ou pergunte ao professor.', citations: [], model: null };
    }
    const sent: MaterialCitation[] = hits.map((h) => ({ materialId: h.materialId, title: pages.find((p) => p.materialId === h.materialId)!.title, page: h.page }));
    const context = contextFromHits(hits.map((h) => ({ ...h, title: pages.find((p) => p.materialId === h.materialId)!.title })));
    const run = async () => {
      const result = await this.ai!.generateStructured({ system: MATERIAL_SYSTEM, prompt: askPrompt(dto.question, context, !!dto.page), maxTokens: 900, timeoutMs: 45_000, temperature: 0.2, models: materialModels() });
      const parsed = result?.text ? parseAsk(result.text, sent) : null;
      if (!parsed) throw new ServiceUnavailableException('A LuminIA não conseguiu responder agora. Tente de novo.');
      return { ...parsed, model: result?.model ?? null };
    };
    return this.planUsage ? this.planUsage.withQuota(userId, 'LUMINIA_MESSAGE', run) : run();
  }

  /** Questões a partir do material (item 49), para o professor revisar antes de salvar. */
  async generateQuestions(id: string, userId: string, dto: GenerateQuestionsDto) {
    if (!this.ai) throw new ServiceUnavailableException('A LuminIA não está disponível agora.');
    const material = await this.findVisible(id, userId);
    await this.assertCanManage(material, userId);
    const all = await this.pagesFor(userId, { materialId: id });
    if (!all.length) throw new BadRequestException('Este material não tem texto para gerar questões (PDF digitalizado ou link).');
    const chosen = dto.pages?.length ? all.filter((p) => dto.pages!.includes(p.page)) : all;
    if (!chosen.length) throw new BadRequestException('As páginas escolhidas não têm texto.');
    const subject = material.subjectId ? (await this.prisma.subject.findUnique({ where: { id: material.subjectId }, select: { name: true } }))?.name ?? null : null;
    const count = dto.count ?? 3;
    const run = async () => {
      const result = await this.ai!.generateStructured({
        system: MATERIAL_SYSTEM,
        prompt: questionsPrompt(contextFromHits(chosen, 9000), count, subject),
        maxTokens: 700 * count + 400,
        timeoutMs: 90_000,
        temperature: 0.4,
        models: materialModels(),
      });
      const questions = result?.text ? parseQuestions(result.text, chosen.map((p) => p.page)) : [];
      if (!questions.length) throw new ServiceUnavailableException('A LuminIA não gerou questões válidas. Tente de novo ou escolha outras páginas.');
      return { materialId: id, subjectId: material.subjectId, topicId: material.topicId, questions, model: result?.model ?? null };
    };
    return this.planUsage ? this.planUsage.withQuota(userId, 'LUMINIA_MESSAGE', run) : run();
  }
}
