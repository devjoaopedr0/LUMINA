/**
 * StudySubject (catálogo do cronograma, 15 matérias fixas) e Subject
 * (catálogo de classificação do banco de questões) são duas tabelas
 * diferentes — ver docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §2. Esta é a ponte
 * entre as duas, usada tanto para semear os tópicos do currículo
 * (prisma/src/prisma/seed.ts) quanto pelo gerador adaptativo do cronograma
 * (fase 2), que precisa saber, dado um StudySubject escolhido no cronograma,
 * qual Subject/Topic consultar para TopicMastery.
 *
 * Só Redação fica de fora: não é dividida em tópicos, tem rotina semanal
 * própria (schedule-essay.ts). Matéria cujo Subject ainda não existe no
 * banco (seed não rodado) cai no modo genérico do gerador.
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
  ENGLISH: 'Inglês',
  SPANISH: 'Espanhol',
  PHYSICAL_EDUCATION: 'Educação Física',
};
