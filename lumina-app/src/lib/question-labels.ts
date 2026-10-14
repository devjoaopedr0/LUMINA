/**
 * Rótulos e convenções de exibição das questões, compartilhados por todos os
 * cartões — banco de questões, busca web e caderno de erros. Ficam aqui para
 * que a letra da alternativa, a cor da dificuldade e a procedência da questão
 * sejam sempre as mesmas, mesmo quando a tela muda.
 *
 * Módulo folha de propósito: sem imports, ele é carregável direto pelo `node`
 * nos checks (`test/*.check.ts`), que rodam o TypeScript sem bundler.
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Letra da alternativa a partir da POSIÇÃO (1-based): 1 = A, 2 = B...
 * Mesma convenção do banco de questões e da posição gravada no banco, para
 * a letra que o usuário vê ser a mesma que aparece depois de salvar. */
export function positionLetter(position: number): string {
  return LETTERS[position - 1] ?? String(position);
}

export const ROTULO_DIFICULDADE = {
  FACIL: 'Fácil',
  MEDIA: 'Média',
  DIFICIL: 'Difícil',
} as const;

/** A cor da dificuldade não muda de tela: fácil em verde, média na cor da
 * plataforma, difícil em alerta. */
export const CLASSE_DIFICULDADE = {
  FACIL: 'border-success/25 bg-success/10 text-success',
  MEDIA: 'border-primary/30 bg-primary/10 text-primary-700',
  DIFICIL: 'border-alert/25 bg-alert/10 text-alert',
} as const;

/** "ENEM · 2023 · questão 47" — a procedência da questão em uma linha. Vira
 * string vazia quando não há exame, ano nem número (questão autoral), para
 * o cartão não mostrar um separador sozinho. */
export function origemDaQuestao(questao: {
  exam?: string | null;
  year?: number | null;
  examNumber?: number | null;
}): string {
  return [
    questao.exam || null,
    questao.year ? String(questao.year) : null,
    questao.examNumber ? `questão ${questao.examNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
