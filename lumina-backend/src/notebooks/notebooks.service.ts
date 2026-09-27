import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateFormulaDto,
  CreateRepertoireDto,
  UpdateFormulaDto,
  UpdateRepertoireDto,
} from './notebooks.dto';

const MAX_KEYWORDS = 20;

/** Normaliza as palavras-chave do repertório: minúsculas, sem espaço nas
 * pontas e sem repetição, para que achar o repertório na hora da redação não
 * dependa de como o aluno digitou ("Vigilância" e "vigilancia" colidem). */
function normalizeKeywords(keywords?: string[] | null): string[] {
  if (!keywords) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push(keyword);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

@Injectable()
export class NotebooksService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- fórmulas

  listFormulas(userId: string) {
    return this.prisma.formula.findMany({
      where: { userId },
      orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }],
    });
  }

  getFormula(userId: string, id: string) {
    return this.findFormula(userId, id);
  }

  createFormula(userId: string, dto: CreateFormulaDto) {
    return this.prisma.formula.create({
      data: {
        userId,
        name: dto.name,
        discipline: dto.discipline ?? 'MATEMATICA',
        topic: dto.topic ?? null,
        latex: dto.latex,
        description: dto.description ?? null,
        isFavorite: dto.isFavorite ?? false,
      },
    });
  }

  async updateFormula(userId: string, id: string, dto: UpdateFormulaDto) {
    const formula = await this.findFormula(userId, id);
    return this.prisma.formula.update({
      where: { id: formula.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.discipline !== undefined ? { discipline: dto.discipline } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.latex !== undefined ? { latex: dto.latex } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
      },
    });
  }

  async deleteFormula(userId: string, id: string) {
    const formula = await this.findFormula(userId, id);
    await this.prisma.formula.delete({ where: { id: formula.id } });
    return { deleted: true as const, id: formula.id };
  }

  /** Toda leitura/edição passa pelo par (id, userId): o filtro no banco
   * evita o 404-vs-403 clássico, em que o aluno descobre que a fórmula de
   * outra pessoa existe só quando a dele não existe. */
  private async findFormula(userId: string, id: string) {
    const formula = await this.prisma.formula.findFirst({ where: { id, userId } });
    if (!formula) throw new NotFoundException('Fórmula não encontrada.');
    return formula;
  }

  // ---------------------------------------------------------- repertórios

  listRepertoires(userId: string) {
    return this.prisma.repertoire.findMany({
      where: { userId },
      orderBy: [{ theme: 'asc' }, { title: 'asc' }],
    });
  }

  getRepertoire(userId: string, id: string) {
    return this.findRepertoire(userId, id);
  }

  createRepertoire(userId: string, dto: CreateRepertoireDto) {
    return this.prisma.repertoire.create({
      data: {
        userId,
        title: dto.title,
        summary: dto.summary,
        source: dto.source ?? null,
        year: dto.year ?? null,
        theme: dto.theme ?? 'OUTRO',
        keywords: normalizeKeywords(dto.keywords),
        isStudied: dto.isStudied ?? false,
      },
    });
  }

  async updateRepertoire(userId: string, id: string, dto: UpdateRepertoireDto) {
    const repertoire = await this.findRepertoire(userId, id);
    return this.prisma.repertoire.update({
      where: { id: repertoire.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
        ...(dto.keywords !== undefined ? { keywords: normalizeKeywords(dto.keywords) } : {}),
        ...(dto.isStudied !== undefined ? { isStudied: dto.isStudied } : {}),
      },
    });
  }

  async deleteRepertoire(userId: string, id: string) {
    const repertoire = await this.findRepertoire(userId, id);
    await this.prisma.repertoire.delete({ where: { id: repertoire.id } });
    return { deleted: true as const, id: repertoire.id };
  }

  private async findRepertoire(userId: string, id: string) {
    const repertoire = await this.prisma.repertoire.findFirst({ where: { id, userId } });
    if (!repertoire) throw new NotFoundException('Repertório não encontrado.');
    return repertoire;
  }
}
