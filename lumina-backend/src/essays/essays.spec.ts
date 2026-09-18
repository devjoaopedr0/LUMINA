import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { SaveEssayDto, countWords } from './essays.dto';
import { EssaysService } from './essays.service';
import { PrismaService } from '../database/prisma.service';

function setup() {
  const row = { id: 'essay', userId: 'owner', title: '', theme: '', content: '', version: 0, wordCount: 0, createdAt: new Date(), updatedAt: new Date() };
  const db = {
    essay: { create: vi.fn().mockResolvedValue(row), findFirst: vi.fn().mockResolvedValue(row), findUniqueOrThrow: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([]) },
    essayRevision: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    essayTheme: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async callback => callback(db));
  return { row, db, service: new EssaysService(db as unknown as PrismaService) };
}
const data = { version: 0, title: 'A leitura', theme: 'Acesso aos livros', content: 'Ler amplia nossa visão.' };

describe('Redações', () => {
  it('professor de Português cria tema pessoal; outra matéria não cria', async () => {
    const { service, db } = setup();
    await expect(service.createTheme('teacher', 'A leitura e a cidadania')).rejects.toThrow('Somente professores');
    db.teacherProfile.findUnique.mockResolvedValue({ subject: 'Língua Portuguesa' });
    await service.createTheme('teacher', 'A leitura e a cidadania');
    expect(db.essayTheme.create).toHaveBeenCalledWith({ data: { title: 'A leitura e a cidadania', exam: 'AUTORAL', createdBy: 'teacher' } });
  });
  it('conta palavras com acentos e ignora pontuação isolada', () => {
    expect(countWords('  Olá, Brasil!\n\nEducação e bem-estar.  ')).toBe(5);
    expect(countWords('...\n')).toBe(0);
  });
  it('permite rascunho vazio, mas rejeita campos ausentes e grandes', async () => {
    expect(await validate(Object.assign(new SaveEssayDto(), { version: 0, title: '', theme: '', content: '' }))).toHaveLength(0);
    for (const invalid of [{ content: undefined }, { content: 'a'.repeat(30001) }, { theme: 'a'.repeat(301) }, { title: 'a'.repeat(161) }, { version: -1 }, { version: 0.5 }]) {
      expect((await validate(Object.assign(new SaveEssayDto(), data, invalid))).length).toBeGreaterThan(0);
    }
  });
  it('cria rascunho vinculado apenas ao usuário autenticado', async () => {
    const { service, db } = setup();
    await service.create('owner');
    expect(db.essay.create).toHaveBeenCalledWith({ data: { userId: 'owner' } });
  });
  it('salva documento e snapshot na mesma transação com versão esperada', async () => {
    const { service, db } = setup();
    await service.save('owner', 'essay', data);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.essay.updateMany).toHaveBeenCalledWith({ where: { id: 'essay', userId: 'owner', version: 0 }, data: { ...data, version: 1, wordCount: 4 } });
    expect(db.essayRevision.create).toHaveBeenCalledWith({ data: { essayId: 'essay', ...data, version: 1, wordCount: 4 } });
  });
  it('reenvio após perda de resposta não cria outra versão', async () => {
    const { service, db, row } = setup();
    Object.assign(row, data, { version: 1 });
    expect(await service.save('owner', 'essay', data)).toBe(row);
    expect(db.essay.updateMany).not.toHaveBeenCalled();
    expect(db.essayRevision.create).not.toHaveBeenCalled();
  });
  it('detecta conflito entre abas sem sobrescrever texto', async () => {
    const { service, db, row } = setup();
    row.version = 2;
    await expect(service.save('owner', 'essay', data)).rejects.toThrow('outra aba');
    expect(db.essay.updateMany).not.toHaveBeenCalled();
  });
  it('detecta corrida entre leitura e gravação', async () => {
    const { service, db } = setup();
    db.essay.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.save('owner', 'essay', data)).rejects.toThrow('outra aba');
    expect(db.essayRevision.create).not.toHaveBeenCalled();
  });
  it('propaga erro de snapshot para reverter a transação', async () => {
    const { service, db } = setup();
    db.essayRevision.create.mockRejectedValue(new Error('Falha no snapshot'));
    await expect(service.save('owner', 'essay', data)).rejects.toThrow('Falha no snapshot');
    expect(db.essay.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('não expõe texto nem histórico de outra conta', async () => {
    const { service, db } = setup();
    db.essay.findFirst.mockResolvedValue(null);
    await expect(service.get('other', 'essay')).rejects.toThrow('não encontrada');
    await expect(service.save('other', 'essay', data)).rejects.toThrow('não encontrada');
    await expect(service.revisions('other', 'essay', 1)).rejects.toThrow('não encontrada');
    expect(db.essay.findFirst).toHaveBeenCalledWith({ where: { id: 'essay', userId: 'other' } });
    expect(db.essay.updateMany).not.toHaveBeenCalled();
    expect(db.essayRevision.findMany).not.toHaveBeenCalled();
    await expect(service.revision('other', 'essay', 1)).rejects.toThrow('não encontrada');
    expect(db.essayRevision.findFirst).toHaveBeenCalledWith({ where: { essayId: 'essay', version: 1, essay: { userId: 'other' } } });
  });
  it('pagina resumos sem carregar conteúdos completos', async () => {
    const { service, db, row } = setup();
    db.essay.findMany.mockResolvedValue(Array.from({ length: 21 }, () => row));
    const result = await service.list('owner', 2);
    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(db.essay.findMany.mock.calls[0][0].skip).toBe(20);
    expect(db.essay.findMany.mock.calls[0][0].where).toEqual({ userId: 'owner' });
    expect(db.essay.findMany.mock.calls[0][0].select).not.toHaveProperty('content');
  });
});
