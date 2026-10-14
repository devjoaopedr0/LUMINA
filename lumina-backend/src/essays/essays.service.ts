import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { countWords, SaveEssayDto } from './essays.dto';

const summarySelect = { id: true, title: true, theme: true, wordCount: true, version: true, updatedAt: true, createdAt: true } as const;

@Injectable()
export class EssaysService {
  constructor(private readonly prisma: PrismaService) {}

  async themes(userId: string, year?: number) {
    const [official, authored] = await Promise.all([
      this.prisma.essayTheme.findMany({ where: { exam: 'ENEM', ...(year ? { year } : {}) }, orderBy: { year: 'desc' } }),
      this.prisma.essayTheme.findMany({ where: { createdBy: userId, exam: 'AUTORAL', ...(year ? { year } : {}) }, orderBy: { createdAt: 'desc' } }),
    ]);
    return [...authored, ...official];
  }

  async createTheme(userId: string, title: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacher || !['Língua Portuguesa', 'Literatura', 'Redação'].includes(teacher.subject)) {
      throw new ForbiddenException('Somente professores de Português, Literatura ou Redação podem criar temas.');
    }
    return this.prisma.essayTheme.create({ data: { title: title.trim(), exam: 'AUTORAL', createdBy: userId } });
  }

  create(userId: string) {
    return this.prisma.essay.create({ data: { userId } });
  }

  async list(userId: string, page: number) {
    const rows = await this.prisma.essay.findMany({ where: { userId }, select: summarySelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 21 });
    return { items: rows.slice(0, 20), hasMore: rows.length > 20, page };
  }

  async get(userId: string, id: string) {
    const essay = await this.prisma.essay.findFirst({ where: { id, userId } });
    if (!essay) throw new NotFoundException('Redação não encontrada.');
    return essay;
  }

  async save(userId: string, id: string, data: SaveEssayDto) {
    return this.prisma.$transaction(async tx => {
      const current = await tx.essay.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Redação não encontrada.');
      // Uma resposta perdida pode ser reenviada sem gerar outra versão.
      if (data.version <= current.version && data.title === current.title && data.theme === current.theme && data.content === current.content) return current;
      if (current.version !== data.version) throw new ConflictException('Esta redação foi alterada em outra aba. Compare as versões antes de salvar.');
      const values = { title: data.title, theme: data.theme, content: data.content, wordCount: countWords(data.content), version: current.version + 1 };
      const result = await tx.essay.updateMany({ where: { id, userId, version: current.version }, data: values });
      if (!result.count) throw new ConflictException('Esta redação foi alterada em outra aba. Compare as versões antes de salvar.');
      await tx.essayRevision.create({ data: { essayId: id, ...values } });
      return tx.essay.findUniqueOrThrow({ where: { id } });
    });
  }

  async revisions(userId: string, id: string, page: number) {
    await this.get(userId, id);
    const rows = await this.prisma.essayRevision.findMany({ where: { essayId: id, essay: { userId } },
      select: { id: true, version: true, title: true, theme: true, wordCount: true, createdAt: true },
      orderBy: { version: 'desc' }, skip: (page - 1) * 20, take: 21 });
    return { items: rows.slice(0, 20), hasMore: rows.length > 20, page };
  }

  async revision(userId: string, id: string, version: number) {
    const revision = await this.prisma.essayRevision.findFirst({ where: { essayId: id, version, essay: { userId } } });
    if (!revision) throw new NotFoundException('Versão não encontrada.');
    return revision;
  }

  /** Biblioteca de redações nota 1000 oficiais (ENEM/vestibulares) — item 23.
   * Conteúdo curado/público, sem vínculo com usuário: qualquer autenticado
   * pode consultar, igual ao banco de temas (EssayTheme). */
  async listEssayModels(filters: { year?: number; exam?: string; theme?: string; page: number; limit: number }) {
    const where = {
      ...(filters.year ? { year: filters.year } : {}),
      ...(filters.exam ? { exam: { contains: filters.exam, mode: 'insensitive' as const } } : {}),
      ...(filters.theme ? { theme: { contains: filters.theme, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.essayModel.findMany({
        where,
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.essayModel.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toEssayModelResponse(item)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    };
  }

  async getEssayModel(id: string) {
    const model = await this.prisma.essayModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Modelo de redação não encontrado.');
    return this.toEssayModelResponse(model);
  }

  private toEssayModelResponse(model: {
    id: string; year: number; exam: string; theme: string; text: string;
    competenciesJson: unknown; totalScore: number; pdfUrl: string | null;
    highlightsJson: unknown; createdAt: Date;
  }) {
    return {
      id: model.id,
      year: model.year,
      exam: model.exam,
      theme: model.theme,
      text: model.text,
      competencies: model.competenciesJson as { C1: number; C2: number; C3: number; C4: number; C5: number },
      totalScore: model.totalScore,
      pdfUrl: model.pdfUrl,
      highlights: model.highlightsJson as { C1: string; C2: string; C3: string; C4: string; C5: string } | null,
      createdAt: model.createdAt,
    };
  }
}
