import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { ExamGeneratorService } from './exam-generator.service';
import { ListGeneratorService } from './list-generator.service';
import { SimulationsService } from './simulations.service';

const alts = () => [1, 2, 3, 4, 5].map((p) => ({ position: p, isCorrect: p === 3, text: `alt ${p}` }));
function q(id: string, subjectId: string, difficulty: string, topicId: string, enemSkill: string | null = null) {
  return { id, stem: `Enunciado ${id}`, subject: subjectId === 'mat' ? 'Matemática' : 'Física', subjectId, topic: topicId, topicId, difficulty, exam: 'ENEM', year: 2023, enemSkill, workspaceId: 'bank', alternatives: alts() };
}
const bank = [
  q('m1', 'mat', 'FACIL', 'funcoes', 'MT-H17'), q('m2', 'mat', 'FACIL', 'geometria'), q('m3', 'mat', 'MEDIA', 'funcoes', 'MT-H17'),
  q('m4', 'mat', 'MEDIA', 'geometria'), q('m5', 'mat', 'MEDIA', 'estatistica'), q('m6', 'mat', 'DIFICIL', 'funcoes', 'MT-H21'),
  q('f1', 'fis', 'FACIL', 'cinematica'), q('f2', 'fis', 'MEDIA', 'dinamica'), q('f3', 'fis', 'DIFICIL', 'optica'),
];

function fakeDb() {
  const created: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([k, c]: [string, any]) => {
    if (c && typeof c === 'object') {
      if ('in' in c) return c.in.includes(row[k]);
      if ('equals' in c) return String(row[k]).toLowerCase() === String(c.equals).toLowerCase();
    }
    return row[k] === c;
  });
  const db: any = {
    created,
    question: { findMany: async ({ where }: any) => bank.filter((r) => matches(r, where)) },
    workspaceMember: { findMany: async () => [] },
    classTeacher: { findUnique: async ({ where }: any) => (where.classId_userId.userId === 'prof' ? { class: { id: 'c1', name: '3º A', archived: false, workspaceId: 'ws' } } : null) },
    classMember: { findMany: async () => [{ userId: 'ana' }] },
    subject: { findUnique: async () => ({ name: 'Disciplina' }) },
    simulation: {
      create: async ({ data }: any) => {
        const row = { ...data, items: data.items.create, class: { name: '3º A' } };
        created.push(row);
        return row;
      },
    },
  };
  return db;
}

const access = { getBankWorkspace: async () => ({ id: 'bank' }), assertCanUse: async () => undefined, getPersonalWorkspaceOrThrow: async () => ({ id: 'personal' }) } as unknown as QuestionAccessService;

describe('ExamGeneratorService (prévia)', () => {
  const service = (db = fakeDb()) => new ExamGeneratorService(db as PrismaService, new ListGeneratorService(db as PrismaService, access));

  it('seções por disciplina, sem repetir questão, com a mistura de dificuldade', async () => {
    const res = await service().preview('prof', {
      sections: [{ subjectId: 'mat', count: 5 }, { subjectId: 'fis', count: 3 }],
      difficultyMix: { FACIL: 40, MEDIA: 40, DIFICIL: 20 },
      classId: 'c1',
    });
    expect(res.sections).toEqual([{ subject: 'Matemática', requested: 5, found: 5 }, { subject: 'Física', requested: 3, found: 3 }]);
    expect(new Set(res.questions.map((x) => x.id)).size).toBe(8);
    const mat = res.questions.filter((x) => x.section === 0);
    expect(mat.filter((x) => x.difficulty === 'FACIL')).toHaveLength(2);
    expect(mat.filter((x) => x.difficulty === 'MEDIA')).toHaveLength(2);
    expect(mat.filter((x) => x.difficulty === 'DIFICIL')).toHaveLength(1);
    expect(res.title).toBe('Prova de Matemática e Física — 3º A');
  });

  it('falta de uma dificuldade é completada com outras, com aviso', async () => {
    const res = await service().preview('prof', { sections: [{ subjectId: 'mat', count: 4 }], difficultyMix: { DIFICIL: 100 } });
    expect(res.found).toBe(4);
    expect(res.warnings[0]).toMatch(/faltaram 3 questões difíceis/);
  });

  it('filtra por habilidade do ENEM', async () => {
    const res = await service().preview('prof', { sections: [{ subjectId: 'mat', count: 10 }], skills: ['mt-h17'] });
    expect(res.questions.map((x) => x.id).sort()).toEqual(['m1', 'm3']);
    expect(res.warnings[0]).toMatch(/só encontramos 2 de 10/);
  });

  it('turma alheia: 403', async () => {
    await expect(service().preview('ana', { sections: [{ subjectId: 'mat', count: 2 }], classId: 'c1' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SimulationsService.createExamVersions', () => {
  it('cria as versões (tipo PROVA) com gabaritos próprios e avisa a turma uma vez', async () => {
    const db = fakeDb();
    const notify = vi.fn(async () => undefined);
    const svc = new SimulationsService(db as never, access, {} as never, { notify } as never);
    const res = await svc.createExamVersions('prof', { title: 'Prova bimestral', questionIds: ['m1', 'm3', 'm6', 'f1', 'f2'], versions: 3, shuffleAlternatives: true, classId: 'c1' }, 'TEACHER');
    expect(res.versions.map((v) => v.title)).toEqual(['Prova bimestral — Versão A', 'Prova bimestral — Versão B', 'Prova bimestral — Versão C']);
    expect(db.created.every((s: any) => s.assessmentType === 'TEST' && s.classId === 'c1')).toBe(true);
    // Versão A: ordem e gabarito originais (alternativa 3 = "C").
    expect(res.versions[0].answerKey.map((k) => k.answer).join('')).toBe('CCCCC');
    for (const sim of db.created) {
      for (const item of sim.items) expect(item.alternatives[item.correctPosition - 1].text).toBe('alt 3');
    }
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
