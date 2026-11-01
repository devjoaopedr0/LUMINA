import { AlertTriangle, BookOpen, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { EssayCorrection } from '@/lib/api';

const NAMES: Record<string, string> = {
  C1: 'Domínio da escrita formal',
  C2: 'Compreensão do tema e repertório',
  C3: 'Seleção e organização dos argumentos',
  C4: 'Coesão e mecanismos linguísticos',
  C5: 'Proposta de intervenção',
};
const ANNULMENTS: Record<string, string> = {
  EM_BRANCO: 'Em branco',
  TEXTO_INSUFICIENTE: 'Texto insuficiente',
  FUGA_AO_TEMA: 'Fuga ao tema',
  TIPO_TEXTUAL: 'Não atende ao tipo dissertativo-argumentativo',
  PARTE_DESCONECTADA: 'Parte desconectada do tema',
  IDENTIFICACAO: 'Identificação no texto',
  LINGUA_ESTRANGEIRA: 'Texto em língua estrangeira',
  ILEGIVEL: 'Texto ilegível',
};
function scoreColor(score: number) {
  if (score >= 160) return 'bg-emerald-500';
  if (score >= 120) return 'bg-primary';
  if (score >= 80) return 'bg-orange-400';
  return 'bg-red-500';
}

export function EssayCorrectionView({ correction, onRetry, retrying }: { correction: EssayCorrection; onRetry?: () => void; retrying?: boolean }) {
  if (correction.status === 'IN_PROGRESS' || correction.status === 'PENDING') {
    return (
      <Card className="bg-white" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary-700" />
          <div>
            <p className="font-semibold">Corrigindo pelas cinco competências…</p>
            <p className="text-sm text-graphite-500">Dois avaliadores independentes leem o texto com os critérios da cartilha do Inep. Leva cerca de um minuto.</p>
          </div>
        </div>
      </Card>
    );
  }
  if (correction.status === 'FAILED') {
    return (
      <Card className="border-red-200 bg-red-50" role="alert">
        <p className="font-semibold text-red-800">A correção não foi concluída</p>
        <p className="mt-1 text-sm text-red-700">{correction.errorMessage ?? 'Tente novamente em alguns minutos.'}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={retrying}>
            <RefreshCw size={14} />
            Tentar de novo
          </Button>
        ) : null}
      </Card>
    );
  }
  if (correction.status !== 'COMPLETED') return null;

  const total = correction.totalScore ?? 0;
  const methodText =
    correction.method === 'tres-avaliadores'
      ? `Os dois primeiros avaliadores ficaram ${correction.discrepancy?.maxCompetency ?? 0} pontos distantes numa competência e ${correction.discrepancy?.total ?? 0} no total — além do limite do Inep (80 por competência, 100 no total). Um terceiro avaliou e a nota é a média das duas avaliações mais próximas.`
      : correction.method === 'dois-avaliadores'
        ? 'Nota = média de dois avaliadores independentes, como no Enem.'
        : correction.method === 'modelo-estatistico'
          ? 'Estimativa do modelo estatístico (a IA estava indisponível): use só como referência.'
          : 'Nota definida por regra objetiva da cartilha.';

  return (
    <section aria-labelledby="correction-title" className="space-y-4">
      {correction.outdated ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">O texto mudou depois desta correção. Peça uma nova correção para avaliar a versão atual.</p>
      ) : null}
      <Card className="bg-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary-700"><Sparkles size={16} />Correção da LuminIA</p>
            <h2 id="correction-title" className="mt-2 text-4xl font-bold">
              {total}
              <span className="text-lg font-medium text-graphite-400"> / 1000</span>
            </h2>
          </div>
          <div className="text-right text-xs text-graphite-500">
            <p>Confiança: {Math.round((correction.confidence ?? 0) * 100)}%</p>
            {correction.analysis ? (
              <p>
                {correction.analysis.paragraphs} parágrafos · {correction.analysis.words} palavras · {correction.analysis.lines} linhas
                {correction.analysis.linesSource === 'estimativa' ? ' (estimadas)' : ' (da folha)'}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-sm text-graphite-500">{methodText}</p>
        {correction.annulment ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />Nota zero: {ANNULMENTS[correction.annulment.code] ?? correction.annulment.code}</p>
            <p className="mt-1 text-sm">{correction.annulment.explanation}</p>
            <p className="mt-1 text-xs">{correction.annulment.citation}</p>
          </div>
        ) : null}
        {correction.generalFeedback ? <p className="mt-4 whitespace-pre-line text-graphite-700">{correction.generalFeedback}</p> : null}
      </Card>

      {!correction.annulment ? (
        <ol className="grid gap-3">
          {(correction.competencies ?? []).map((c) => (
            <li key={c.competency}>
              <Card className="bg-white">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {c.competency} · {NAMES[c.competency]}
                  </h3>
                  <span className="text-lg font-bold">{c.score}<span className="text-sm font-normal text-graphite-400">/200</span></span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-surface-line" aria-hidden="true">
                  <div className={`h-2 rounded-full ${scoreColor(c.score)}`} style={{ width: `${(c.score / 200) * 100}%` }} />
                </div>
                {c.level ? <p className="mt-3 text-sm italic text-graphite-500">{c.score % 40 === 0 ? 'Nível da cartilha' : `Entre os níveis ${Math.floor(c.score / 40) * 40} e ${Math.ceil(c.score / 40) * 40} (média dos avaliadores) — nível garantido`}: “{c.level}”</p> : null}
                {c.justification ? <p className="mt-2 text-sm text-graphite-700">{c.justification}</p> : null}
                {c.evidence.length ? (
                  <ul className="mt-3 space-y-1">
                    {c.evidence.map((quote) => (
                      <li key={quote} className="border-l-2 border-primary pl-3 text-sm text-graphite-600">“{quote}”</li>
                    ))}
                  </ul>
                ) : null}
                {c.citations.length ? (
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graphite-400">
                    <BookOpen size={12} />
                    {c.citations.map((ref) => (
                      <span key={ref.id} title={ref.title}>{ref.citation || ref.title}</span>
                    ))}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      ) : null}

      {correction.analysis?.warnings.length ? (
        <Card className="bg-white">
          <h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} className="text-primary-700" />Pontos para revisar no texto</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-graphite-600">
            {correction.analysis.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </Card>
      ) : null}
      <p className="text-xs text-graphite-400">
        Correção automática baseada na Cartilha do Participante — A redação no Enem 2025 (Inep). É uma estimativa para estudo: a nota oficial é dada pela banca do Enem.
      </p>
    </section>
  );
}
