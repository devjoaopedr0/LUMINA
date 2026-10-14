import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { parseCsv, toCutoffRow } from '../prisma/import-sisu-cutoffs';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { CutoffsService, projectScore } from './cutoffs.service';
import { institutionKey, normalizeKey } from './sisu-modality';

function row(overrides: Record<string, unknown> = {}) {
  const base = {
    year: 2025, courseCode: 13996, institutionCode: 583,
    institutionName: 'UNIVERSIDADE FEDERAL DO CEARÁ', institutionAcronym: 'UFC',
    campus: 'Fortaleza', city: 'Fortaleza', state: 'CE',
    courseName: 'MEDICINA', degree: 'Bacharelado', shift: 'Integral',
    scoreAc: 800, scoreLbPpi: 740, scoreLbQ: null, scoreLbPcd: null, scoreLbEp: 760,
    scoreLiPpi: 770, scoreLiQ: null, scoreLiPcd: null, scoreLiEp: 790,
    ...overrides,
  };
  return {
    ...base,
    courseKey: normalizeKey(base.courseName as string),
    institutionKey: institutionKey(base.institutionAcronym as string, base.institutionName as string),
  };
}

function setup(rows: ReturnType<typeof row>[], profile: Record<string, unknown> | null = null) {
  const prisma: any = {
    userProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
    sisuCutoff: {
      aggregate: vi.fn().mockResolvedValue({ _max: { year: rows.length ? Math.max(...rows.map((r) => r.year)) : null } }),
      findMany: vi.fn(({ where }: any) =>
        Promise.resolve(
          rows.filter((r) =>
            r.year >= where.year.gte &&
            (typeof where.courseKey === 'string' ? r.courseKey === where.courseKey : r.courseKey.includes(where.courseKey.contains)),
          ),
        ),
      ),
    },
  };
  return { service: new CutoffsService(prisma), prisma };
}

const ufcMedicina = [
  row({ year: 2023, scoreAc: 797.18 }),
  row({ year: 2024, scoreAc: 804.76 }),
  row({ year: 2025, scoreAc: 804.14 }),
];

describe('CutoffsService.target', () => {
  it('a meta é a projeção para a próxima edição, pela tendência das três últimas', async () => {
    const { service } = setup(ufcMedicina);
    const target = await service.target({ course: 'Medicina', university: 'UFC', modality: null });
    expect(target).toMatchObject({
      status: 'OK', modality: 'AC', modalityLabel: 'Ampla concorrência',
      // 797,18 → 804,76 → 804,14: sobe 3,5 por edição; a reta chega a 809 em 2026.
      targetScore: 809, averageScore: 802, trendPerYear: 3.5, projectedYear: 2026,
      years: [2023, 2024, 2025],
    });
    expect(target.offers[0].scores).toEqual([
      { year: 2023, score: 797.18 }, { year: 2024, score: 804.76 }, { year: 2025, score: 804.14 },
    ]);
    expect(target.message).toBe(
      'A nota de corte de MEDICINA na UFC vem subindo 3,5 ponto(s) por edição (2023–2025, média 802,0); a projeção para 2026 é 809,0 — é a média do ENEM a buscar.',
    );
  });

  it('edição mais antiga que as três últimas não entra na média', async () => {
    const { service } = setup([row({ year: 2021, scoreAc: 500 }), ...ufcMedicina]);
    const target = await service.target({ course: 'Medicina', university: 'UFC', modality: 'AC' });
    expect(target.years).toEqual([2023, 2024, 2025]);
    expect(target.averageScore).toBe(802);
  });

  it('usa a nota da modalidade do aluno, não a da ampla concorrência', async () => {
    const { service } = setup(ufcMedicina);
    const target = await service.target({ course: 'Medicina', university: 'UFC', modality: 'LB_PPI' });
    expect(target).toMatchObject({ status: 'OK', modality: 'LB_PPI', targetScore: 740 });
  });

  it('modalidade sem vaga no curso é dita com clareza, sem cair na ampla', async () => {
    const { service } = setup(ufcMedicina);
    const target = await service.target({ course: 'Medicina', university: 'UFC', modality: 'LB_Q' });
    expect(target.status).toBe('NO_SCORE_FOR_MODALITY');
    expect(target.targetScore).toBeNull();
    expect(target.message).toContain('quilombolas');
  });

  it('curso em mais de um campus: lista os dois e a meta é a maior projeção', async () => {
    const sobral = { courseCode: 54490, campus: 'CAMPUS UFC SOBRAL', city: 'Sobral' };
    const { service } = setup([
      ...ufcMedicina,
      row({ ...sobral, year: 2024, scoreAc: 801.32 }),
      row({ ...sobral, year: 2025, scoreAc: 798.96 }),
    ]);
    const target = await service.target({ course: 'Medicina', university: 'UFC', modality: 'AC' });
    // Sobral vem caindo (801,32 → 798,96): a projeção dele fica abaixo da média.
    expect(target.offers.map((o) => [o.city, o.average, o.trendPerYear, o.projected])).toEqual([
      ['Fortaleza', 802, 3.5, 809],
      ['Sobral', 800.1, -2.4, 796.6],
    ]);
    expect(target.targetScore).toBe(809);
  });

  it('casa o texto livre do cadastro: acento, caixa, sigla ou nome por extenso', async () => {
    const { service } = setup(ufcMedicina);
    for (const university of ['ufc', 'UFC - Fortaleza', 'Universidade Federal do Ceará', 'federal do ceara']) {
      expect((await service.target({ course: ' medicina ', university, modality: null })).status).toBe('OK');
    }
  });

  it('texto curto não casa com o nome de qualquer universidade', async () => {
    const { service } = setup(ufcMedicina);
    expect((await service.target({ course: 'Medicina', university: 'UF', modality: null })).status).toBe('INSTITUTION_NOT_FOUND');
  });

  it('universidade não encontrada sugere quem oferece o curso', async () => {
    const { service } = setup([...ufcMedicina, row({ courseCode: 1, institutionAcronym: 'UFPE', institutionName: 'UNIVERSIDADE FEDERAL DE PERNAMBUCO' })]);
    const target = await service.target({ course: 'Medicina', university: 'Harvard', modality: null });
    expect(target.status).toBe('INSTITUTION_NOT_FOUND');
    expect(target.suggestions).toEqual(['UFC', 'UFPE']);
  });

  it('nome exato do curso tem preferência; "contém" só quando não há exato', async () => {
    const civil = row({ courseCode: 2, courseName: 'ENGENHARIA CIVIL', scoreAc: 700 });
    const exact = setup([row({ courseCode: 3, courseName: 'ENGENHARIA', scoreAc: 650 }), civil]);
    expect((await exact.service.target({ course: 'Engenharia', university: 'UFC', modality: null })).targetScore).toBe(650);
    const partial = setup([civil]);
    expect((await partial.service.target({ course: 'Engenharia', university: 'UFC', modality: null })).targetScore).toBe(700);
  });

  it('curso inexistente e cadastro incompleto têm mensagens próprias', async () => {
    const { service } = setup(ufcMedicina);
    expect((await service.target({ course: 'Astrologia', university: 'UFC', modality: null })).status).toBe('COURSE_NOT_FOUND');
    const missing = await service.target({ course: 'Medicina', university: null, modality: null });
    expect(missing.status).toBe('MISSING_PROFILE');
    expect(missing.message).toBe('Preencha a universidade-alvo no seu perfil para ver a nota de corte.');
  });

  it('sem dados importados não quebra', async () => {
    const { service } = setup([]);
    expect((await service.target({ course: 'Medicina', university: 'UFC', modality: null })).status).toBe('COURSE_NOT_FOUND');
  });

  it('lê curso, universidade e modalidade do perfil do aluno', async () => {
    const { service, prisma } = setup(ufcMedicina, { desiredCourse: 'Medicina', targetUniversity: 'UFC', sisuModality: 'LI_EP' });
    const target = await service.targetForUser('user');
    expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 'user' } });
    expect(target).toMatchObject({ status: 'OK', modality: 'LI_EP', targetScore: 790 });
  });
});

describe('projectScore (a meta acompanha a prova)', () => {
  const at = (pairs: [number, number][]) => pairs.map(([year, score]) => ({ year, score }));

  it('nota subindo puxa a meta para cima; caindo, para baixo', () => {
    expect(projectScore(at([[2023, 700], [2024, 710], [2025, 720]]), 2026)).toEqual({ trendPerYear: 10, projected: 730 });
    expect(projectScore(at([[2023, 720], [2024, 710], [2025, 700]]), 2026)).toEqual({ trendPerYear: -10, projected: 690 });
  });

  it('nota estável mantém a meta na média', () => {
    expect(projectScore(at([[2023, 700], [2024, 720], [2025, 700]]), 2026)).toEqual({ trendPerYear: 0, projected: 706.7 });
  });

  it('uma edição só não tem tendência: a meta é a própria nota', () => {
    expect(projectScore(at([[2025, 715.34]]), 2026)).toEqual({ trendPerYear: 0, projected: 715.3 });
  });

  it('edição faltando no meio conta os anos de verdade', () => {
    expect(projectScore(at([[2023, 700], [2025, 720]]), 2026)).toEqual({ trendPerYear: 10, projected: 730 });
  });

  it('salto fora da curva não leva a meta mais de 30 pontos além da última edição', () => {
    expect(projectScore(at([[2023, 600], [2024, 650], [2025, 760]]), 2026).projected).toBe(790);
    expect(projectScore(at([[2023, 760], [2024, 650], [2025, 600]]), 2026).projected).toBe(570);
  });

  it('nunca passa de 1000', () => {
    expect(projectScore(at([[2024, 980], [2025, 995]]), 2026).projected).toBe(1000);
  });
});

describe('importação das notas de corte', () => {
  it('lê o CSV (com aspas e vírgula no campo) e normaliza as chaves de busca', () => {
    const csv = [
      'year,courseCode,institutionCode,institutionName,institutionAcronym,campus,city,state,courseName,degree,shift,AC,LB_PPI,LB_Q,LB_PCD,LB_EP,LI_PPI,LI_Q,LI_PCD,LI_EP',
      '2025,13996,583,UNIVERSIDADE FEDERAL DO CEARÁ,UFC,"Campus do Pici, Fortaleza",Fortaleza,CE,CIÊNCIA DA COMPUTAÇÃO,Bacharelado,Integral,750.5,,,,701.2,,,,',
      '',
    ].join('\n');
    const [record] = parseCsv(csv);
    expect(toCutoffRow(record)).toMatchObject({
      year: 2025, courseCode: 13996, campus: 'Campus do Pici, Fortaleza',
      courseKey: 'CIENCIA DA COMPUTACAO',
      institutionKey: 'UFC|UNIVERSIDADE FEDERAL DO CEARA',
      scoreAc: 750.5, scoreLbPpi: null, scoreLbEp: 701.2,
    });
  });
});

describe('modalidade do Sisu no perfil', () => {
  it('aceita as modalidades conhecidas e vazio; recusa as demais', async () => {
    expect(await validate(plainToInstance(UpdateProfileDto, { sisuModality: 'LB_PPI' }))).toHaveLength(0);
    expect(plainToInstance(UpdateProfileDto, { sisuModality: '' }).sisuModality).toBeNull();
    expect(await validate(plainToInstance(UpdateProfileDto, { sisuModality: 'COTA_X' }))).not.toHaveLength(0);
  });
});
