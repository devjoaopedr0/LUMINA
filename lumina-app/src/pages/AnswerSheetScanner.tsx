import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiAnswerSheetReview,
  apiAnswerSheetUploadUrl,
  apiAnswerSheetCompleteUpload,
  apiCreateAnswerSheetTemplate,
  apiListAnswerSheetTemplates,
  apiListAnswerSheetUploads,
  apiSimulations,
  type AnswerSheetTemplateResponseDto,
  type AnswerSheetUploadResponseDto,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-graphite-100 text-graphite-700',
  PROCESSING: 'bg-primary-100 text-primary-700',
  COMPLETED: 'bg-success-100 text-success-700',
  FAILED: 'bg-red-100 text-red-700',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  NEEDS_REVIEW: 'Revisar',
};

const statusStyle = (status: string) => STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

type Marker = { name: string; x: number; y: number };
type Tab = 'scan' | 'templates' | 'history';

const MARKER_PRESETS = [
  { name: 'topLeft', label: 'Superior esquerdo' },
  { name: 'topRight', label: 'Superior direito' },
  { name: 'bottomLeft', label: 'Inferior esquerdo' },
  { name: 'bottomRight', label: 'Inferior direito' },
];

export function AnswerSheetScanner() {
  const [tab, setTab] = useState<Tab>('scan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [templates, setTemplates] = useState<AnswerSheetTemplateResponseDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [simulations, setSimulations] = useState<{ id: string; title: string }[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [upload, setUpload] = useState<AnswerSheetUploadResponseDto | null>(null);
  const [reviewAnswers, setReviewAnswers] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<AnswerSheetUploadResponseDto[]>([]);

  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [markers, setMarkers] = useState<Marker[]>(
    MARKER_PRESETS.map((preset, index) => ({
      name: preset.name,
      x: index % 2 === 0 ? 0.1 : 0.9,
      y: index < 2 ? 0.1 : 0.9,
    })),
  );

  useEffect(() => {
    void loadTemplates();
    void loadSimulations();
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab]);

  async function loadTemplates() {
    try {
      setTemplates(await apiListAnswerSheetTemplates(token()));
    } catch {
      setError('Não foi possível carregar os templates.');
    }
  }

  async function loadSimulations() {
    try {
      // A lista de simulados é opcional no scanner: se falhar, o cartão segue
      // sendo lido sem vínculo. Não pode, porém, jogar o 404 no console.
      setSimulations((await apiSimulations(token())).map(({ id, title }) => ({ id, title })));
    } catch {
      /* sem vínculo de simulado o scanner continua utilizável */
    }
  }

  async function loadHistory() {
    try {
      setHistory(await apiListAnswerSheetUploads(token()));
    } catch {
      setError('Não foi possível carregar o histórico.');
    }
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
    const input = document.getElementById('answer-sheet-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function startUpload() {
    if (!file) { setError('Selecione um arquivo.'); return; }
    if (!selectedTemplateId) { setError('Selecione o template do cartão-resposta.'); return; }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const { uploadId, key } = await apiAnswerSheetUploadUrl(token(), {
        templateId: selectedTemplateId,
        ...(selectedSimulationId ? { simulationId: selectedSimulationId } : {}),
        contentType: file.type,
      });

      await apiAnswerSheetCompleteUpload(token(), key, {
        fileUrl: previewUrl ?? (await readAsDataUrl(file)),
        width: 1920,
        height: 1080,
        sizeBytes: file.size,
      });

      setSuccess('Upload enviado. O processamento começou.');
      clearFile();
      setUpload(await loadUpload(uploadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  }

  /** Busca o upload pelo id: a listagem já vem com o processamento aninhado,
   * e é ela que traz `status: NEEDS_REVIEW` quando alguma bolha ficou com
   * confiança baixa. */
  async function loadUpload(uploadId: string): Promise<AnswerSheetUploadResponseDto | null> {
    const found = (await apiListAnswerSheetUploads(token())).find((item) => item.id === uploadId);
    return found ?? null;
  }

  function readAsDataUrl(selected: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsDataURL(selected);
    });
  }

  async function handleReview() {
    if (!processing) return;
    const finalAnswers: Record<number, number> = {};
    for (const [question, answer] of Object.entries(reviewAnswers)) {
      if (answer) finalAnswers[Number(question)] = Number(answer);
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiAnswerSheetReview(token(), processing.id, { finalAnswers });
      setSuccess('Revisão salva e submissão registrada no simulado.');
      setUpload(null);
      setReviewAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a revisão.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTemplate() {
    if (!templateName.trim()) { setError('Informe o nome do template.'); return; }
    if (markers.some((marker) => !Number.isFinite(marker.x) || !Number.isFinite(marker.y))) {
      setError('Coordenadas de marcador inválidas.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiCreateAnswerSheetTemplate(token(), {
        name: templateName.trim(),
        description: templateDesc.trim() || null,
        markers,
        layout: [],
      });
      setSuccess('Template criado.');
      setTemplateName('');
      setTemplateDesc('');
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar o template.');
    } finally {
      setBusy(false);
    }
  }

  const processing = upload?.processing ?? null;
  // `NEEDS_REVIEW` é o status do upload: o processing em si só vai a
  // PROCESSING/COMPLETED/FAILED, e o upload é quem pede a conferência.
  const needsReview = upload?.status === 'NEEDS_REVIEW';
  const detected = (processing?.detectedAnswers ?? {}) as Record<string, number>;
  const confidence = (processing?.confidenceJson ?? {}) as Record<string, number>;
  const warnings = processing?.warningsJson ?? [];

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Scanner de Gabarito</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Envie a foto do cartão-resposta: o sistema detecta as marcações, sinaliza as respostas de
          baixa confiança para você revisar e registra a entrega no simulado.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {success && <p role="status" className="my-4 rounded-lg bg-success-50 p-3 text-success-700">{success}</p>}

        <div className="mt-6 border-b border-surface-line">
          <nav className="flex gap-4" role="tablist">
            {(['scan', 'templates', 'history'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`border-b-2 pb-3 font-medium ${tab === item ? 'border-primary-500 text-primary-700' : 'border-transparent text-graphite-400'}`}
              >
                {item === 'scan' ? 'Escanear' : item === 'templates' ? 'Templates' : 'Histórico'}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'scan' && (
          <>
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Template do cartão-resposta</h2>
              <p className="mt-1 text-sm text-graphite-400">
                Escolha o template compatível com o cartão que você fotografou.
              </p>
              {templates.length === 0 ? (
                <p className="mt-4 text-sm text-graphite-400">
                  Nenhum template cadastrado. Crie um na aba <strong>Templates</strong>.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className={`cursor-pointer rounded-lg border-2 p-3 ${selectedTemplateId === template.id ? 'border-primary-500 bg-primary-50' : 'border-graphite-200 hover:border-primary-300'}`}
                    >
                      <input
                        type="radio"
                        name="answer-sheet-template"
                        className="sr-only"
                        checked={selectedTemplateId === template.id}
                        onChange={() => setSelectedTemplateId(template.id)}
                      />
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-graphite-400">{template.description ?? 'Sem descrição'}</p>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {templates.length > 0 && (
              <section className="mt-6 rounded-xl border bg-white p-5">
                <h2 className="font-bold">Simulado vinculado (opcional)</h2>
                <p className="mt-1 text-sm text-graphite-400">
                  Com um simulado selecionado, a entrega é criada automaticamente ao concluir a leitura.
                </p>
                <select
                  aria-label="Simulado vinculado"
                  value={selectedSimulationId}
                  onChange={(event) => setSelectedSimulationId(event.target.value)}
                  className="mt-3 w-full max-w-md rounded-lg border p-2"
                >
                  <option value="">Nenhum (apenas leitura do cartão)</option>
                  {simulations.map((simulation) => (
                    <option key={simulation.id} value={simulation.id}>{simulation.title}</option>
                  ))}
                </select>
              </section>
            )}

            {templates.length > 0 && (
              <section className="mt-6 rounded-xl border bg-white p-5">
                <h2 className="font-bold">Enviar o cartão-resposta</h2>
                <div className="mt-4 sm:col-span-2">
                  <input
                    id="answer-sheet-file"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="answer-sheet-file"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 ${previewUrl ? 'border-primary-300 bg-primary-50' : 'border-graphite-200'}`}
                  >
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Pré-visualização do cartão" className="max-h-64 rounded-lg border" />
                        <p className="text-sm text-graphite-500">Clique para trocar o arquivo</p>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Clique para selecionar a foto do cartão</span>
                        <p className="text-sm text-graphite-400">JPEG, PNG ou PDF · máximo 10 MB</p>
                      </>
                    )}
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={startUpload}
                    disabled={uploading || !file || !selectedTemplateId}
                    className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {uploading ? 'Enviando...' : 'Enviar e processar'}
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-lg border px-5 py-3 font-semibold text-graphite"
                  >
                    Limpar seleção
                  </button>
                </div>
              </section>
            )}

            {upload && (
              <section className="mt-6 rounded-xl border bg-white p-5" role="status" aria-live="polite">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Resultado da leitura</h2>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle(upload.status)}`}>
                    {statusLabel(upload.status)}
                  </span>
                </div>

                {processing?.status === 'PROCESSING' && (
                  <p className="text-graphite-500">Processando as marcações. Atualize a página em alguns segundos para ver o resultado.</p>
                )}

                {processing?.status === 'FAILED' && (
                  <div className="rounded-lg bg-red-50 p-3 text-red-700">
                    <p className="font-semibold">Não foi possível ler o cartão</p>
                    <p className="mt-1 text-sm">{processing.errorMessage ?? 'Erro não informado.'}</p>
                  </div>
                )}

                {processing?.status === 'COMPLETED' && (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Questões no gabarito</p>
                        <p className="font-medium">{processing.totalQuestions}</p>
                      </div>
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Respondidas</p>
                        <p className="font-medium">{processing.answeredCount}</p>
                      </div>
                      <div className="rounded-lg bg-surface-card p-3">
                        <p className="text-xs text-graphite-400">Baixa confiança</p>
                        <p className="font-medium">{processing.lowConfidenceCount}</p>
                      </div>
                    </div>

                    {warnings.length > 0 && (
                      <div className="mb-4 rounded-lg bg-amber-50 p-3">
                        <p className="font-semibold text-amber-700">Pontos que precisam de atenção</p>
                        <ul className="mt-1 space-y-1 text-sm text-amber-800">
                          {warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="mb-2 font-semibold">Respostas detectadas</h3>
                      {Object.keys(detected).length === 0 ? (
                        <p className="text-sm text-graphite-400">Nenhuma marcação foi reconhecida.</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(detected).map(([question, answer]) => {
                            const score = confidence[question];
                            return (
                              <div key={question} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-card p-3">
                                <span className="w-10 font-mono text-graphite-500">Q{question}</span>
                                <span className="font-medium">
                                  Alternativa {String.fromCharCode(64 + answer)}
                                </span>
                                {typeof score === 'number' && (
                                  <span className="rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                                    Confiança {Math.round(score * 100)}%
                                  </span>
                                )}
                                {needsReview && (
                                  <select
                                    aria-label={`Alternativa da questão ${question}`}
                                    value={reviewAnswers[Number(question)] ?? String(answer)}
                                    onChange={(event) =>
                                      setReviewAnswers({ ...reviewAnswers, [Number(question)]: event.target.value })
                                    }
                                    className="ml-auto w-24 rounded-lg border p-1 text-sm"
                                  >
                                    {[1, 2, 3, 4, 5].map((position) => (
                                      <option key={position} value={position}>
                                        {String.fromCharCode(64 + position)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {needsReview && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleReview}
                          disabled={busy}
                          className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
                        >
                          Salvar revisão e submeter
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUpload(null); setReviewAnswers({}); }}
                          className="rounded-lg border px-5 py-3 font-semibold text-graphite"
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}

        {tab === 'templates' && (
          <>
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Novo template</h2>
              <p className="mt-1 text-sm text-graphite-400">
                Informe os quatro marcadores de canto em coordenadas normalizadas (0 a 1).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  aria-label="Nome do template"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Nome do template"
                  className="rounded-lg border p-2"
                />
                <input
                  aria-label="Descrição do template"
                  value={templateDesc}
                  onChange={(event) => setTemplateDesc(event.target.value)}
                  placeholder="Descrição (opcional)"
                  className="rounded-lg border p-2"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {markers.map((marker, index) => {
                  const preset = MARKER_PRESETS[index];
                  return (
                    <fieldset key={marker.name} className="rounded-lg bg-surface-card p-3">
                      <legend className="px-1 text-xs font-medium text-graphite-500">{preset.label}</legend>
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <span>X</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={1}
                          value={marker.x}
                          onChange={(event) => {
                            const next = [...markers];
                            next[index] = { ...marker, x: Number(event.target.value) };
                            setMarkers(next);
                          }}
                          className="w-full rounded-lg border p-1"
                        />
                      </label>
                      <label className="mt-1 flex items-center gap-2 text-xs">
                        <span>Y</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={1}
                          value={marker.y}
                          onChange={(event) => {
                            const next = [...markers];
                            next[index] = { ...marker, y: Number(event.target.value) };
                            setMarkers(next);
                          }}
                          className="w-full rounded-lg border p-1"
                        />
                      </label>
                    </fieldset>
                  );
                })}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={busy || !templateName.trim()}
                  className="rounded-lg bg-graphite px-5 py-2 text-white disabled:opacity-50"
                >
                  {busy ? 'Salvando...' : 'Criar template'}
                </button>
              </div>
            </section>

            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Templates cadastrados</h2>
              {templates.length === 0 ? (
                <p className="mt-3 text-sm text-graphite-400">Nenhum template ainda.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {templates.map((template) => (
                    <li key={template.id} className="border-b pb-3 last:border-0">
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-graphite-400">{template.description ?? 'Sem descrição'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {tab === 'history' && (
          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Histórico de digitalizações</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-graphite-400">Nenhuma digitalização ainda.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {history.map((upload) => {
                  const uploadProcessing = upload.processing;
                  const status = uploadProcessing?.status ?? upload.status;
                  return (
                    <li key={upload.id} className="border-b pb-3 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {upload.simulationId ? 'Cartão de simulado' : 'Leitura avulsa'}
                          </p>
                          <p className="text-sm text-graphite-400">
                            {new Date(upload.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </div>
                      {uploadProcessing && (
                        <p className="mt-1 text-sm text-graphite-500">
                          {uploadProcessing.answeredCount} de {uploadProcessing.totalQuestions} respostas detectadas
                          {uploadProcessing.lowConfidenceCount > 0 && `, ${uploadProcessing.lowConfidenceCount} para revisar`}
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
