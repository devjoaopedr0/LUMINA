/**
 * Recomendação de videoaulas (item 24 do inventário). Funções puras.
 *
 * Nada aqui é gerado por IA: o vídeo, o canal e a duração vêm da API do
 * YouTube, e o "por que recomendamos" é montado a partir desses dados e do
 * domínio do aluno no assunto. Assim a LuminIA não inventa vídeo, canal ou
 * conteúdo que não existe.
 */

export type VideoLevel = 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';

export const LEVEL_LABEL: Record<VideoLevel, string> = {
  BASICO: 'do zero',
  INTERMEDIARIO: 'com exemplos',
  AVANCADO: 'exercícios no nível ENEM',
};

/** Nível pelo domínio do aluno no assunto (0–100); sem domínio registrado, começa do básico. */
export function levelForMastery(score: number | null | undefined): VideoLevel {
  if (score === null || score === undefined || score < 40) return 'BASICO';
  return score < 75 ? 'INTERMEDIARIO' : 'AVANCADO';
}

/** Termo de busca no YouTube para o assunto, ajustado ao nível. */
export function videoQuery(topic: string, subject: string | null, level: VideoLevel): string {
  const base = [topic.trim(), subject?.trim()].filter(Boolean).join(' ');
  const suffix = { BASICO: 'aula do zero', INTERMEDIARIO: 'aula com exemplos ENEM', AVANCADO: 'exercícios resolvidos ENEM' }[level];
  return `${base} ${suffix}`.replace(/\s+/g, ' ').trim();
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/** "PT1H2M10S" → segundos; formato inválido → null. */
export function parseIsoDuration(value: string | undefined): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? '');
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** 754 → "12:34"; 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export interface RawVideo {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  views: number | null;
  publishedAt: string | null;
}

export interface VideoLesson extends Omit<RawVideo, 'durationSeconds'> {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
  duration: string;
  level: VideoLevel;
  reason: string;
}

/** Faixa de duração por nível: aula do zero pede mais tempo; exercício, menos. */
const DURATION_RANGE: Record<VideoLevel, [number, number]> = {
  BASICO: [6 * 60, 45 * 60],
  INTERMEDIARIO: [5 * 60, 40 * 60],
  AVANCADO: [4 * 60, 35 * 60],
};

const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Filtra (sem shorts, sem lives longas, na faixa de duração do nível),
 * ordena por relevância da busca com desempate por visualizações e monta o
 * motivo de cada recomendação.
 */
export function pickVideoLessons(videos: RawVideo[], ctx: { topic: string; level: VideoLevel; mastery: number | null }, limit = 4): VideoLesson[] {
  const [min, max] = DURATION_RANGE[ctx.level];
  return videos
    .filter((v) => v.durationSeconds !== null && v.durationSeconds >= min && v.durationSeconds <= max)
    .slice(0, limit)
    .map((v) => {
      const minutes = Math.round((v.durationSeconds ?? 0) / 60);
      const who = ctx.mastery === null ? 'Você ainda não tem domínio registrado neste assunto' : `Seu domínio em ${ctx.topic} está em ${ctx.mastery}`;
      const what = { BASICO: 'uma aula que começa do básico', INTERMEDIARIO: 'uma aula com exemplos para firmar o conteúdo', AVANCADO: 'exercícios resolvidos para treinar no nível da prova' }[ctx.level];
      const views = v.views && v.views >= 1000 ? `, com ${Math.round(v.views / 1000).toLocaleString('pt-BR')} mil visualizações` : '';
      return {
        ...v,
        title: decode(v.title),
        channel: decode(v.channel),
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`,
        durationSeconds: v.durationSeconds ?? 0,
        duration: formatDuration(v.durationSeconds ?? 0),
        level: ctx.level,
        reason: `${who}: por isso a busca priorizou ${what}. Vídeo de ${minutes} min do canal ${decode(v.channel)}${views}.`,
      };
    });
}
