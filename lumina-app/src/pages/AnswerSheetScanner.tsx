import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCheck, Download, FileImage, FileText, Loader2, Lock, Plus, Printer, ScanLine, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CornerEditor } from '@/components/essays/CornerEditor';
import { AnswerSheetConference } from '@/components/answer-sheets/AnswerSheetConference';
import { needsReview } from '@/lib/answer-sheet';
import { getAccessToken } from '@/lib/auth';
import {
  apiAnswerSheetBatchPdfUrl,
  apiAnswerSheetConfirmBatch,
  apiAnswerSheetFinalizeBatch,
  apiAnswerSheetScan,
  apiAnswerSheetScanGet,
  apiAnswerSheetScans,
  apiSimulations,
  ApiError,
  type AnswerSheetBatchResult,
  type AnswerSheetScan,
  type AnswerSheetScanSummary,
  type SimulationSummary,
} from '@/lib/api';
import { detectDocument, enhanceDocument, outputSize, rotate90, warpPerspective, type Quad, type RasterImage } from '@/lib/doc-scanner';
import { fileToRaster, nextFrame, rasterToCanvas, rasterToGrayPage, videoToRaster } from '@/lib/doc-scanner-canvas';
import { buildPdf, bytesToBase64, type GrayPage } from '@/lib/pdf-writer';

type Step = 'choose' | 'camera' | 'corners' | 'pages' | 'sending' | 'batch' | 'conference';
const MAX_PAGES = 60;

interface DigitizedPage {
  id: number;
  gray: GrayPage;
  thumb: string;
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export function AnswerSheetScanner() {
  const [step, setStep] = useState<Step>('choose');
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [simulationId, setSimulationId] = useState('');
  const [history, setHistory] = useState<AnswerSheetScanSummary[]>([]);
  const [photo, setPhoto] = useState<RasterImage | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [autoFound, setAutoFound] = useState(true);
  const [pages, setPages] = useState<DigitizedPage[]>([]);
  const [batch, setBatch] = useState<AnswerSheetBatchResult | null>(null);
  const [scan, setScan] = useState<AnswerSheetScan | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmFinalAll, setConfirmFinalAll] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pdfRef = useRef<HTMLInputElement | null>(null);
  const pageSeq = useRef(0);

  const loadHistory = useCallback(() => {
    apiAnswerSheetScans(getAccessToken() ?? '').then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    apiSimulations(getAccessToken() ?? '').then((rows) => { if (active) setSimulations(rows); }).catch(() => { if (active) setError('Não foi possível carregar seus simulados.'); });
    loadHistory();
    return () => { active = false; };
  }, [loadHistory]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não dá acesso à câmera aqui. Use "Escolher foto" — no celular ele também abre a câmera.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = stream;
      setStep('camera');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError('Não foi possível abrir a câmera. Você pode escolher uma foto do aparelho.');
    }
  }

  async function loadPhoto(raster: RasterImage) {
    setWorking('Procurando a folha…');
    await nextFrame();
    const detection = detectDocument(raster);
    setPhoto(raster);
    setQuad(detection.quad);
    setAutoFound(detection.found);
    setWorking('');
    setStep('corners');
  }

  async function onPhotoFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      setWorking('Abrindo a foto…');
      await loadPhoto(await fileToRaster(file));
    } catch (e) {
      setWorking('');
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a foto.');
    }
  }

  /** Recorta, endireita e uniformiza a luz da foto e põe a página no PDF. */
  async function addPage(rotate = false) {
    if (!photo || !quad) return;
    if (pages.length >= MAX_PAGES) {
      setError(`O PDF pode ter até ${MAX_PAGES} folhas.`);
      return;
    }
    setWorking('Digitalizando a folha…');
    await nextFrame();
    try {
      let flat = warpPerspective(photo, quad, outputSize(quad, 1600));
      if (rotate) flat = rotate90(flat);
      const page = enhanceDocument(flat, 'gray');
      const gray = rasterToGrayPage(page, 1100);
      const thumbCanvas = rasterToCanvas(page);
      const thumb = document.createElement('canvas');
      thumb.width = 220;
      thumb.height = Math.round((page.height * 220) / page.width);
      thumb.getContext('2d')!.drawImage(thumbCanvas, 0, 0, thumb.width, thumb.height);
      setPages((list) => [...list, { id: ++pageSeq.current, gray, thumb: thumb.toDataURL('image/jpeg', 0.7) }]);
      setPhoto(null);
      setQuad(null);
      setStep('pages');
    } catch {
      setError('Os cantos não formam uma folha. Ajuste-os e tente de novo.');
    } finally {
      setWorking('');
    }
  }

  async function makePdf(): Promise<Uint8Array> {
    setWorking(`Gerando o PDF (${pages.length} ${pages.length === 1 ? 'folha' : 'folhas'})…`);
    await nextFrame();
    return buildPdf(pages.map((p) => p.gray));
  }

  async function downloadLocalPdf() {
    try {
      const pdf = await makePdf();
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
      downloadBlob(url, 'cartoes-resposta.pdf');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      setWorking('');
    }
  }

  async function sendPdf(dataUrl: string) {
    setStep('sending');
    setError('');
    setWorking('Lendo as folhas do PDF…');
    try {
      const result = await apiAnswerSheetScan(getAccessToken() ?? '', { pdf: dataUrl, simulationId: simulationId || undefined });
      setBatch(result);
      setPages([]);
      setStep('batch');
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar o PDF. Verifique a conexão e tente de novo.');
      setStep(pages.length ? 'pages' : 'choose');
    } finally {
      setWorking('');
    }
  }

  async function sendPages() {
    try {
      const pdf = await makePdf();
      await sendPdf(`data:application/pdf;base64,${bytesToBase64(pdf)}`);
    } catch (e) {
      setWorking('');
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    }
  }

  async function onPdfFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Escolha um arquivo PDF.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('O PDF pode ter no máximo 25 MB.');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await sendPdf(`data:application/pdf;base64,${bytesToBase64(bytes)}`);
  }

  async function confirmAll() {
    if (!batch) return;
    setWorking('Lançando as notas sem pendências…');
    try {
      const { confirmed, pending } = await apiAnswerSheetConfirmBatch(getAccessToken() ?? '', batch.batchId);
      const refreshed = await Promise.all(batch.results.map(async (r) => (r.scan ? { ...r, scan: await apiAnswerSheetScanGet(getAccessToken() ?? '', r.scan.id) } : r)));
      setBatch({ ...batch, results: refreshed });
      setNotice(`${confirmed} ${confirmed === 1 ? 'nota lançada' : 'notas lançadas'}${pending ? `; ${pending} ${pending === 1 ? 'folha ainda precisa' : 'folhas ainda precisam'} de conferência` : ''}.`);
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível lançar as notas.');
    } finally {
      setWorking('');
    }
  }

  async function finalizeAll() {
    if (!batch) return;
    setWorking('Finalizando as correções lançadas…');
    try {
      const { finalized, notPosted } = await apiAnswerSheetFinalizeBatch(getAccessToken() ?? '', batch.batchId);
      const refreshed = await Promise.all(batch.results.map(async (r) => (r.scan ? { ...r, scan: await apiAnswerSheetScanGet(getAccessToken() ?? '', r.scan.id) } : r)));
      setBatch({ ...batch, results: refreshed });
      const rest = notPosted ? `; ${notPosted} ${notPosted === 1 ? 'folha ainda não tem' : 'folhas ainda não têm'} nota lançada` : '';
      setNotice(`${finalized} ${finalized === 1 ? 'correção finalizada' : 'correções finalizadas'} — domínio por tópico atualizado${rest}.`);
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível finalizar.');
    } finally {
      setWorking('');
    }
  }

  async function downloadBatchPdf(batchId: string) {
    try {
      const url = await apiAnswerSheetBatchPdfUrl(getAccessToken() ?? '', batchId);
      downloadBlob(url, `cartoes-${batchId.slice(0, 8)}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError('Não foi possível baixar o PDF.');
    }
  }

  async function openScan(id: string) {
    setError('');
    try {
      setScan(await apiAnswerSheetScanGet(getAccessToken() ?? '', id));
      setStep('conference');
    } catch {
      setError('Não foi possível abrir esta leitura.');
    }
  }

  function onConferenceSaved(updated: AnswerSheetScan) {
    setScan(updated);
    setBatch((b) => (b ? { ...b, results: b.results.map((r) => (r.scan?.id === updated.id ? { ...r, scan: updated } : r)) } : b));
    setNotice(updated.result ? `Nota lançada: ${updated.result.correct}/${updated.result.total} acertos.` : updated.message ?? 'Conferência salva.');
    loadHistory();
  }

  const statusLabel = (s: AnswerSheetScan) =>
    s.status === 'COMPLETED' ? (s.result ? `${s.result.finalizedAt ? 'finalizada' : 'nota lançada (domínio pendente)'} · ${s.result.correct}/${s.result.total}` : 'conferida') : s.questions.some(needsReview) ? `${s.questions.filter(needsReview).length} para conferir` : 'pronta para lançar';

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
        <header className="my-6">
          <p className="flex items-center gap-2 text-primary-700"><ScanLine size={20} />Correção por captura</p>
          <h1 className="mt-2 text-3xl font-bold">Scanner de cartão-resposta</h1>
          <p className="mt-2 text-graphite-500">Fotografe os cartões: cada foto vira uma página de PDF, a Lumina lê as marcações e você confere — e ajusta qualquer bolha — antes de lançar a nota.</p>
        </header>

        {/* Sempre montados: os botões de várias etapas abrem estes seletores. */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Escolher foto do cartão-resposta" onChange={(e) => { void onPhotoFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Enviar PDF de cartões-resposta" onChange={(e) => { void onPdfFile(e.target.files?.[0]); e.target.value = ''; }} />
        {error ? <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}
        {working ? <p role="status" className="mb-4 flex items-center gap-2 text-sm text-graphite-500"><Loader2 size={16} className="animate-spin" />{working}</p> : null}

        {step === 'choose' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Card className="bg-white">
              <label htmlFor="sheet-simulation" className="block text-sm font-semibold">Simulado (opcional)</label>
              <select id="sheet-simulation" value={simulationId} onChange={(e) => setSimulationId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-surface-line px-3">
                <option value="">Identificar pelo código impresso em cada folha</option>
                {simulations.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.questionCount} questões{s.className ? ` · ${s.className}` : ''}</option>)}
              </select>
              <p className="mt-1 text-xs text-graphite-400">Cada cartão da Lumina tem um código que diz de qual simulado e de qual aluno ele é — dá para fotografar a turma inteira num PDF só.</p>
              {simulationId ? <Link to={`/app/gabarito-scanner/imprimir/${simulationId}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><Printer size={16} />Imprimir os cartões deste simulado</Link> : null}
              <ul className="mt-5 space-y-1 text-sm text-graphite-500">
                <li>• Folha inteira na foto, com os quatro quadrados pretos dos cantos.</li>
                <li>• Luz uniforme, sem a sombra do celular; folha lisa sobre a mesa.</li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => void openCamera()}><Camera size={18} />Fotografar cartões</Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}><FileImage size={18} />Escolher foto</Button>
                <Button variant="ghost" onClick={() => pdfRef.current?.click()}><FileText size={18} />Enviar PDF pronto</Button>
              </div>
              {pages.length ? <Button variant="outline" className="mt-4" onClick={() => setStep('pages')}>Voltar ao PDF em montagem ({pages.length})</Button> : null}
            </Card>
            <Card className="bg-white">
              <h2 className="font-semibold">Leituras recentes</h2>
              {history.length ? (
                <ul className="mt-3 space-y-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button type="button" onClick={() => void openScan(h.id)} className="w-full rounded-xl border border-surface-line p-3 text-left text-sm hover:border-primary">
                        <span className="block font-semibold">{h.simulation?.title ?? 'Simulado'}</span>
                        <span className="block text-xs text-graphite-500">{h.studentName}{h.page ? ` · pág. ${h.page}` : ''} · {h.result ? `${h.result.correct}/${h.result.total} acertos${h.result.finalizedAt ? ' · finalizada' : ' · a finalizar'}` : h.status === 'NEEDS_REVIEW' ? (h.reviewCount ? `${h.reviewCount} para conferir` : 'aguardando confirmação') : 'sem nota'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-graphite-400">Nenhum cartão lido ainda.</p>}
            </Card>
          </div>
        ) : null}

        {step === 'camera' ? (
          <Card className="bg-white">
            <div className="relative mx-auto max-w-xl overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="block w-full" aria-label="Visualização da câmera" />
              <div className="pointer-events-none absolute inset-[5%] rounded-lg border-2 border-dashed border-primary/80" aria-hidden="true" />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => { if (videoRef.current) { const r = videoToRaster(videoRef.current); stopCamera(); void loadPhoto(r); } }}><Camera size={18} />Tirar foto</Button>
              <Button variant="outline" onClick={() => { stopCamera(); setStep(pages.length ? 'pages' : 'choose'); }}>Cancelar</Button>
            </div>
          </Card>
        ) : null}

        {step === 'corners' && photo && quad ? (
          <Card className="bg-white">
            <p className="mb-3 text-sm text-graphite-600">{autoFound ? 'Achamos a folha. Confira os cantos.' : 'Arraste os cantos até as pontas da folha.'} O alinhamento fino é feito pelos quadrados pretos.</p>
            <CornerEditor image={photo} quad={quad} onChange={setQuad} />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void addPage()}><Wand2 size={18} />Digitalizar e pôr no PDF</Button>
              <Button variant="outline" onClick={() => void addPage(true)}>Girar 90° e pôr no PDF</Button>
              <Button variant="ghost" onClick={() => { setPhoto(null); setStep(pages.length ? 'pages' : 'choose'); }}>Descartar foto</Button>
            </div>
          </Card>
        ) : null}

        {step === 'pages' ? (
          <Card className="bg-white">
            <h2 className="font-semibold">PDF em montagem · {pages.length} {pages.length === 1 ? 'folha' : 'folhas'}</h2>
            <p className="text-sm text-graphite-500">Fotografe todos os cartões que quiser corrigir. Cada um vira uma página do PDF.</p>
            <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {pages.map((p, i) => (
                <li key={p.id} className="relative rounded-lg border border-surface-line bg-surface-card p-1">
                  <img src={p.thumb} alt={`Página ${i + 1}`} className="w-full rounded" />
                  <span className="absolute left-2 top-2 rounded bg-graphite px-1.5 text-xs text-white">{i + 1}</span>
                  <button type="button" onClick={() => setPages((list) => list.filter((x) => x.id !== p.id))} className="absolute right-2 top-2 rounded bg-white/90 p-1 text-red-700" aria-label={`Remover página ${i + 1}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={!pages.length || Boolean(working)} onClick={() => void sendPages()}><ScanLine size={18} />Gerar PDF e corrigir</Button>
              <Button variant="outline" onClick={() => void openCamera()}><Plus size={18} />Fotografar outra folha</Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}><FileImage size={18} />Outra foto do aparelho</Button>
              <Button variant="ghost" disabled={!pages.length || Boolean(working)} onClick={() => void downloadLocalPdf()}><Download size={18} />Baixar o PDF</Button>
            </div>
          </Card>
        ) : null}

        {step === 'sending' ? <Card className="bg-white" role="status"><p className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Lendo as folhas do PDF…</p></Card> : null}

        {step === 'batch' && batch ? (
          <Card className="bg-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">PDF lido · {batch.pages} {batch.pages === 1 ? 'folha' : 'folhas'}</h2>
                <p className="text-sm text-graphite-500">Nenhuma nota foi lançada ainda: confira cada folha (e ajuste o que precisar) ou lance de uma vez as que não têm dúvida.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void confirmAll()} disabled={Boolean(working)}><CheckCheck size={18} />Lançar as sem pendências</Button>
                <Button variant="outline" onClick={() => setConfirmFinalAll(true)} disabled={Boolean(working) || !batch.results.some((r) => r.scan?.result && !r.scan.result.finalizedAt)}><Lock size={18} />Finalizar as lançadas</Button>
                <Button variant="outline" onClick={() => void downloadBatchPdf(batch.batchId)}><Download size={18} />Baixar o PDF</Button>
              </div>
            </div>
            {confirmFinalAll ? (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <p>Finalizar aplica o domínio por tópico de cada aluno com as respostas lançadas e trava essas folhas. As que ainda não têm nota ficam como estão. Não dá para desfazer.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={Boolean(working)} onClick={() => { setConfirmFinalAll(false); void finalizeAll(); }}>Finalizar agora</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmFinalAll(false)}>Cancelar</Button>
                </div>
              </div>
            ) : null}
            <ul className="mt-5 divide-y divide-surface-line">
              {batch.results.map((r) => (
                <li key={r.page} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">Página {r.page}{r.scan ? ` · ${r.scan.studentName ?? 'aluno'}` : ''}</p>
                    <p className={`text-sm ${r.error ? 'text-red-700' : 'text-graphite-500'}`}>{r.error ?? `${r.scan!.simulation?.title ?? ''} · ${statusLabel(r.scan!)}`}</p>
                  </div>
                  {r.scan ? <Button variant="outline" size="sm" onClick={() => { setScan(r.scan); setStep('conference'); }}>{r.scan.status === 'COMPLETED' ? 'Ver / corrigir' : 'Conferir'}</Button> : null}
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="mt-3" onClick={() => { setBatch(null); setStep('choose'); setNotice(''); }}>Corrigir outros cartões</Button>
          </Card>
        ) : null}

        {step === 'conference' && scan ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-graphite-500">{scan.simulation?.title} · <strong>{scan.studentName ?? 'aluno'}</strong>{scan.page ? ` · página ${scan.page} do PDF` : ''}{scan.sheetCode ? ` · folha nº ${scan.sheetCode}` : ''}</p>
              <Button variant="ghost" size="sm" onClick={() => setStep(batch ? 'batch' : 'choose')}><ArrowLeft size={14} />{batch ? 'Voltar ao PDF' : 'Voltar'}</Button>
            </div>
            {scan.message ? <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{scan.message}</p> : null}
            {scan.warnings.length ? <ul className="space-y-1 text-sm text-amber-800">{scan.warnings.map((w) => <li key={w}>• {w}</li>)}</ul> : null}
            <AnswerSheetConference scan={scan} onSaved={onConferenceSaved} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
