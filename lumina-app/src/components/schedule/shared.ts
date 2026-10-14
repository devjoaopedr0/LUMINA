import type { StudyArea } from "@/lib/api";

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const STUDY_AREA_LABEL: Record<StudyArea, string> = {
  LINGUAGENS: "Linguagens",
  MATEMATICA: "Matemática",
  NATUREZA: "Ciências da Natureza",
  HUMANAS: "Ciências Humanas",
};

export const STUDY_SUBJECTS_DEFAULT_HOURS: Record<string, number> = {
  Matemática: 120,
  Física: 80,
  Química: 80,
  Biologia: 60,
  Português: 100,
  Literatura: 60,
  História: 70,
  Geografia: 70,
  Filosofia: 40,
  Sociologia: 40,
  Inglês: 60,
  Espanhol: 60,
  Artes: 40,
  "Educação Física": 30,
  Redação: 80,
};

/** Link para as questões de um tópico no banco de questões, já filtrado. */
export function topicQuestionsPath(questionBankSubjectId: string, topicId: string): string {
  return `/app/questoes?subjectId=${questionBankSubjectId}&topicId=${topicId}`;
}

export function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  return `${m}min`;
}
