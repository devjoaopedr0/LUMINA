/**
 * Tópicos que existiam duas vezes para o mesmo assunto: um criado pelas
 * questões importadas ("Ecologia") e outro pelo currículo do ENEM
 * ("Ecologia (muito cobrada)"). Com dois Topic, o domínio do aluno
 * (TopicMastery) ficava dividido e o cronograma agendava os dois como se
 * fossem assuntos diferentes.
 *
 * `from` é absorvido por `into` (o nome que o banco de questões usa). Só
 * entram aqui pares que são o MESMO assunto — "Termologia" × "Termodinâmica"
 * ou "Estatística" × "Média, mediana e moda" ficam de fora de propósito.
 */
export type TopicMerge = { subject: string; from: string; into: string };

export const TOPIC_MERGES: TopicMerge[] = [
  { subject: 'Biologia', from: 'Ecologia (muito cobrada)', into: 'Ecologia' },
  { subject: 'Filosofia', from: 'Filosofia Antiga (Sócrates, Platão, Aristóteles)', into: 'Filosofia antiga' },
  { subject: 'Filosofia', from: 'Filosofia Moderna (Descartes, Locke, Rousseau)', into: 'Filosofia moderna' },
  { subject: 'Filosofia', from: 'Filosofia Contemporânea', into: 'Filosofia contemporânea' },
  { subject: 'Física', from: 'Ondulatória', into: 'Ondas' },
  { subject: 'Geografia', from: 'Migrações', into: 'Migração' },
  { subject: 'Geografia', from: 'Questões ambientais', into: 'Questão ambiental' },
  { subject: 'História', from: 'República', into: 'Brasil República' },
  { subject: 'Língua Portuguesa', from: 'Interpretação de texto (principal foco da prova)', into: 'Interpretação de texto' },
  { subject: 'Matemática', from: 'Análise combinatória básica', into: 'Análise combinatória' },
  { subject: 'Matemática', from: 'Funções exponenciais', into: 'Função exponencial' },
  { subject: 'Matemática', from: 'Função do 1º grau', into: 'Função afim' },
  { subject: 'Matemática', from: 'Função do 2º grau', into: 'Função quadrática' },
  { subject: 'Matemática', from: 'Geometria espacial (volume)', into: 'Geometria espacial' },
  { subject: 'Matemática', from: 'Geometria plana (área e perímetro)', into: 'Geometria plana' },
  { subject: 'Matemática', from: 'Probabilidade simples', into: 'Probabilidade' },
  { subject: 'Matemática', from: 'Trigonometria básica', into: 'Trigonometria' },
  { subject: 'Sociologia', from: 'Desigualdade social', into: 'Desigualdade' },
];
