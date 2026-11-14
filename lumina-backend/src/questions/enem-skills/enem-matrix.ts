import { ENEM_AREAS, ENEM_MATRIX, type EnemArea, type EnemSkill } from './enem-matrix-data';

export * from './enem-matrix-data';

/** Código de uma habilidade: área + número, ex.: "MT-H17". */
export const ENEM_SKILL_CODE = /^(LC|CH|CN|MT)-H([1-9]|[12][0-9]|30)$/;

export type EnemSkillOrigin = 'AI' | 'MANUAL';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Área do ENEM de uma matéria do banco. Matérias fora da lista (ex.: uma
 * criada pelo professor) devolvem null: a questão fica sem área até alguém
 * classificar à mão.
 */
const SUBJECT_AREA: [RegExp, EnemArea][] = [
  [/^matematica/, 'MT'],
  [/^(fisica|quimica|biologia|ciencias da natureza)/, 'CN'],
  [/^(historia|geografia|filosofia|sociologia|ciencias humanas)/, 'CH'],
  [/^(lingua portuguesa|portugues|literatura|ingles|espanhol|lingua estrangeira|artes?|educacao fisica|linguagens|redacao|tecnologias da informacao)/, 'LC'],
];

export function areaForSubject(subject: string | null | undefined): EnemArea | null {
  if (!subject) return null;
  const s = normalize(subject);
  return SUBJECT_AREA.find(([re]) => re.test(s))?.[1] ?? null;
}

export function skillCode(area: EnemArea, n: number): string {
  return `${area}-H${n}`;
}

export function parseSkillCode(code: string | null | undefined): { area: EnemArea; n: number } | null {
  const m = code ? ENEM_SKILL_CODE.exec(code.trim().toUpperCase()) : null;
  return m ? { area: m[1] as EnemArea, n: Number(m[2]) } : null;
}

export function findSkill(code: string | null | undefined): (EnemSkill & { area: EnemArea; code: string }) | null {
  const parsed = parseSkillCode(code);
  if (!parsed) return null;
  const skill = ENEM_MATRIX[parsed.area].skills.find((s) => s.n === parsed.n);
  return skill ? { ...skill, area: parsed.area, code: skillCode(parsed.area, parsed.n) } : null;
}

export function isEnemArea(value: unknown): value is EnemArea {
  return typeof value === 'string' && (ENEM_AREAS as readonly string[]).includes(value);
}
