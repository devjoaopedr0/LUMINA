import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiQuestionScanPresignedUpload,
  apiQuestionScanCompleteUpload,
  apiListQuestionScanUploads,
  apiSaveQuestionScanAsQuestion,
  apiSaveQuestionScanToErrorNotebook,
  type QuestionScanUploadResponseDto,
  type QuestionScanProcessingResponseDto,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

export function QuestionScanner() {
  const { user: _user } = useAuth();
  const [uploads, setUploads] = useState<QuestionScanUploadResponseDto[]>([]);
  const [processing, setProcessing] = useState<QuestionScanProcessingResponseDto | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const loadUploads = async () => {
    try {
      const list = await apiListQuestionScanUploads(token());
      setUploads(list);
    } catch { setError('Não foi possível carregar o histórico.'); }
  };

  useEffect(() => { loadUploads(); }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setError('Formato não suportado. Use JPEG, PNG ou PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande (máx. 10 MB).');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    setSuccess('');
  }

  async function startUpload() {
    if (!selectedFile) { setError('Selecione uma imagem primeiro.'); return; }
    setUploading(true); setError(''); setSuccess(''); setUploadProgress(0);
    try {
      const { key } = await apiQuestionScanPresignedUpload(token(), {
        contentType: selectedFile.type,
      });

      setUploadProgress(50);
      
      const fileUrl = previewUrl ?? `data:${selectedFile.type};base64,${await fileToBase64(selectedFile)}`;
      const meta = { width: 1920, height: 1080, sizeBytes: selectedFile.size, mimeType: selectedFile.type };

      const result = await apiQuestionScanCompleteUpload(token(), key, { fileUrl, ...meta });
      setUploadProgress(100);
      setSuccess('Upload enviado! Processando...');
      setSelectedFile(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = '';
      
      pollProcessing(result.id);
      loadUploads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally { setUploading(false); }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function pollProcessing(uploadId: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const list = await apiListQuestionScanUploads(token());
        const up = list.find(u => u.id === uploadId);
        if (up?.processing) {
          setProcessing(up.processing);
          if (up.processing.status === 'COMPLETED' || up.processing.status === 'FAILED') {
            loadUploads();
            break;
          }
        }
      } catch {}
    }
  }

  async function handleSaveAsQuestion() {
    if (!processing) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const dto = {
        finalStem: processing.stemText ?? '',
        finalAlternatives: (processing.alternativesJson ?? []).map((a: any) => ({
          position: a.position,
          text: a.text,
          isCorrect: a.position === 2,
        })),
        finalSubject: processing.subject ?? 'Matemática',
        finalTopic: processing.topic ?? 'Funções exponenciais',
        finalDifficulty: processing.difficulty ?? 'MEDIA',
        exam: 'SCANNER',
        finalExplanation: processing.explanationJson ?? {},
      };
      await apiSaveQuestionScanAsQuestion(token(), processing.id, dto);
      setSuccess('Questão oficial criada com sucesso!');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setBusy(false); }
  }

  async function handleSaveToNotebook() {
    if (!processing) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const dto = {
        finalStem: processing.stemText ?? '',
        finalAlternatives: (processing.alternativesJson ?? []).map((a: any) => ({
          position: a.position,
          text: a.text,
          isCorrect: a.position === 2,
        })),
        finalSubject: processing.subject ?? 'Matemática',
        finalTopic: processing.topic ?? 'Funções exponenciais',
        finalDifficulty: processing.difficulty ?? 'MEDIA',
        finalExplanation: processing.explanationJson ?? {},
        reason: 'FALTA_CONTEUDO',
        notes: 'Adicionado via scanner de questões.',
      };
      await apiSaveQuestionScanToErrorNotebook(token(), processing.id, dto);
      setSuccess('Adicionado ao caderno de erros!');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setBusy(false); }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-success-100 text-success-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      case 'PROCESSING': return 'bg-primary-100 text-primary-700';
      case 'PENDING': return 'bg-graphite-100 text-graphite-700';
      default: return 'bg-graphite-100 text-graphite-700';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Concluído';
      case 'FAILED': return 'Falhou';
      case 'PROCESSING': return 'Processando';
      case 'PENDING': return 'Pendente';
      default: return status;
    }
  };

  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="print:hidden"><Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link></div>
      <h1 className="mt-6 text-3xl font-bold">Scanner de Questões</h1>
      <p className="mt-2 text-sm text-graphite-500">Fotografe uma questão impressa → OCR + classificação → Explicação LuminIA → Questão oficial ou Caderno de erros.</p>
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {success && <p role="status" className="my-4 rounded-lg bg-success-50 p-3 text-success-700">{success}</p>}

      <div className="mt-6 border-b border-surface-line">
        <nav className="flex gap-4" role="tablist">
          <button role="tab" aria-selected={activeTab === 'scan'} onClick={() => setActiveTab('scan')} className={`pb-3 border-b-2 font-medium ${activeTab === 'scan' ? 'border-primary-500 text-primary-700' : 'border-transparent text-graphite-400'}`}>Escanear</button>
          <button role="tab" aria-selected={activeTab === 'history'} onClick={() => setActiveTab('history')} className={`pb-3 border-b-2 font-medium ${activeTab === 'history' ? 'border-primary-500 text-primary-700' : 'border-transparent text-graphite-400'}`}>Histórico</button>
        </nav>
      </div>

      {activeTab === 'scan' && (
        <>
          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Nova digitalização</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,application/pdf" onChange={handleFileSelect} className="hidden" id="file-input" />
                <label htmlFor="file-input" className={`cursor-pointer flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 ${previewUrl ? 'border-primary-300 bg-primary-50' : 'border-graphite-200'}`}>
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Pré-visualização" className="max-h-64 rounded-lg border" />
                      <p className="text-sm text-graphite-500">Clique para trocar</p>
                    </>
                  ) : (
                    <>
                      <svg className="h-12 w-12 text-graphite-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="font-medium">Arraste ou clique para selecionar</p>
                      <p className="text-sm text-graphite-400">JPEG, PNG ou PDF · máx. 10 MB</p>
                    </>
                  )}
                </label>
              </div>
              <div className="sm:col-span-2 flex gap-3">
                <button onClick={startUpload} disabled={uploading || busy || !selectedFile} className="flex-1 rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {uploading ? `Enviando... ${uploadProgress}%` : 'Enviar e processar'}
                </button>
                <button onClick={() => { setSelectedFile(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="rounded-lg border px-5 py-3 font-semibold text-graphite">Cancelar</button>
              </div>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-3 h-2 bg-graphite-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}
            </div>
          </section>

          {processing && (
            <section className="mt-6 rounded-xl border bg-white p-5" role="status" aria-live="polite">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Resultado do processamento</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(processing.status)}`}>{statusLabel(processing.status)}</span>
              </div>

              {processing.status === 'PROCESSING' && (
                <div className="flex items-center gap-3 text-graphite-500">
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span>Processando... Aguarde a conclusão.</span>
                </div>
              )}

              {processing.status === 'FAILED' && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700">
                  <p className="font-semibold">Processamento falhou</p>
                  <p className="text-sm mt-1">{processing.errorMessage ?? 'Erro desconhecido'}</p>
                </div>
              )}

              {(processing.status === 'COMPLETED' || processing.status === 'NEEDS_REVIEW') && (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <div className="p-3 rounded-lg bg-surface-card">
                      <p className="text-xs text-graphite-400">Disciplina</p>
                      <p className="font-medium">{processing.subject ?? '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-card">
                      <p className="text-xs text-graphite-400">Assunto</p>
                      <p className="font-medium">{processing.topic ?? '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-card">
                      <p className="text-xs text-graphite-400">Dificuldade</p>
                      <p className="font-medium">{processing.difficulty ?? '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-card">
                      <p className="text-xs text-graphite-400">Confiança</p>
                      <p className="font-medium">{processing.confidence ? `${Math.round((processing.confidence as number) * 100)}%` : '—'}</p>
                    </div>
                  </div>

                  {processing.warningsJson && (processing.warningsJson as any[]).length > 0 && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-50">
                      <p className="font-semibold text-amber-700">Atenção</p>
                      <ul className="mt-1 space-y-1 text-sm text-amber-800">
                        {(processing.warningsJson as any[]).map((w: string, i: number) => <li key={i} className="flex gap-2">⚠ {w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Enunciado detectado</h3>
                    <p className="p-3 rounded-lg bg-surface-card">{processing.stemText ?? '—'}</p>
                  </div>

                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Alternativas detectadas</h3>
                    <div className="space-y-2">
                      {(processing.alternativesJson as any[])?.map((a: any) => (
                        <div key={a.position} className="flex items-center gap-3 p-3 rounded-lg bg-surface-card">
                          <span className="w-8 font-mono text-graphite-500">{a.position}</span>
                          <span className="flex-1">{a.text}</span>
                          <span className="px-2 py-0.5 rounded text-xs bg-primary-100 text-primary-700">{a.position === 2 ? 'Correta (simulada)' : 'Detectada'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {processing.explanationJson && (
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">Explicação LuminIA (por alternativa)</h3>
                      <div className="space-y-2">
                        {Object.entries(processing.explanationJson as Record<number, string>).map(([pos, exp]) => (
                          <div key={pos} className="p-3 rounded-lg bg-surface-card">
                            <p className="font-medium">{String.fromCharCode(64 + Number(pos))})</p>
                            <p className="text-sm text-graphite-600">{exp}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button onClick={handleSaveAsQuestion} disabled={busy} className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50">Criar questão oficial</button>
                    <button onClick={handleSaveToNotebook} disabled={busy} className="rounded-lg border px-5 py-3 font-semibold text-graphite disabled:opacity-50">Adicionar ao caderno de erros</button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <section className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="font-bold">Histórico de digitalizações</h2>
          {uploads.length ? (
            <div className="mt-4 space-y-3">
              {uploads.map(u => (
                <Link key={u.id} to={`/app/question-scanner?processing=${u.processing?.id}`} className="block border-b pb-3 hover:underline last:border-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{u.processing?.stemText ? u.processing.stemText.slice(0, 60) + '…' : 'Digitalização sem texto'}</p>
                      <p className="text-sm text-graphite-400">{new Date(u.createdAt).toLocaleString('pt-BR')} · {u.metaJson ? `${(u.metaJson as any).width}×${(u.metaJson as any).height}` : '—'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(u.processing?.status ?? u.status)}`}>
                      {statusLabel(u.processing?.status ?? u.status)}
                    </span>
                  </div>
                  {u.processing && u.processing.status === 'COMPLETED' && (
                    <p className="mt-1 text-sm text-graphite-500">{u.processing.subject ?? '—'} · {u.processing.topic ?? '—'} · Confiança: {u.processing.confidence ? `${Math.round((u.processing.confidence as number) * 100)}%` : '—'}</p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-graphite-400">Nenhuma digitalização ainda.</p>
          )}
        </section>
      )}
    </div>
  </main>;
}