import { StudyArea } from '@prisma/client';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from './study-subject-question-bank-map';

/**
 * Área do ENEM de cada matéria do cronograma (StudySubject.code). Usada para
 * a "área prioritária" do onboarding (fase 5, §11) e para repartir o
 * diagnóstico inicial por área. Redação fica de fora: tem rotina própria (§9).
 */
export const STUDY_SUBJECT_CODE_TO_AREA: Record<string, StudyArea> = {
  PORTUGUESE: StudyArea.LINGUAGENS,
  LITERATURE: StudyArea.LINGUAGENS,
  ARTS: StudyArea.LINGUAGENS,
  ENGLISH: StudyArea.LINGUAGENS,
  SPANISH: StudyArea.LINGUAGENS,
  PHYSICAL_EDUCATION: StudyArea.LINGUAGENS,
  MATH: StudyArea.MATEMATICA,
  PHYSICS: StudyArea.NATUREZA,
  CHEMISTRY: StudyArea.NATUREZA,
  BIOLOGY: StudyArea.NATUREZA,
  HISTORY: StudyArea.HUMANAS,
  GEOGRAPHY: StudyArea.HUMANAS,
  PHILOSOPHY: StudyArea.HUMANAS,
  SOCILOGY: StudyArea.HUMANAS,
};

export const STUDY_AREA_LABEL: Record<StudyArea, string> = {
  LINGUAGENS: 'Linguagens',
  MATEMATICA: 'Matemática',
  NATUREZA: 'Ciências da Natureza',
  HUMANAS: 'Ciências Humanas',
};

/** Área do ENEM de cada matéria do BANCO DE QUESTÕES, pelo nome dela
 *  (Subject.name) — o banco não usa os códigos do cronograma. */
const AREA_BY_SUBJECT_NAME = new Map<string, StudyArea>(
  Object.entries(STUDY_SUBJECT_CODE_TO_SUBJECT_NAME)
    .filter(([code]) => code in STUDY_SUBJECT_CODE_TO_AREA)
    .map(([code, name]) => [name, STUDY_SUBJECT_CODE_TO_AREA[code]]),
);

export function areaOfSubjectName(name: string | null | undefined): StudyArea | undefined {
  return name ? AREA_BY_SUBJECT_NAME.get(name) : undefined;
}

/** Matérias do banco de questões que compõem uma área do ENEM. */
export function subjectNamesOfArea(area: StudyArea): string[] {
  return [...AREA_BY_SUBJECT_NAME].filter(([, value]) => value === area).map(([name]) => name);
}

/** Código da matéria Redação no catálogo do cronograma. */
export const ESSAY_SUBJECT_CODE = 'ESSAY';
