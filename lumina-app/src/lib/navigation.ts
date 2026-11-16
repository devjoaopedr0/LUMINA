/**
 * Quais itens do menu lateral cada pessoa vê.
 *
 * Regra "esconde até provar": item condicional só aparece depois que se sabe
 * quem é o usuário (e, para o aluno independente, se ele tem turma). Antes,
 * com dados ainda carregando, o item fica fora — assim nada aparece, recebe
 * clique e some em seguida.
 */
export type AccountType = 'STUDENT_INDEPENDENT' | 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR' | 'DIRECTOR' | 'ADMIN';

export interface NavRule {
  /** Aluno independente só vê se tiver entrado em alguma turma. */
  onlyWithClasses?: boolean;
  /** Só quem revisa redação (professores, coordenação, direção, admin). */
  reviewersOnly?: boolean;
}

export interface NavContext {
  accountType: AccountType | null | undefined;
  /** null = ainda não se sabe. */
  hasClasses: boolean | null;
}

const STUDENTS: AccountType[] = ['STUDENT_INDEPENDENT', 'STUDENT_INSTITUTION'];

export function isNavItemVisible(rule: NavRule, ctx: NavContext): boolean {
  if (!rule.onlyWithClasses && !rule.reviewersOnly) return true;
  if (!ctx.accountType) return false;
  if (rule.reviewersOnly && STUDENTS.includes(ctx.accountType)) return false;
  if (rule.onlyWithClasses && ctx.accountType === 'STUDENT_INDEPENDENT' && ctx.hasClasses !== true) return false;
  return true;
}

/** Cache por usuário e sessão de "tem turma?", para o menu não recalcular a cada tela. */
const KEY = (userId: string) => `lumina:hasClasses:${userId}`;

export function cachedHasClasses(userId: string | null | undefined): boolean | null {
  if (!userId) return null;
  try {
    const v = sessionStorage.getItem(KEY(userId));
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

export function storeHasClasses(userId: string, value: boolean): void {
  try {
    sessionStorage.setItem(KEY(userId), value ? '1' : '0');
  } catch {
    // Sem armazenamento (aba privada restrita): só não guarda.
  }
}
