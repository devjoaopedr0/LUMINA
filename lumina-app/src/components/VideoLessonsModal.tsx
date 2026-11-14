import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, PlayCircle } from 'lucide-react';
import { Modal } from '@/components/notebooks/Modal';
import { ApiError, apiVideoLessons, type VideoLessonsResult } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

/** Videoaulas do YouTube para um assunto, no nível do aluno (item 24). */
export function VideoLessonsModal({ topicId, topic, onClose }: { topicId: string; topic: string; onClose: () => void }) {
  const [data, setData] = useState<VideoLessonsResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiVideoLessons(getAccessToken() ?? '', { topicId })
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : 'Não foi possível buscar videoaulas agora.'); });
    return () => { active = false; };
  }, [topicId]);

  return (
    <Modal title={`Videoaulas: ${topic}`} onClose={onClose} wide>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {!data && !error ? (
        <p role="status" className="flex items-center gap-2 text-sm text-graphite-500"><Loader2 className="h-4 w-4 animate-spin" />Procurando videoaulas…</p>
      ) : null}
      {data ? (
        <>
          <p className="text-sm text-graphite-500">
            {data.mastery === null ? 'Você ainda não tem domínio registrado neste assunto' : `Seu domínio aqui está em ${data.mastery}/100`}: a busca prioriza aulas <strong>{data.levelLabel}</strong>.
          </p>
          {data.videos.length ? (
            <ul className="mt-4 space-y-3">
              {data.videos.map((video) => (
                <li key={video.id}>
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex gap-3 rounded-2xl border border-surface-line p-3 hover:border-primary">
                    <img src={video.thumbnailUrl} alt="" loading="lazy" className="h-20 w-36 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0">
                      <span className="block font-semibold leading-snug">{video.title}</span>
                      <span className="mt-0.5 block text-xs text-graphite-500">{video.channel} · {video.duration}</span>
                      <span className="mt-1 block text-xs text-graphite-600">{video.reason}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-surface-card p-4 text-sm">
              {data.configured
                ? 'Não encontramos videoaulas na duração certa para este assunto agora. Veja a busca completa no YouTube:'
                : 'A lista de videoaulas ainda não está ativada. Enquanto isso, a busca já vem pronta para o seu nível:'}
            </p>
          )}
          <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 underline">
            <PlayCircle className="h-4 w-4" />Buscar “{data.query}” no YouTube<ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      ) : null}
    </Modal>
  );
}
