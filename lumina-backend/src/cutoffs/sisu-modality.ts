import type { SisuCutoff } from '@prisma/client';

/**
 * Modalidades de concorrência do Sisu que a Lumina conhece: ampla
 * concorrência e as oito da Lei de Cotas (Lei nº 12.711/2012). LB = renda
 * familiar per capita até o limite da lei; LI = independente de renda. Em
 * todas as "L" o aluno cursou o ensino médio inteiro em escola pública.
 *
 * Ações afirmativas próprias de cada universidade e bônus regionais ficam de
 * fora: mudam de uma instituição para outra e não dá para oferecer como
 * opção única no cadastro.
 */
export const SISU_MODALITIES = [
  'AC',
  'LB_PPI',
  'LB_Q',
  'LB_PCD',
  'LB_EP',
  'LI_PPI',
  'LI_Q',
  'LI_PCD',
  'LI_EP',
] as const;

export type SisuModality = (typeof SISU_MODALITIES)[number];

export const DEFAULT_SISU_MODALITY: SisuModality = 'AC';

export const SISU_MODALITY_LABEL: Record<SisuModality, string> = {
  AC: 'Ampla concorrência',
  LB_PPI: 'Escola pública, baixa renda — pretos, pardos e indígenas',
  LB_Q: 'Escola pública, baixa renda — quilombolas',
  LB_PCD: 'Escola pública, baixa renda — pessoas com deficiência',
  LB_EP: 'Escola pública, baixa renda',
  LI_PPI: 'Escola pública, qualquer renda — pretos, pardos e indígenas',
  LI_Q: 'Escola pública, qualquer renda — quilombolas',
  LI_PCD: 'Escola pública, qualquer renda — pessoas com deficiência',
  LI_EP: 'Escola pública, qualquer renda',
};

/** Coluna de `sisu_cutoffs` que guarda a nota de cada modalidade. */
export const SISU_MODALITY_COLUMN = {
  AC: 'scoreAc',
  LB_PPI: 'scoreLbPpi',
  LB_Q: 'scoreLbQ',
  LB_PCD: 'scoreLbPcd',
  LB_EP: 'scoreLbEp',
  LI_PPI: 'scoreLiPpi',
  LI_Q: 'scoreLiQ',
  LI_PCD: 'scoreLiPcd',
  LI_EP: 'scoreLiEp',
} as const satisfies Record<SisuModality, keyof SisuCutoff>;

export function isSisuModality(value: unknown): value is SisuModality {
  return typeof value === 'string' && (SISU_MODALITIES as readonly string[]).includes(value);
}

/**
 * Chave de comparação de texto livre: sem acento, em maiúsculas e com
 * pontuação e espaços repetidos reduzidos a um espaço. "Ciência da
 * Computação" e "ciencia  da computacao" viram a mesma chave.
 */
export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Chave da instituição guardada no banco: "SIGLA|NOME". */
export function institutionKey(acronym: string, name: string): string {
  return `${normalizeKey(acronym)}|${normalizeKey(name)}`;
}
