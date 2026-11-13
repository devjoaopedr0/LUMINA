import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateFormulaDto,
  CreateRepertoireDto,
  UpdateFormulaDto,
  UpdateRepertoireDto,
  FORMULA_DISCIPLINES,
  REPERTOIRE_THEMES,
} from './notebooks.dto';
import { NotebooksService } from './notebooks.service';
import { PrismaService } from '../database/prisma.service';

function setup() {
  const formula = {
    id: 'formula-1',
    userId: 'owner',
    name: 'Bhaskara',
    discipline: 'MATEMATICA',
    topic: 'Funções quadráticas',
    latex: 'x = (-b ± √(b²-4ac)) / 2a',
    description: null,
    isFavorite: false,
  };
  const repertoire = {
    id: 'repertoire-1',
    userId: 'owner',
    title: 'George Orwell — 1984',
    summary: 'A vigilância sobre a linguagem controla o pensamento.',
    source: 'Romance',
    year: 1949,
    theme: 'POLITICA',
    keywords: ['vigilancia', 'liberdade'],
    isStudied: false,
  };
  const db = {
    formula: {
      findMany: vi.fn().mockResolvedValue([formula]),
      findFirst: vi.fn().mockResolvedValue(formula),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...formula, ...data })),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...formula, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    repertoire: {
      findMany: vi.fn().mockResolvedValue([repertoire]),
      findFirst: vi.fn().mockResolvedValue(repertoire),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...repertoire, ...data })),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...repertoire, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  return { db, service: new NotebooksService(db as unknown as PrismaService), formula, repertoire };
}

const dto = <T extends object>(cls: new () => T, data: Record<string, unknown>) => plainToInstance(cls, data) as T;

describe('Caderno de fórmulas (item 21)', () => {
  it('cria com disciplina padrão e normaliza o assunto vazio para nulo', async () => {
    const { service, db } = setup();
    await service.createFormula('owner', dto(CreateFormulaDto, { name: 'Bhaskara', latex: 'x = ...', topic: '   ' }));
    expect(db.formula.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner',
        name: 'Bhaskara',
        discipline: 'MATEMATICA',
        topic: null,
        latex: 'x = ...',
        description: null,
        isFavorite: false,
        isMemorized: false,
        isPlatform: false,
      }),
    });
  });

  it('rejeita fórmula sem nome ou sem LaTeX, e disciplina desconhecida', async () => {
    const base = { name: 'Bhaskara', latex: 'x = ...' };
    expect(await validate(dto(CreateFormulaDto, { ...base, name: '' }))).not.toHaveLength(0);
    expect(await validate(dto(CreateFormulaDto, { ...base, latex: '' }))).not.toHaveLength(0);
    expect(await validate(dto(CreateFormulaDto, { ...base, discipline: 'GEOGRAFIA' }))).not.toHaveLength(0);
    expect(await validate(dto(CreateFormulaDto, base))).toHaveLength(0);
    for (const discipline of FORMULA_DISCIPLINES) {
      expect(await validate(dto(CreateFormulaDto, { ...base, discipline }))).toHaveLength(0);
    }
  });

  it('atualiza só os campos enviados, preservando os demais', async () => {
    const { service, db } = setup();
    await service.updateFormula('owner', 'formula-1', dto(UpdateFormulaDto, { isFavorite: true }));
    expect(db.formula.update).toHaveBeenCalledWith({ where: { id: 'formula-1' }, data: { isFavorite: true } });
  });

  it('caderno de fórmulas é do aluno: outro usuário não lê, edita nem apaga', async () => {
    const { service, db } = setup();
    db.formula.findFirst.mockResolvedValue(null);
    await expect(service.getFormula('intruso', 'formula-1')).rejects.toThrow('Fórmula não encontrada');
    await expect(service.updateFormula('intruso', 'formula-1', dto(UpdateFormulaDto, { isFavorite: true }))).rejects.toThrow('Fórmula não encontrada');
    await expect(service.deleteFormula('intruso', 'formula-1')).rejects.toThrow('Fórmula não encontrada');
    expect(db.formula.update).not.toHaveBeenCalled();
    expect(db.formula.delete).not.toHaveBeenCalled();
  });

  it('remove a fórmula do próprio aluno', async () => {
    const { service, db } = setup();
    await expect(service.deleteFormula('owner', 'formula-1')).resolves.toEqual({ deleted: true, id: 'formula-1' });
    expect(db.formula.delete).toHaveBeenCalledWith({ where: { id: 'formula-1' } });
  });
});

describe('Caderno de repertórios (item 22)', () => {
  it('cria com tema padrão e palavras-chave normalizadas', async () => {
    const { service, db } = setup();
    await service.createRepertoire(
      'owner',
      dto(CreateRepertoireDto, {
        title: '1984',
        summary: 'A vigilância sobre a linguagem controla o pensamento.',
        keywords: ['Vigilancia', '  liberdade ', 'Vigilancia', 'LIBERDADE'],
      }),
    );
    expect(db.repertoire.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ theme: 'OUTRO', source: null, year: null, keywords: ['vigilancia', 'liberdade'] }),
    });
  });

  it('rejeita repertório curto demais, ano fora da faixa e tema inválido', async () => {
    const base = { title: '1984', summary: 'A vigilância controla o pensamento.' };
    expect(await validate(dto(CreateRepertoireDto, { ...base, summary: 'curto' }))).not.toHaveLength(0);
    // Repertório histórico pode ser antigo (ex.: Aristóteles); fora de -3000..2100 é erro.
    expect(await validate(dto(CreateRepertoireDto, { ...base, year: 1848 }))).toHaveLength(0);
    expect(await validate(dto(CreateRepertoireDto, { ...base, year: -4000 }))).not.toHaveLength(0);
    expect(await validate(dto(CreateRepertoireDto, { ...base, year: 2200 }))).not.toHaveLength(0);
    expect(await validate(dto(CreateRepertoireDto, { ...base, theme: 'ESPORTE' }))).not.toHaveLength(0);
    expect(await validate(dto(CreateRepertoireDto, { ...base, year: 1949 }))).toHaveLength(0);
    for (const theme of REPERTOIRE_THEMES) {
      expect(await validate(dto(CreateRepertoireDto, { ...base, theme }))).toHaveLength(0);
    }
  });

  it('marca como estudado sem apagar o resto do registro', async () => {
    const { service, db } = setup();
    await service.updateRepertoire('owner', 'repertoire-1', dto(UpdateRepertoireDto, { isStudied: true }));
    expect(db.repertoire.update).toHaveBeenCalledWith({ where: { id: 'repertoire-1' }, data: { isStudied: true } });
  });

  it('caderno de repertórios é do aluno: intruso não apaga', async () => {
    const { service, db } = setup();
    db.repertoire.findFirst.mockResolvedValue(null);
    await expect(service.deleteRepertoire('intruso', 'repertoire-1')).rejects.toThrow('Repertório não encontrado');
    expect(db.repertoire.delete).not.toHaveBeenCalled();
  });
});
