/**
 * Habilidades da Matriz de Referência do ENEM no app: tipos da API,
 * área da matéria (mesma regra do backend) e leitura do mapa por habilidade.
 * O texto da matriz vem sempre da API (/enem-matrix), que guarda o texto
 * oficial do Inep; o app não mantém uma cópia própria.
 */
export type EnemArea = 'LC' | 'CH' | 'CN' | 'MT';
export const ENEM_AREAS: EnemArea[] = ['LC', 'CH', 'CN', 'MT'];
export const AREA_SHORT: Record<EnemArea, string> = {
  LC: 'Linguagens',
  CH: 'Ciências Humanas',
  CN: 'Ciências da Natureza',
  MT: 'Matemática',
};

export interface EnemMatrix {
  source: string;
  areas: { area: EnemArea; name: string; competencies: { n: number; text: string }[]; skills: { n: number; competency: number; text: string }[] }[];
}

export interface QuestionEnemSkill {
  code: string;
  area: EnemArea;
  competency: number;
  text: string;
  origin: 'AI' | 'MANUAL' | null;
  validated: boolean;
  note: string | null;
}

export interface SkillMasteryRow {
  code: string;
  n: number;
  text: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
  lastAt: string | null;
  available: number;
  provisional: boolean;
}

export interface SkillMasteryReport {
  source: string;
  minAttempts: number;
  classifiedQuestions: number;
  pendingValidation: number;
  areas: {
    area: EnemArea;
    name: string;
    attempts: number;
    correct: number;
    competencies: { n: number; text: string; attempts: number; correct: number; skills: SkillMasteryRow[] }[];
  }[];
}

const SUBJECT_AREA: [RegExp, EnemArea][] = [
  [/^matematica/, 'MT'],
  [/^(fisica|quimica|biologia|ciencias da natureza)/, 'CN'],
  [/^(historia|geografia|filosofia|sociologia|ciencias humanas)/, 'CH'],
  [/^(lingua portuguesa|portugues|literatura|ingles|espanhol|lingua estrangeira|artes?|educacao fisica|linguagens|redacao|tecnologias da informacao)/, 'LC'],
];

export function areaForSubject(subject: string | null | undefined): EnemArea | null {
  if (!subject) return null;
  const s = subject.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return SUBJECT_AREA.find(([re]) => re.test(s))?.[1] ?? null;
}

export function isSkillCode(value: string | null | undefined): boolean {
  return !!value && /^(LC|CH|CN|MT)-H([1-9]|[12][0-9]|30)$/.test(value);
}

export function skillFromMatrix(matrix: EnemMatrix | null, code: string | null | undefined) {
  if (!matrix || !code || !isSkillCode(code)) return null;
  const [area, h] = code.split('-H');
  const a = matrix.areas.find((x) => x.area === area);
  const skill = a?.skills.find((s) => s.n === Number(h));
  return a && skill ? { area: a.area, areaName: a.name, competency: skill.competency, text: skill.text, code } : null;
}

/** Faixa de cor do mapa: só pinta com o mínimo de respostas (pouca amostra engana). */
export type SkillBand = 'none' | 'few' | 'critical' | 'attention' | 'progress' | 'mastered';
export function skillBand(row: Pick<SkillMasteryRow, 'attempts' | 'accuracy'>, minAttempts: number): SkillBand {
  if (!row.attempts) return 'none';
  if (row.attempts < minAttempts || row.accuracy === null) return 'few';
  if (row.accuracy >= 80) return 'mastered';
  if (row.accuracy >= 60) return 'progress';
  if (row.accuracy >= 40) return 'attention';
  return 'critical';
}

export const BAND_LABEL: Record<SkillBand, string> = {
  none: 'Sem respostas',
  few: 'Poucas respostas',
  critical: 'Crítico (abaixo de 40%)',
  attention: 'Atenção (40–59%)',
  progress: 'Em progresso (60–79%)',
  mastered: 'Dominada (80% ou mais)',
};

export const BAND_CLASS: Record<SkillBand, string> = {
  none: 'bg-surface-card text-graphite-400',
  few: 'bg-graphite/5 text-graphite-500 border border-dashed border-graphite/20',
  critical: 'bg-orange-200 text-orange-900',
  attention: 'bg-amber-200 text-amber-900',
  progress: 'bg-lime-200 text-lime-900',
  mastered: 'bg-emerald-300 text-emerald-950',
};

/** Habilidades para praticar primeiro: mais fracas com amostra suficiente, depois as nunca respondidas com questões disponíveis. */
export function skillsToPractice(report: SkillMasteryReport, area: EnemArea, max = 3): SkillMasteryRow[] {
  const rows = report.areas.find((a) => a.area === area)?.competencies.flatMap((c) => c.skills) ?? [];
  const weak = rows
    .filter((r) => r.attempts >= report.minAttempts && r.accuracy !== null && r.accuracy < 60 && r.available > 0)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.attempts - a.attempts);
  const untouched = rows.filter((r) => r.attempts === 0 && r.available > 0).sort((a, b) => b.available - a.available);
  return [...weak, ...untouched].slice(0, max);
}
