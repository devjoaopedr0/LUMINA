import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { levelForMastery, LEVEL_LABEL, parseIsoDuration, pickVideoLessons, RawVideo, VideoLesson, VideoLevel, videoQuery, youtubeSearchUrl } from './video-lessons';

const API = 'https://www.googleapis.com/youtube/v3';
const CACHE_MS = 24 * 60 * 60 * 1000;

export interface VideoLessonsResult {
  topic: string;
  subject: string | null;
  level: VideoLevel;
  levelLabel: string;
  mastery: number | null;
  query: string;
  /** Busca no YouTube com o mesmo termo (sempre disponível). */
  searchUrl: string;
  /** false = sem YOUTUBE_API_KEY: o app mostra só o link da busca. */
  configured: boolean;
  videos: VideoLesson[];
}

/**
 * Videoaulas do YouTube para um assunto, no nível do aluno. Cada busca na API
 * custa 100 das 10.000 unidades diárias gratuitas: o resultado fica em cache
 * por 24 h por termo de busca.
 */
@Injectable()
export class VideoLessonsService {
  private readonly logger = new Logger(VideoLessonsService.name);
  private readonly cache = new Map<string, { at: number; videos: RawVideo[] }>();

  /** Substituível nos testes. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, params: { topicId?: string; topic?: string; subject?: string }): Promise<VideoLessonsResult> {
    let topic = params.topic?.trim() ?? '';
    let subject = params.subject?.trim() || null;
    let mastery: number | null = null;

    if (params.topicId) {
      const row = await this.prisma.topic.findUnique({ where: { id: params.topicId }, select: { name: true, subject: { select: { name: true } } } });
      if (!row) throw new NotFoundException('Assunto não encontrado.');
      topic = row.name;
      subject = row.subject?.name ?? subject;
      const state = await this.prisma.topicMastery.findFirst({ where: { userId, topicId: params.topicId }, select: { masteryScore: true } });
      mastery = state?.masteryScore ?? null;
    }
    if (topic.length < 2) throw new BadRequestException('Informe o assunto da videoaula.');

    const level = levelForMastery(mastery);
    const query = videoQuery(topic, subject, level);
    const base = { topic, subject, level, levelLabel: LEVEL_LABEL[level], mastery, query, searchUrl: youtubeSearchUrl(query) };
    const key = process.env.YOUTUBE_API_KEY?.trim();
    if (!key) return { ...base, configured: false, videos: [] };

    const raw = await this.search(query, key);
    return { ...base, configured: true, videos: pickVideoLessons(raw, { topic, level, mastery }) };
  }

  private async search(query: string, key: string): Promise<RawVideo[]> {
    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.videos;

    try {
      const search = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: '12',
        relevanceLanguage: 'pt',
        regionCode: 'BR',
        safeSearch: 'strict',
        videoEmbeddable: 'true',
        key,
      });
      const found = await this.json<{ items?: { id?: { videoId?: string } }[] }>(`${API}/search?${search}`);
      const ids = (found.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => !!id);
      if (!ids.length) return [];
      const details = await this.json<{
        items?: { id: string; snippet?: { title?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string }; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }[];
      }>(`${API}/videos?${new URLSearchParams({ part: 'snippet,contentDetails,statistics', id: ids.join(','), key })}`);
      // Mantém a ordem de relevância da busca.
      const byId = new Map((details.items ?? []).map((item) => [item.id, item]));
      const videos: RawVideo[] = ids
        .map((id) => byId.get(id))
        .filter((item): item is NonNullable<typeof item> => !!item && item.snippet?.liveBroadcastContent !== 'live')
        .map((item) => ({
          id: item.id,
          title: item.snippet?.title ?? 'Videoaula',
          channel: item.snippet?.channelTitle ?? 'YouTube',
          durationSeconds: parseIsoDuration(item.contentDetails?.duration),
          views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
          publishedAt: item.snippet?.publishedAt ?? null,
        }));
      this.cache.set(query, { at: Date.now(), videos });
      return videos;
    } catch (error) {
      // Cota esgotada, chave sem a API ativada ou rede: o app cai no link da busca.
      this.logger.warn(`Busca de videoaulas falhou ("${query}"): ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  private async json<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(`YouTube ${response.status}: ${body?.error?.message ?? 'erro'}`);
    }
    return (await response.json()) as T;
  }
}
