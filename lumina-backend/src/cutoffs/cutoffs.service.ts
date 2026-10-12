import { Injectable } from '@nestjs/common';
import type { SisuCutoff } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_SISU_MODALITY,
  SISU_MODALITY_COLUMN,
  SISU_MODALITY_LABEL,
  isSisuModality,
  normalizeKey,
  type SisuModality,
} from './sisu-modality';

/** Quantas edições recentes entram na média. */
const YEARS_IN_AVERAGE = 3;
/** Texto de universidade mais curto que isso só casa com a sigla exata —
 *  "UF" não pode casar com toda "UNIVERSIDADE FEDERAL". */
const MIN_NAME_MATCH_LENGTH = 5;
const MAX_SUGGESTIONS = 12;
/** Abaixo disso (pontos por ano) a nota é tratada como estável. */
const STABLE_TREND = 0.5;
/** A projeção nunca se afasta mais que isso da nota da última edição: com
 *  só três pontos, uma edição fora da curva não pode levar a meta junto. */
const MAX_PROJECTION_STEP = 30;

export type CutoffTargetStatus =
  | 'OK'
  /** Falta curso ou universidade no cadastro. */
  | 'MISSING_PROFILE'
  | 'COURSE_NOT_FOUND'
  | 'INSTITUTION_NOT_FOUND'
  /** O curso existe na universidade, mas sem vaga nessa modalidade. */
  | 'NO_SCORE_FOR_MODALITY';

export interface CutoffOffer {
  courseCode: number;
  courseName: string;
  institutionAcronym: string;
  institutionName: string;
  campus: string;
  city: string;
  state: string;
  degree: string;
  shift: string;
  scores: { year: number; score: number }[];
  /** Média das edições em `scores`. */
  average: number;
  /** Quanto a nota vem subindo (+) ou caindo (−) por edição, em pontos. */
  trendPerYear: number;
  /** Nota esperada na próxima edição, seguindo essa tendência. */
  projected: number;
}

export interface CutoffTarget {
  status: CutoffTargetStatus;
  course: string | null;
  university: string | null;
  modality: SisuModality;
  modalityLabel: string;
  /** Meta do aluno: a maior PROJEÇÃO entre as ofertas do curso na
   *  universidade (campus/turno diferentes) — quem alcança essa entra em
   *  qualquer uma. Sobe ou desce a cada edição importada, junto com a prova. */
  targetScore: number | null;
  /** Média simples das edições, da mesma oferta da meta. */
  averageScore: number | null;
  /** Tendência (pontos por edição) da oferta da meta. */
  trendPerYear: number | null;
  /** Edição para a qual a meta foi projetada (a seguinte à última conhecida). */
  projectedYear: number | null;
  /** Edições que entraram na conta. */
  years: number[];
  offers: CutoffOffer[];
  /** Quando a universidade não foi encontrada: quem oferece o curso. */
  suggestions: string[];
  message: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Meta de nota do aluno a partir do cadastro: curso desejado, universidade-
 * alvo e modalidade de concorrência → média da nota de corte do Sisu nas
 * últimas edições.
 *
 * A nota de corte do Sisu é a MÉDIA das cinco notas do ENEM (quatro áreas +
 * redação) com os pesos que cada curso define — por isso fica sempre abaixo
 * de 1000 e é comparável à média que o aluno precisa fazer.
 */
@Injectable()
export class CutoffsService {
  constructor(private readonly prisma: PrismaService) {}

  async targetForUser(userId: string): Promise<CutoffTarget> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    return this.target({
      course: profile?.desiredCourse ?? null,
      university: profile?.targetUniversity ?? null,
      modality: profile?.sisuModality ?? null,
    });
  }

  async target(input: {
    course: string | null;
    university: string | null;
    modality: string | null;
  }): Promise<CutoffTarget> {
    const modality = isSisuModality(input.modality) ? input.modality : DEFAULT_SISU_MODALITY;
    const base = {
      course: input.course?.trim() || null,
      university: input.university?.trim() || null,
      modality,
      modalityLabel: SISU_MODALITY_LABEL[modality],
      targetScore: null,
      averageScore: null,
      trendPerYear: null,
      projectedYear: null,
      years: [] as number[],
      offers: [] as CutoffOffer[],
      suggestions: [] as string[],
    };

    if (!base.course || !base.university) {
      const missing = !base.course && !base.university
        ? 'o curso desejado e a universidade-alvo'
        : !base.course ? 'o curso desejado' : 'a universidade-alvo';
      return {
        ...base,
        status: 'MISSING_PROFILE',
        message: `Preencha ${missing} no seu perfil para ver a nota de corte.`,
      };
    }

    const courseKey = normalizeKey(base.course);
    const latest = await this.prisma.sisuCutoff.aggregate({ _max: { year: true } });
    const latestYear = latest._max.year;
    if (!courseKey || !latestYear) {
      return {
        ...base,
        status: 'COURSE_NOT_FOUND',
        message: 'Ainda não há notas de corte do Sisu carregadas.',
      };
    }
    const yearFilter = { gte: latestYear - (YEARS_IN_AVERAGE - 1) };

    // Nome exato primeiro ("DIREITO"); só se não houver, nome que contém o
    // texto — começar pelo "contém" traria todas as engenharias para quem
    // escreveu só "Engenharia Civil".
    let rows = await this.prisma.sisuCutoff.findMany({ where: { courseKey, year: yearFilter } });
    if (rows.length === 0) {
      rows = await this.prisma.sisuCutoff.findMany({
        where: { courseKey: { contains: courseKey }, year: yearFilter },
      });
    }
    if (rows.length === 0) {
      return {
        ...base,
        status: 'COURSE_NOT_FOUND',
        message: `Não encontramos "${base.course}" entre os cursos do Sisu. Confira o nome no seu perfil (ex.: "Medicina", "Engenharia Civil").`,
      };
    }

    const universityKey = normalizeKey(base.university);
    const fromUniversity = rows.filter((row) => matchesInstitution(row.institutionKey, universityKey));
    if (fromUniversity.length === 0) {
      const suggestions = [...new Set(rows.map((row) => row.institutionAcronym.trim()))]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, MAX_SUGGESTIONS);
      return {
        ...base,
        status: 'INSTITUTION_NOT_FOUND',
        suggestions,
        message: `Não encontramos ${base.course} em "${base.university}" no Sisu. Use a sigla da universidade (ex.: ${suggestions.slice(0, 3).join(', ')}).`,
      };
    }

    const projectedYear = latestYear + 1;
    const offers = groupOffers(fromUniversity, SISU_MODALITY_COLUMN[modality], projectedYear);
    if (offers.length === 0) {
      return {
        ...base,
        status: 'NO_SCORE_FOR_MODALITY',
        message: `${base.course} em ${fromUniversity[0].institutionAcronym.trim()} não teve nota de corte na modalidade "${SISU_MODALITY_LABEL[modality]}" nas últimas edições.`,
      };
    }

    const years = [...new Set(offers.flatMap((offer) => offer.scores.map((s) => s.year)))].sort();
    const top = offers[0];
    const period = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : `${years[0]}`;
    const trend =
      Math.abs(top.trendPerYear) < STABLE_TREND
        ? 'está estável'
        : `vem ${top.trendPerYear > 0 ? 'subindo' : 'caindo'} ${formatScore(Math.abs(top.trendPerYear))} ponto(s) por edição`;
    return {
      ...base,
      status: 'OK',
      targetScore: top.projected,
      averageScore: top.average,
      trendPerYear: top.trendPerYear,
      projectedYear,
      years,
      offers,
      message: `A nota de corte de ${top.courseName} na ${top.institutionAcronym} ${trend} (${period}, média ${formatScore(top.average)}); a projeção para ${projectedYear} é ${formatScore(top.projected)} — é a média do ENEM a buscar.`,
    };
  }
}

/** "UFC", "ufc - fortaleza" e "Universidade Federal do Ceará" casam com a UFC. */
function matchesInstitution(storedKey: string, universityKey: string): boolean {
  const [acronym, name] = storedKey.split('|');
  if (acronym === universityKey || name === universityKey) return true;
  if (universityKey.split(' ').includes(acronym)) return true;
  return universityKey.length >= MIN_NAME_MATCH_LENGTH && name.includes(universityKey);
}

/** Uma oferta por curso/campus/turno, com a nota de cada edição e a média. */
function groupOffers(rows: SisuCutoff[], column: keyof SisuCutoff, projectedYear: number): CutoffOffer[] {
  const byCourse = new Map<number, SisuCutoff[]>();
  for (const row of rows) {
    byCourse.set(row.courseCode, [...(byCourse.get(row.courseCode) ?? []), row]);
  }
  const offers: CutoffOffer[] = [];
  for (const group of byCourse.values()) {
    const scores = group
      .map((row) => ({ year: row.year, score: row[column] as number | null }))
      .filter((entry): entry is { year: number; score: number } => entry.score !== null)
      .sort((a, b) => a.year - b.year);
    if (scores.length === 0) continue;
    const newest = group.reduce((a, b) => (a.year >= b.year ? a : b));
    offers.push({
      courseCode: newest.courseCode,
      courseName: newest.courseName.trim(),
      institutionAcronym: newest.institutionAcronym.trim(),
      institutionName: newest.institutionName.trim(),
      campus: newest.campus.trim(),
      city: newest.city.trim(),
      state: newest.state,
      degree: newest.degree.trim(),
      shift: newest.shift.trim(),
      scores,
      average: round1(scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length),
      ...projectScore(scores, projectedYear),
    });
  }
  return offers.sort((a, b) => b.projected - a.projected);
}

/**
 * Tendência e projeção da nota de corte. A nota muda de uma edição para
 * outra com a dificuldade da prova e a concorrência; em vez de uma média
 * parada, a meta segue a reta que melhor passa pelas edições conhecidas
 * (mínimos quadrados) até a edição seguinte. Com uma edição só não há
 * tendência: a projeção é a própria nota.
 */
export function projectScore(
  scores: { year: number; score: number }[],
  projectedYear: number,
): { trendPerYear: number; projected: number } {
  const latest = scores.reduce((a, b) => (a.year >= b.year ? a : b));
  if (scores.length < 2) return { trendPerYear: 0, projected: round1(latest.score) };

  const meanYear = scores.reduce((sum, s) => sum + s.year, 0) / scores.length;
  const meanScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const slope =
    scores.reduce((sum, s) => sum + (s.year - meanYear) * (s.score - meanScore), 0) /
    scores.reduce((sum, s) => sum + (s.year - meanYear) ** 2, 0);

  const raw = meanScore + slope * (projectedYear - meanYear);
  const projected = Math.min(latest.score + MAX_PROJECTION_STEP, Math.max(latest.score - MAX_PROJECTION_STEP, raw));
  return { trendPerYear: round1(slope), projected: round1(Math.min(1000, Math.max(0, projected))) };
}

function formatScore(score: number): string {
  return score.toFixed(1).replace('.', ',');
}
