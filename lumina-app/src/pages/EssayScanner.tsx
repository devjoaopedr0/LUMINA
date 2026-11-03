import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, FileImage, Loader2, Plus, RotateCw, ScanLine, Trash2, Upload, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CornerEditor } from '@/components/essays/CornerEditor';
import { EssayCorrectionView } from '@/components/essays/EssayCorrectionPanel';
import { quotaLabel, useEssayCorrection } from '@/hooks/useEssayCorrection';
import { getAccessToken } from '@/lib/auth';
import {
  apiEssayScan,
  apiEssayScanConfirm,
  apiEssayScanCreate,
  apiEssayScanDeleteImages,
  apiEssayScanPageUrl,
  apiEssayScanRetry,
  apiEssayThemes,
  ApiError,
  type EssayScan,
  type EssayTheme,
} from '@/lib/api';
import { detectDocument, enhanceDocument, outputSize, rotate90, warpPerspective, type EnhanceMode, type Quad, type RasterImage } from '@/lib/doc-scanner';
import { fileToRaster, MAX_OUTPUT_SIDE, nextFrame, rasterToCanvas, rasterToJpeg, videoToRaster } from '@/lib/doc-scanner-canvas';

type Step = 'capture' | 'camera' | 'corners' | 'preview' | 'sending' | 'reading' | 'review' | 'done';
const MAX_PAGES = 2;
const POLL_MS = 2500;
const MODES: { mode: EnhanceMode; label: string }[] = [
  { mode: 'color', label: 'Realçado' },
  { mode: 'gray', label: 'Cinza' },
  { mode: 'bw', label: 'Preto e branco' },
];

const STEPS = ['Foto', 'Ajuste', 'Leitura', 'Revisão', 'Correção'];
function stepIndex(step: Step) {
  return { capture: 0, camera: 0, corners: 1, preview: 1, sending: 2, reading: 2, review: 3, done: 4 }[step];
}

export function EssayScanner() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(scanId ? 'reading' : 'capture');
  const [theme, setTheme] = useState('');
  const [themes, setThemes] = useState<EssayTheme[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  // Foto atual e os cantos da folha nela.
  const [photo, setPhoto] = useState<RasterImage | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [autoFound, setAutoFound] = useState(true);
  // Página digitalizada (já desentortada) e o filtro aplicado.
  const [flat, setFlat] = useState<RasterImage | null>(null);
  const [mode, setMode] = useState<EnhanceMode>('color');
  const [pages, setPages] = useState<string[]>([]);
  // Leitura e revisão.
  const [scan, setScan] = useState<EssayScan | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [essayId, setEssayId] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const { correction, error: correctionError, busy: correctionBusy, request: requestCorrection, setCorrection, quota, setQuota } = useEssayCorrection(essayId);
  const quotaExhausted = quota !== null && quota.remaining <= 0;
  const [quotaNotice, setQuotaNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let active = true;
    apiEssayThemes(getAccessToken() ?? '').then((data) => { if (active) setThemes(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  // ---------------------------------------------------------------- captura
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
      setError('Não foi possível abrir a câmera (permissão negada ou câmera em uso). Você pode escolher uma foto do aparelho.');
    }
  }

  async function loadPhoto(raster: RasterImage) {
    setWorking('Procurando a folha na foto…');
    await nextFrame();
    const detection = detectDocument(raster);
    setPhoto(raster);
    setQuad(detection.quad);
    setAutoFound(detection.found);
    setWorking('');
    setStep('corners');
  }

  async function takePicture() {
    if (!videoRef.current) return;
    try {
      const raster = videoToRaster(videoRef.current);
      stopCamera();
      await loadPhoto(raster);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível capturar a foto.');
    }
  }

  async function onFile(file: File | undefined) {
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

  // --------------------------------------------------------- digitalização
  async function digitize() {
    if (!photo || !quad) return;
    setWorking('Corrigindo perspectiva e luz…');
    await nextFrame();
    try {
      setFlat(warpPerspective(photo, quad, outputSize(quad, MAX_OUTPUT_SIDE)));
      setStep('preview');
    } catch {
      setError('Os cantos não formam uma folha. Ajuste-os e tente de novo.');
    } finally {
      setWorking('');
    }
  }

  const enhanced = useMemo(() => (flat ? enhanceDocument(flat, mode) : null), [flat, mode]);
  const enhancedUrl = useMemo(() => (enhanced ? rasterToCanvas(enhanced).toDataURL('image/jpeg', 0.85) : ''), [enhanced]);

  function addPage() {
    if (!enhanced) return;
    setPages((current) => [...current, rasterToJpeg(enhanced)]);
    setPhoto(null);
    setFlat(null);
    setQuad(null);
    setStep('capture');
  }

  async function send() {
    if (!enhanced) return;
    const all = [...pages, rasterToJpeg(enhanced)];
    setStep('sending');
    setError('');
    try {
      const created = await apiEssayScanCreate(getAccessToken() ?? '', all, theme.trim());
      setImageUrls(all);
      navigate(`/app/redacoes/scanner/${created.id}`, { replace: true });
      setStep('reading');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar a foto. Verifique a conexão e tente de novo.');
      setStep('preview');
    }
  }

  // ------------------------------------------------------- leitura (OCR)
  useEffect(() => {
    if (!scanId) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await apiEssayScan(getAccessToken() ?? '', scanId);
        if (!active) return;
        setScan(data);
        setError('');
        if (data.status === 'PROCESSING') {
          setStep('reading');
          timer = window.setTimeout(() => void poll(), POLL_MS);
        } else if (data.status === 'READY') {
          setText((current) => current || data.text || '');
          setTitle((current) => current || data.title || '');
          setTheme((current) => current || data.theme);
          setStep('review');
        } else if (data.status === 'CONFIRMED' && data.essayId) {
          setEssayId(data.essayId);
          setStep('done');
        } else {
          setStep('reading');
        }
      } catch {
        if (!active) return;
        setError('Não foi possível consultar a leitura agora. Tentando de novo…');
        timer = window.setTimeout(() => void poll(), POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [scanId, pollKey]);

  // Fotos para a revisão: as locais (recém-enviadas) ou as do servidor.
  useEffect(() => {
    if (!scan || imageUrls.length || !scan.pages.length || step !== 'review') return;
    let active = true;
    const created: string[] = [];
    Promise.all(scan.pages.map((p) => apiEssayScanPageUrl(getAccessToken() ?? '', scan.id, p.index)))
      .then((urls) => {
        created.push(...urls);
        if (active) setImageUrls(urls);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [imageUrls.length, scan, step]);

  async function retryReading() {
    if (!scanId) return;
    try {
      await apiEssayScanRetry(getAccessToken() ?? '', scanId);
      setScan((s) => (s ? { ...s, status: 'PROCESSING', errorMessage: null } : s));
      setPollKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível repetir a leitura.');
    }
  }

  const illegible = (text.match(/\[ileg[ií]vel\]/gi) ?? []).length;
  function jumpToIllegible() {
    const area = textRef.current;
    if (!area) return;
    const from = area.selectionEnd ?? 0;
    const re = /\[ileg[ií]vel\]/gi;
    re.lastIndex = from;
    const match = re.exec(text) ?? /\[ileg[ií]vel\]/i.exec(text);
    if (!match) return;
    area.focus();
    area.setSelectionRange(match.index, match.index + match[0].length);
  }

  async function confirm() {
    if (!scanId) return;
    setError('');
    setWorking('Enviando para correção…');
    try {
      const result = await apiEssayScanConfirm(getAccessToken() ?? '', scanId, { text, theme: theme.trim(), title: title.trim() || undefined });
      setEssayId(result.essayId);
      setCorrection(result.correction);
      if (result.quota) setQuota(result.quota);
      else if (result.correction.quota) setQuota(result.correction.quota);
      // Cota acabou entre a foto e o envio: a redação ficou salva sem correção.
      setQuotaNotice(result.quotaMessage ?? '');
      setStep('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar para correção.');
    } finally {
      setWorking('');
    }
  }

  async function deleteImages() {
    if (!scanId) return;
    try {
      await apiEssayScanDeleteImages(getAccessToken() ?? '', scanId);
      setImageUrls([]);
      setScan((s) => (s ? { ...s, pages: [] } : s));
    } catch {
      setError('Não foi possível apagar as fotos agora.');
    }
  }

  const themeValid = theme.trim().length >= 3;

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/app/redacoes" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Minhas redações</Link>
        <header className="my-6">
          <p className="flex items-center gap-2 text-primary-700"><ScanLine size={20} />Correção por foto</p>
          <h1 className="mt-2 text-3xl font-bold">Scanner de redação</h1>
          <p className="mt-2 text-graphite-500">Fotografe a folha, ajuste os cantos, confira o texto lido e receba a nota pelas cinco competências do Enem.</p>
        </header>

        <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Etapas">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === stepIndex(step) ? 'step' : undefined} className={`rounded-full px-3 py-1 ${i === stepIndex(step) ? 'bg-primary text-graphite' : i < stepIndex(step) ? 'bg-graphite text-white' : 'bg-white text-graphite-400'}`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {error ? <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {working ? <p role="status" className="mb-4 flex items-center gap-2 text-sm text-graphite-500"><Loader2 size={16} className="animate-spin" />{working}</p> : null}

        {step === 'capture' ? (
          <Card className="bg-white">
            {pages.length ? <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Página 1 pronta. Fotografe a continuação da redação (página {pages.length + 1}).</p> : null}
            <label className="block text-sm font-semibold" htmlFor="scan-theme">Tema da proposta</label>
            <input id="scan-theme" list="scan-themes" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex.: Desafios para a valorização da herança africana no Brasil" className="mt-2 h-12 w-full rounded-xl border border-surface-line px-4" />
            <datalist id="scan-themes">{themes.map((t) => <option key={t.id} value={t.title}>{t.year ? `Enem ${t.year}` : t.exam}</option>)}</datalist>
            <p className="mt-1 text-xs text-graphite-400">O tema é o que permite avaliar fuga e tangenciamento. Você pode preencher depois, na revisão.</p>
            <ul className="mt-5 space-y-1 text-sm text-graphite-500">
              <li>• Apoie a folha numa superfície escura e lisa, com boa luz e sem sombra da mão ou do celular.</li>
              <li>• Enquadre a folha inteira, de cima, com as quatro pontas aparecendo.</li>
            </ul>
            {quota ? (
              <p className={`mt-5 rounded-xl p-3 text-sm ${quotaExhausted ? 'bg-amber-50 font-semibold text-amber-800' : 'bg-surface-card text-graphite-500'}`}>
                {quotaLabel(quota)}
                {quotaExhausted ? ' Você ainda pode digitar a redação no editor e salvá-la para corrigir depois.' : ''}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void openCamera()} disabled={quotaExhausted}><Camera size={18} />Abrir câmera</Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={quotaExhausted}><FileImage size={18} />Escolher foto</Button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Escolher foto da redação" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </Card>
        ) : null}

        {step === 'camera' ? (
          <Card className="bg-white">
            <div className="relative mx-auto max-w-xl overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="block w-full" aria-label="Visualização da câmera" />
              <div className="pointer-events-none absolute inset-[6%] rounded-lg border-2 border-dashed border-primary/80" aria-hidden="true" />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void takePicture()}><Camera size={18} />Tirar foto</Button>
              <Button variant="outline" onClick={() => { stopCamera(); setStep('capture'); }}>Cancelar</Button>
            </div>
          </Card>
        ) : null}

        {step === 'corners' && photo && quad ? (
          <Card className="bg-white">
            <p className="mb-3 text-sm text-graphite-600">
              {autoFound ? 'Encontramos a folha. Confira os cantos e arraste se precisar.' : 'Não deu para achar a folha com segurança. Arraste os quatro cantos até as pontas da folha.'}
            </p>
            <CornerEditor image={photo} quad={quad} onChange={setQuad} />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void digitize()} disabled={Boolean(working)}><Wand2 size={18} />Digitalizar</Button>
              <Button variant="outline" onClick={() => setQuad([{ x: 0, y: 0 }, { x: photo.width, y: 0 }, { x: photo.width, y: photo.height }, { x: 0, y: photo.height }])}>Usar foto inteira</Button>
              <Button variant="ghost" onClick={() => { setPhoto(null); setStep('capture'); }}>Refazer foto</Button>
            </div>
          </Card>
        ) : null}

        {step === 'preview' && enhanced ? (
          <Card className="bg-white">
            <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Filtro">
              {MODES.map((m) => (
                <button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode} onClick={() => setMode(m.mode)} className={`rounded-full px-3 py-1 text-sm font-semibold ${mode === m.mode ? 'bg-graphite text-white' : 'bg-surface-card text-graphite'}`}>{m.label}</button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setFlat((f) => (f ? rotate90(f) : f))}><RotateCw size={14} />Girar</Button>
            </div>
            <img src={enhancedUrl} alt={`Página ${pages.length + 1} digitalizada`} className="mx-auto block max-h-[70vh] rounded-xl border border-surface-line" />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void send()}><Upload size={18} />Enviar para leitura{pages.length ? ` (${pages.length + 1} páginas)` : ''}</Button>
              {pages.length + 1 < MAX_PAGES ? <Button variant="outline" onClick={addPage}><Plus size={18} />Adicionar página</Button> : null}
              <Button variant="ghost" onClick={() => setStep('corners')}>Ajustar cantos</Button>
            </div>
          </Card>
        ) : null}

        {step === 'sending' || (step === 'reading' && scan?.status !== 'FAILED') ? (
          <Card className="bg-white" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary-700" />
              <div>
                <p className="font-semibold">{step === 'sending' ? 'Enviando a foto…' : 'Lendo a sua letra…'}</p>
                <p className="text-sm text-graphite-500">A LuminIA transcreve a redação exatamente como está escrita — sem corrigir nada. Você confere antes da nota.</p>
              </div>
            </div>
          </Card>
        ) : null}

        {step === 'reading' && scan?.status === 'FAILED' ? (
          <Card className="border-red-200 bg-red-50" role="alert">
            <p className="font-semibold text-red-800">Não conseguimos ler a foto</p>
            <p className="mt-1 text-sm text-red-700">{scan.errorMessage}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {scan.pages.length ? <Button variant="outline" size="sm" onClick={() => void retryReading()}>Tentar ler de novo</Button> : null}
              <Button variant="outline" size="sm" onClick={() => navigate('/app/redacoes/scanner')}>Tirar outra foto</Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/redacoes')}>Digitar o texto</Button>
            </div>
          </Card>
        ) : null}

        {step === 'review' && scan ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white">
              <h2 className="font-semibold">Sua folha</h2>
              <div className="mt-3 max-h-[75vh] space-y-3 overflow-auto">
                {imageUrls.length ? imageUrls.map((url, i) => <img key={url} src={url} alt={`Página ${i + 1} da redação`} className="w-full rounded-lg border border-surface-line" />) : <p className="text-sm text-graphite-400">{scan.pages.length ? 'Carregando a foto…' : 'As fotos foram apagadas do servidor.'}</p>}
              </div>
              {scan.pages.length ? <Button variant="ghost" size="sm" className="mt-3" onClick={() => void deleteImages()}><Trash2 size={14} />Apagar fotos do servidor</Button> : null}
            </Card>
            <Card className="bg-white">
              <h2 className="font-semibold">Texto lido — confira e corrija</h2>
              <p className="mt-1 text-sm text-graphite-500">
                {scan.lineCount ?? 0} linhas lidas · confiança da leitura {Math.round((scan.confidence ?? 0) * 100)}%.
                Corrija só o que a leitura errou: se você escreveu com erro, mantenha — a Competência I avalia exatamente isso.
              </p>
              {scan.warnings.length ? <ul className="mt-2 space-y-1 text-sm text-amber-800">{scan.warnings.map((w) => <li key={w} className="rounded-lg bg-amber-50 p-2">{w}</li>)}</ul> : null}
              <label className="mt-4 block text-sm font-semibold" htmlFor="review-theme">Tema da proposta</label>
              <input id="review-theme" list="scan-themes" value={theme} onChange={(e) => setTheme(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-surface-line px-3" aria-invalid={!themeValid} />
              <datalist id="scan-themes">{themes.map((t) => <option key={t.id} value={t.title} />)}</datalist>
              <label className="mt-3 block text-sm font-semibold" htmlFor="review-title">Título (opcional)</label>
              <input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1 h-11 w-full rounded-xl border border-surface-line px-3" />
              <label className="mt-3 block text-sm font-semibold" htmlFor="review-text">Redação</label>
              <textarea id="review-text" ref={textRef} value={text} onChange={(e) => setText(e.target.value)} rows={18} className="mt-1 w-full rounded-xl border border-surface-line p-3 font-serif leading-relaxed" />
              {illegible ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-700">
                  {illegible} trecho(s) marcados como [ilegível] — substitua pelo que você escreveu.
                  <Button variant="outline" size="sm" onClick={jumpToIllegible}>Ir para o próximo</Button>
                </p>
              ) : null}
              <Button className="mt-4 w-full" onClick={() => void confirm()} disabled={!themeValid || illegible > 0 || !text.trim() || Boolean(working)}>
                <Check size={18} />Confirmar texto e corrigir
              </Button>
              {!themeValid ? <p className="mt-2 text-xs text-graphite-400">Informe o tema para liberar a correção.</p> : null}
            </Card>
          </div>
        ) : null}

        {step === 'done' && essayId ? (
          <div className="space-y-4">
            {correctionError ? <p role="status" className="text-sm text-amber-700">{correctionError}</p> : null}
            {quotaNotice ? (
              <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                {quotaNotice} Sua redação foi salva em <Link to={`/app/redacoes/${essayId}`} className="font-semibold underline">Minhas redações</Link>.
              </p>
            ) : correction ? (
              <EssayCorrectionView correction={correction} onRetry={() => void requestCorrection()} retrying={correctionBusy} />
            ) : (
              <p role="status">Carregando a correção…</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate(`/app/redacoes/${essayId}`)}>Abrir no editor</Button>
              <Button variant="ghost" onClick={() => navigate('/app/redacoes/scanner')}><Camera size={16} />Corrigir outra redação</Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
