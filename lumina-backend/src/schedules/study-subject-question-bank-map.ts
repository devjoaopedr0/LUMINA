/**
 * StudySubject (catálogo do cronograma, 15 matérias fixas) e Subject
 * (catálogo de classificação do banco de questões) são duas tabelas
 * diferentes — ver docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §2. Esta é a ponte
 * entre as duas, usada tanto para semear os tópicos do currículo
 * (prisma/src/prisma/seed.ts) quanto pelo gerador adaptativo do cronograma
 * (fase 2), que precisa saber, dado um StudySubject escolhido no cronograma,
 * qual Subject/Topic consultar para TopicMastery.
 *
 * Matérias sem entrada aqui (Inglês, Espanhol, Educação Física, Redação)
 * ainda não têm catálogo de tópicos — o gerador cai no modo genérico para
 * elas até a fase 5 (redação tem lógica própria) ou até o catálogo crescer.
 */
export const STUDY_SUBJECT_CODE_TO_SUBJECT_NAME: Record<string, string> = {
  PORTUGUESE: 'Língua Portuguesa',
  LITERATURE: 'Literatura',
  ARTS: 'Artes',
  PHYSICS: 'Física',
  CHEMISTRY: 'Química',
  BIOLOGY: 'Biologia',
  MATH: 'Matemática',
  HISTORY: 'História',
  GEOGRAPHY: 'Geografia',
  PHILOSOPHY: 'Filosofia',
  SOCILOGY: 'Sociologia',
};
