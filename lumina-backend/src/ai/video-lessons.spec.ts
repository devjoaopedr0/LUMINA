import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration, levelForMastery, parseIsoDuration, pickVideoLessons, videoQuery, youtubeSearchUrl } from './video-lessons';
import { VideoLessonsService } from './video-lessons.service';

describe('videoaulas: regras', () => {
  it('nível pelo domínio do aluno', () => {
    expect(levelForMastery(null)).toBe('BASICO');
    expect(levelForMastery(39)).toBe('BASICO');
    expect(levelForMastery(40)).toBe('INTERMEDIARIO');
    expect(levelForMastery(75)).toBe('AVANCADO');
  });

  it('termo de busca e link do YouTube', () => {
    expect(videoQuery('Funções do 2º grau', 'Matemática', 'BASICO')).toBe('Funções do 2º grau Matemática aula do zero');
    expect(videoQuery('Estequiometria', null, 'AVANCADO')).toBe('Estequiometria exercícios resolvidos ENEM');
    expect(youtubeSearchUrl('a b')).toBe('https://www.youtube.com/results?search_query=a%20b');
  });

  it('duração ISO 8601', () => {
    expect(parseIsoDuration('PT12M34S')).toBe(754);
    expect(parseIsoDuration('PT1H2M5S')).toBe(3725);
    expect(parseIsoDuration('P1D')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('tira shorts e vídeos longos demais, mantém a ordem e explica com dados reais', () => {
    const videos = [
      { id: 'short', title: 'Short', channel: 'C', durationSeconds: 50, views: 10, publishedAt: null },
      { id: 'boa', title: 'Funções &amp; gráficos', channel: 'Canal Exato', durationSeconds: 900, views: 125_000, publishedAt: null },
      { id: 'longa', title: 'Live de 3 horas', channel: 'C', durationSeconds: 3 * 3600, views: 10, publishedAt: null },
      { id: 'sem', title: 'Sem duração', channel: 'C', durationSeconds: null, views: null, publishedAt: null },
    ];
    const picked = pickVideoLessons(videos, { topic: 'Funções', level: 'BASICO', mastery: 30 });
    expect(picked.map((v) => v.id)).toEqual(['boa']);
    expect(picked[0]).toMatchObject({ title: 'Funções & gráficos', duration: '15:00', url: 'https://www.youtube.com/watch?v=boa' });
    expect(picked[0].reason).toBe('Seu domínio em Funções está em 30: por isso a busca priorizou uma aula que começa do básico. Vídeo de 15 min do canal Canal Exato, com 125 mil visualizações.');
  });
});

describe('VideoLessonsService', () => {
  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  function setup(mastery: number | null = 82) {
    const prisma = {
      topic: { findUnique: vi.fn().mockResolvedValue({ name: 'Cinemática', subject: { name: 'Física' } }) },
      topicMastery: { findFirst: vi.fn().mockResolvedValue(mastery === null ? null : { masteryScore: mastery }) },
    };
    const service = new VideoLessonsService(prisma as any);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: { videoId: 'v1' } }] })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: 'v1', snippet: { title: 'Cinemática ENEM', channelTitle: 'Física Já' }, contentDetails: { duration: 'PT10M' }, statistics: { viewCount: '2000' } }] })),
      );
    service.fetchImpl = fetchImpl as unknown as typeof fetch;
    return { service, fetchImpl };
  }

  it('sem chave: não inventa vídeo, devolve o link da busca no nível do aluno', async () => {
    const { service, fetchImpl } = setup(82);
    const result = await service.forUser('aluno', { topicId: '11111111-1111-4111-8111-111111111111' });
    expect(result).toMatchObject({ configured: false, videos: [], level: 'AVANCADO', mastery: 82, query: 'Cinemática Física exercícios resolvidos ENEM' });
    expect(result.searchUrl).toContain('youtube.com/results');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('com chave: busca, pega a duração e guarda em cache (a 2ª chamada não gasta cota)', async () => {
    process.env.YOUTUBE_API_KEY = 'chave-teste';
    const { service, fetchImpl } = setup(82);
    const first = await service.forUser('aluno', { topicId: '11111111-1111-4111-8111-111111111111' });
    expect(first.videos).toHaveLength(1);
    expect(first.videos[0]).toMatchObject({ channel: 'Física Já', duration: '10:00', level: 'AVANCADO' });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('safeSearch=strict');
    await service.forUser('aluno', { topicId: '11111111-1111-4111-8111-111111111111' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falha da API (cota, chave sem a API ativada) cai no link da busca sem erro', async () => {
    process.env.YOUTUBE_API_KEY = 'chave-teste';
    const { service, fetchImpl } = setup(null);
    fetchImpl.mockReset().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'quotaExceeded' } }), { status: 403 }));
    const result = await service.forUser('aluno', { topic: 'Genética', subject: 'Biologia' });
    expect(result).toMatchObject({ configured: true, videos: [], level: 'BASICO' });
  });
});
