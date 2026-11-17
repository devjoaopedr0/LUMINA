/**
 * Objetivo do cronograma vem do perfil do aluno (curso desejado e
 * universidade-alvo), não de um texto livre digitado no cronograma: o perfil
 * é a fonte única, a mesma que calcula a meta de nota pelo Sisu. Quando o
 * aluno muda o perfil, o cronograma acompanha.
 */
export interface ProfileGoal {
  desiredCourse: string | null;
  targetUniversity: string | null;
}

export function goalFromProfile(profile: ProfileGoal | null | undefined): { objective: string | null; targetCourse: string | null } {
  const course = profile?.desiredCourse?.trim() || null;
  const university = profile?.targetUniversity?.trim() || null;
  if (!course) return { objective: null, targetCourse: null };
  return { objective: university ? `${course} na ${university}` : course, targetCourse: course };
}
