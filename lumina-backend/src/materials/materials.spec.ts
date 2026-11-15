import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { parseAsk, parseQuestions } from './material-ai';
import { decodeMaterialPdf } from './material-pdf';
import { contextFromHits, queryTerms, searchPages } from './material-text';
import { MaterialsService } from './materials.service';

const pages = [
  { materialId: 'm1', page: 1, text: 'Introdução à química. Nesta aula falamos de ligações químicas e da tabela periódica.' },
  { materialId: 'm1', page: 2, text: 'Estequiometria: o cálculo estequiométrico relaciona as quantidades de reagentes e produtos. Exemplo de estequiometria com mol.' },
  { materialId: 'm2', page: 1, text: 'Revolução Industrial e as mudanças no trabalho.' },
];

describe('busca nos materiais (item 50)', () => {
  it('ignora acentos, maiúsculas e palavras vazias', () => {
    expect(queryTerms('Onde o professor explicou ESTEQUIOMÉTRICO e a química?')).toEqual(['estequiometrico', 'quimica']);
    expect(queryTerms('de a o')).toEqual([]);
  });

  it('acha a página certa e devolve um trecho em volta do termo', () => {
    const hits = searchPages(pages, 'onde o professor explicou estequiometria?');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ materialId: 'm1', page: 2, matched: ['estequiometria'] });
    expect(hits[0].snippet).toMatch(/Estequiometria/);
    expect(searchPages(pages, 'fotossíntese')).toEqual([]);
  });

  it('página com mais termos da pergunta vem antes', () => {
    const hits = searchPages(pages, 'química estequiometria reagentes');
    expect(hits.map((h) => h.page)).toEqual([2, 1]);
  });

  it('contexto do prompt leva título e página e respeita o teto', () => {
    const ctx = contextFromHits([{ ...pages[1], title: 'Apostila' }], 1000);
    expect(ctx.startsWith('[Apostila, p. 2]')).toBe(true);
    expect(contextFromHits([{ ...pages[1], text: 'x'.repeat(5000), title: 'A' }], 1000).length).toBeLessThan(1100);
  });
});

describe('LuminIA nos materiais (item 49)', () => {
  const sent = [{ materialId: 'm1', title: 'Apostila de Química', page: 2 }];

  it('só aceita citações de trechos enviados', () => {
    const r = parseAsk('{"encontrado": true, "resposta": "Na página 2.", "citacoes": ["Apostila de Química, p. 2", "Outro livro, p. 9", "Apostila de Química, p. 5"]}', sent);
    expect(r).toEqual({ found: true, answer: 'Na página 2.', citations: sent });
  });

  it('sem citação válida, não é "encontrado"', () => {
    expect(parseAsk('{"encontrado": true, "resposta": "Acho que é X.", "citacoes": ["Livro externo, p. 3"]}', sent)).toEqual({ found: false, answer: 'Acho que é X.', citations: [] });
    expect(parseAsk('nada', sent)).toBeNull();
  });

  it('questões geradas: 4–5 alternativas distintas, uma correta, página do material', () => {
    const raw = JSON.stringify({
      questoes: [
        { enunciado: 'Qual é a relação estudada no cálculo estequiométrico?', alternativas: ['a', 'b', 'c', 'd', 'e'], correta: 1, explicacao: 'p. 2', pagina: 2 },
        { enunciado: 'Enunciado curto demais', alternativas: ['a', 'b', 'c', 'd'], correta: 9 },
        { enunciado: 'Questão com alternativas repetidas no conjunto todo', alternativas: ['a', 'a', 'c', 'd'], correta: 0 },
        { enunciado: 'Questão válida com página que não foi enviada ao modelo', alternativas: ['a', 'b', 'c', 'd'], correta: 3, pagina: 40 },
      ],
    });
    const qs = parseQuestions(raw, [2]);
    expect(qs).toHaveLength(2);
    expect(qs[0].alternatives.filter((a) => a.isCorrect).map((a) => a.text)).toEqual(['b']);
    expect(qs[0].page).toBe(2);
    expect(qs[1].page).toBeNull();
  });
});

describe('arquivo', () => {
  it('recusa o que não é PDF', () => {
    expect(() => decodeMaterialPdf('data:application/pdf;base64,' + Buffer.from('não sou pdf').toString('base64'))).toThrow('não parece ser um PDF');
    expect(() => decodeMaterialPdf('data:image/png;base64,AAAA')).toThrow('Envie o arquivo como PDF.');
  });
});

describe('permissões', () => {
  it('aluno não envia material; professor só publica nas próprias turmas', async () => {
    const prisma = {
      teacherProfile: { findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ userId: 'prof' }) },
      class: { count: vi.fn().mockResolvedValue(0) },
      material: { create: vi.fn() },
    };
    const service = new MaterialsService(prisma as unknown as PrismaService);
    await expect(service.create('aluno', { title: 'Lista', kind: 'LINK', url: 'https://x.y' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('prof', { title: 'Lista', kind: 'LINK', url: 'https://x.y', classId: 'turma-alheia' })).rejects.toThrow('nas suas turmas');
    expect(prisma.material.create).not.toHaveBeenCalled();
  });

  it('material de turma que o usuário não frequenta não existe para ele', async () => {
    const prisma = {
      class: { findMany: vi.fn().mockResolvedValue([{ id: 't1' }]) },
      material: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new MaterialsService(prisma as unknown as PrismaService);
    await expect(service.file('m9', 'aluno')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.material.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 'm9' }, { OR: [{ ownerId: 'aluno' }, { classId: { in: ['t1'] } }] }] },
    });
  });
});
