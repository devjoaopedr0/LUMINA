import { StudyArea } from '@prisma/client';

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

/** Código da matéria Redação no catálogo do cronograma. */
export const ESSAY_SUBJECT_CODE = 'ESSAY';
