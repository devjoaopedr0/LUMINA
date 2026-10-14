import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiGetQuestionScanProcessing,
  apiListQuestionScanUploads,
  apiQuestionScanCompleteUpload,
  apiQuestionScanPresignedUpload,
  apiSaveQuestionScanAsQuestion,
  apiSaveQuestionScanToErrorNotebook,
  type QuestionScanProcessingResponseDto,
  type QuestionScanUploadResponseDto,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-graphite-100 text-graphite-700',
  PROCESSING: 'bg-primary-100 text-primary-700',
  COMPLETED: 'bg-success-100 text-success-700',
  FAILED: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

const statusStyle = (status: string) => STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

const DIFFICULTIES = ['FACIL', 'MEDIA', 'DIFÍCIL'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

type Alternative = { position: number; text: string; isCorrect: boolean };

type Tab = 'scan' | 'history';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function QuestionScanner() {
  const [tab, setTab] = useState<Tab>('scan');
  const [uploads, setUploads] = useState<QuestionScanUploadResponseDto[]>([]);
  const [processing, setProcessing] = useState<QuestionScanProcessingResponseDto | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [stem, setStem] = useState('');
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIA');

  useEffect(() => {
    apiListQuestionScanUploads(token())
      .then((rows) => { setUploads(rows); setError(''); })
      .catch(() => setError('Não foi possível carregar o histórico.'));
  }, []);

  function resetForm() {
    setProcessing(null);
    setStem('');
    setAlternatives([]);
    setSubject('');
    setTopic('');
    setDifficulty('MEDIA');
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(selected.type)) {
      setError('Formato não suportado. Use JPEG, PNG ou PDF.');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande (máximo 10 MB).');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setError('');
    setSuccess('');
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
    const input = document.getElementById('question-scan-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function startUpload() {
    if (!file) { setError('Selecione a foto da questão.'); return; }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const { uploadId, key } = await apiQuestionScanPresignedUpload(token(), { contentType: file.type });
      await apiQuestionScanCompleteUpload(token(), key, {
        fileUrl: previewUrl ?? (await readAsDataUrl(file)),
        width: 1920,
        height: 1080,
        sizeBytes: file.size,
      });
      setSuccess('Foto enviada. O processamento começou.');
      clearFile();
      resetForm();
      // O processamento é assíncrono: a primeira leitura pode ainda estar em PROCESSING.
      setProcessing(await apiGetQuestionScanProcessing(token(), uploadId));
      setUploads(await apiListQuestionScanUploads(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  }

  /** Carrega um processamento do histórico no formulário de conferência. */
  async function openProcessing(id: string) {
    setError('');
    setSuccess('');
    try {
      const result = await apiGetQuestionScanProcessing(token(), id);
      setProcessing(result);
      setStem(result.stemText ?? '');
      setAlternatives(
        (result.alternativesJson ?? []).map((alt) => ({ ...alt, isCorrect: false })),
      );
      setSubject(result.subject ?? '');
      setTopic(result.topic ?? '');
      setDifficulty((result.difficulty as Difficulty) ?? 'MEDIA');
      setTab('scan');
    } catch {
      setError('Não foi possível abrir este processamento.');
    }
  }

  function markCorrect(position: number) {
    setAlternatives((rows) => rows.map((row) => ({ ...row, isCorrect: row.position === position })));
  }

  function updateAlternative(position: number, text: string) {
    setAlternatives((rows) => rows.map((row) => (row.position === position ? { ...row, text } : row)));
  }

  function buildPayload() {
    return {
      finalStem: stem.trim(),
      finalAlternatives: alternatives,
      finalSubject: subject.trim() || 'Geral',
      finalTopic: topic.trim() || 'Geral',
      finalDifficulty: difficulty,
      finalExplanation: processing?.explanationJson ?? undefined,
    };
  }

  function validatePayload(): string {
    if (stem.trim().length < 10) return 'Confira o enunciado reconhecido.';
    if (alternatives.length < 2) return 'A questão precisa de pelo menos duas alternativas.';
    if (alternatives.some((alt) => !alt.text.trim())) return 'Todas as alternativas precisam de texto.';
    if (alternatives.filter((alt) => alt.isCorrect).length !== 1) return 'Marque exatamente uma alternativa como correta.';
    return '';
  }

  async function handleSaveAsQuestion() {
    const problem = validatePayload();
    if (problem) { setError(problem); return; }
    if (!processing) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiSaveQuestionScanAsQuestion(token(), processing.id, { ...buildPayload(), exam: 'SCANNER' });
      setSuccess('Questão salva no banco de questões.');
      setUploads(await apiListQuestionScanUploads(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a questão.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToNotebook() {
    const problem = validatePayload();
    if (problem) { setError(problem); return; }
    if (!processing) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiSaveQuestionScanToErrorNotebook(token(), processing.id, {
        ...buildPayload(),
        reason: 'FALTA_CONTEUDO',
        notes: 'Adicionado pelo scanner de questões.',
      });
      setSuccess('Questão adicionada ao caderno de erros.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao adicionar ao caderno de erros.');
    } finally {
      setBusy(false);
    }
  }

  const warnings = processing?.warningsJson ?? [];

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Scanner de Questões</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Fotografe uma questão impressa: o enunciado e as alternativas são reconhecidos, você
          confere o resultado e escolhe onde guardar — banco de questões ou caderno de erros.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {success && <p role="status" className="my-4 rounded-lg bg-success-50 p-3 text-success-700">{success}</p>}

        <div className="mt-6 border-b border-surface-line">
          <nav className="flex gap-4" role="tablist">
            {(['scan', 'history'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`border-b-2 pb-3 font-medium ${tab === item ? 'border-primary-500 text-primary-700' : 'border-transparent text-graphite-400'}`}
              >
                {item === 'scan' ? 'Escanear' : 'Histórico'}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'scan' && (
          <>
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Enviar a foto da questão</h2>
              <div className="mt-4">
                <input
                  id="question-scan-file"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="question-scan-file"
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 ${previewUrl ? 'border-primary-300 bg-primary-50' : 'border-graphite-200'}`}
                >
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Pré-visualização da questão" className="max-h-64 rounded-lg border" />
                      <p className="text-sm text-graphite-500">Clique para trocar a foto</p>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Clique para selecionar a foto da questão</span>
                      <p className="text-sm text-graphite-400">JPEG, PNG ou PDF · máximo 10 MB</p>
                    </>
                  )}
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startUpload}
                  disabled={uploading || !file}
                  className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {uploading ? 'Enviando...' : 'Enviar e processar'}
                </button>
                <button type="button" onClick={clearFile} className="rounded-lg border px-5 py-3 font-semibold text-graphite">
                  Limpar seleção
                </button>
              </div>
            </section>

            {processing && (
              <section className="mt-6 rounded-xl border bg-white p-5" role="status" aria-live="polite">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Resultado do reconhecimento</h2>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle(processing.status)}`}>
                    {statusLabel(processing.status)}
                  </span>
                </div>

                {processing.status === 'PROCESSING' && (
                  <p className="text-graphite-500">
                    O reconhecimento ainda está rodando. Abra o item no histórico em alguns segundos
                    para conferir o resultado.
                  </p>
                )}

                {processing.status === 'FAILED' && (
                  <div className="rounded-lg bg-red-50 p-3 text-red-700">
                    <p className="font-semibold">Não foi possível ler a questão</p>
                    <p className="mt-1 text-sm">{processing.errorMessage ?? 'Erro não informado.'}</p>
                  </div>
                )}

                {processing.status === 'COMPLETED' && (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Disciplina</p>
                        <p className="font-medium">{processing.subject ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Assunto</p>
                        <p className="font-medium">{processing.topic ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Dificuldade</p>
                        <p className="font-medium">{processing.difficulty ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Confiança</p>
                        <p className="font-medium">
                          {typeof processing.confidence === 'number'
                            ? `${Math.round(processing.confidence * 100)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {warnings.length > 0 && (
                      <div className="mb-4 rounded-lg bg-amber-50 p-3">
                        <p className="font-semibold text-amber-700">Confira os pontos abaixo antes de salvar</p>
                        <ul className="mt-1 space-y-1 text-sm text-amber-800">
                          {warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                        </ul>
                      </div>
                    )}

                    <label className="block">
                      <span className="text-sm font-medium">Enunciado</span>
                      <textarea
                        value={stem}
                        onChange={(event) => setStem(event.target.value)}
                        className="mt-1 min-h-[110px] w-full rounded-lg border p-3"
                      />
                    </label>

                    <fieldset className="mt-4">
                      <legend className="text-sm font-medium">
                        Alternativas — marque a correta
                      </legend>
                      {alternatives.length === 0 ? (
                        <p className="mt-2 text-sm text-graphite-400">
                          Nenhuma alternativa foi reconhecida. Abra esta digitalização novamente pelo
                          histórico depois que o processamento concluir.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {alternatives.map((alternative) => (
                            <li key={alternative.position} className="flex items-center gap-3">
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="correct-alternative"
                                  checked={alternative.isCorrect}
                                  onChange={() => markCorrect(alternative.position)}
                                  aria-label={`Alternativa ${String.fromCharCode(64 + alternative.position)} como correta`}
                                />
                                <span className="font-mono text-graphite-500">
                                  {String.fromCharCode(64 + alternative.position)}
                                </span>
                              </label>
                              <input
                                value={alternative.text}
                                onChange={(event) => updateAlternative(alternative.position, event.target.value)}
                                aria-label={`Texto da alternativa ${String.fromCharCode(64 + alternative.position)}`}
                                className="flex-1 rounded-lg border p-2 text-sm"
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </fieldset>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-sm font-medium">Disciplina</span>
                        <input
                          value={subject}
                          onChange={(event) => setSubject(event.target.value)}
                          className="mt-1 w-full rounded-lg border p-2"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium">Assunto</span>
                        <input
                          value={topic}
                          onChange={(event) => setTopic(event.target.value)}
                          className="mt-1 w-full rounded-lg border p-2"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium">Dificuldade</span>
                        <select
                          value={difficulty}
                          onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                          className="mt-1 w-full rounded-lg border p-2"
                        >
                          {DIFFICULTIES.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {processing.explanationJson && Object.keys(processing.explanationJson as object).length > 0 && (
                      <details className="mt-4">
                        <summary className="cursor-pointer font-medium text-primary-700">
                          Explicação sugerida por alternativa
                        </summary>
                        <ul className="mt-2 space-y-1 text-sm text-graphite-600">
                          {Object.entries(processing.explanationJson ?? {}).map(([position, text]) => (
                            <li key={position}>
                              <span className="font-mono">{String.fromCharCode(64 + Number(position))})</span> {text}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleSaveAsQuestion}
                        disabled={busy}
                        className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
                      >
                        Salvar no banco de questões
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveToNotebook}
                        disabled={busy}
                        className="rounded-lg border px-5 py-3 font-semibold text-graphite disabled:opacity-50"
                      >
                        Adicionar ao caderno de erros
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}

        {tab === 'history' && (
          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Histórico de digitalizações</h2>
            {uploads.length === 0 ? (
              <p className="mt-3 text-sm text-graphite-400">Nenhuma digitalização ainda.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {uploads.map((upload) => {
                  const status = upload.processing?.status ?? upload.status;
                  return (
                    <li key={upload.id} className="border-b pb-3 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {upload.processing?.stemText
                              ? `${upload.processing.stemText.slice(0, 70)}${upload.processing.stemText.length > 70 ? '...' : ''}`
                              : 'Digitalização sem enunciado reconhecido'}
                          </p>
                          <p className="text-sm text-graphite-400">
                            {new Date(upload.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle(status)}`}>
                            {statusLabel(status)}
                          </span>
                          {upload.processing && (
                            <button
                              type="button"
                              onClick={() => openProcessing(upload.processing!.id)}
                              className="text-sm text-primary-700 hover:underline"
                            >
                              Abrir
                            </button>
                          )}
                        </div>
                      </div>
                      {upload.processing?.status === 'COMPLETED' && (
                        <p className="mt-1 text-sm text-graphite-500">
                          {upload.processing.subject ?? '—'} · {upload.processing.topic ?? '—'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
