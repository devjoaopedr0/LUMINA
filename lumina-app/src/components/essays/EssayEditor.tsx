import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, History, MessageSquare, Save, ScanLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EssayCorrectionView } from '@/components/essays/EssayCorrectionPanel';
import { quotaLabel, useEssayCorrection } from '@/hooks/useEssayCorrection';
import { getAccessToken } from '@/lib/auth';
import { apiEssay, apiEssaySave, apiEssayThemes, apiEssayRevisions, apiEssayRevision, type Essay, type EssayRevision, type EssayPage, type EssayRevisionSummary, type EssayTheme } from '@/lib/api';
import { createEssaySaver, draftFields, essayWordCount, parseLocalDraft, sameDraft, type EssayDraft, type EssaySaveState } from '@/lib/essay-draft';

export function EssayEditor({ initial, userId }: { initial: Essay; userId: string }) {
  const navigate = useNavigate();
  const storageKey = `lumina:essay:v1:${userId}:${initial.id}`;
  const [state, setState] = useState<EssaySaveState>({ draft: draftFields(initial), saved: draftFields(initial), version: initial.version, busy: false, error: null, conflict: false });
  const [saver] = useState(() => createEssaySaver(initial, data => apiEssaySave(getAccessToken() ?? '', initial.id, data), setState));
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [localWarning, setLocalWarning] = useState('');
  const [notice, setNotice] = useState('');
  const [importedText, setImportedText] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const importLock = useRef(false);
  const [themes, setThemes] = useState<EssayTheme[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<EssayPage<EssayRevisionSummary> | null>(null);
  const [preview, setPreview] = useState<EssayRevision | Essay | null>(null);
  const [comparingServer, setComparingServer] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const panelLock = useRef(false);
  const [panelError, setPanelError] = useState('');
  const dirty = !sameDraft(state.draft, state.saved);
  const { correction, error: correctionError, busy: correctionBusy, request: requestCorrection, quota } = useEssayCorrection(initial.id);
  const quotaExhausted = quota !== null && quota.remaining <= 0;
  const canCorrect = !dirty && !state.busy && !state.error && state.draft.theme.trim().length >= 3 && essayWordCount(state.draft.content) >= 20;

  useEffect(() => {
    try {
      const local = parseLocalDraft(localStorage.getItem(storageKey));
      if (local && !sameDraft(local, initial)) {
        saver.edit(local);
        if (local.version !== initial.version) saver.markConflict();
        setNotice('Recuperamos um rascunho deste navegador.');
      }
    } catch { setLocalWarning('A cópia local está indisponível. Salve na conta antes de sair.'); }
    setReady(true);
  }, [initial, saver, storageKey]);

  useEffect(() => {
    let active = true;
    apiEssayThemes(getAccessToken() ?? '').then(data => { if (active) setThemes(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      if (dirty) localStorage.setItem(storageKey, JSON.stringify({ schema: 1, ...state.draft, version: state.version }));
      else localStorage.removeItem(storageKey);
    } catch { setLocalWarning('Não foi possível atualizar a cópia local. Salve na conta ou baixe seu texto antes de sair.'); }
  }, [ready, dirty, state.draft, state.version, storageKey]);

  useEffect(() => {
    if (!ready || !dirty || state.busy || state.error || preview || panelBusy) return;
    const timer = window.setTimeout(() => { void saver.save(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [ready, dirty, state.draft, state.busy, state.error, saver, preview, panelBusy]);

  useEffect(() => {
    if (!dirty && !state.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, state.busy]);

  useEffect(() => {
    if (!showHistory) return;
    let active = true;
    setHistory(null); setPanelError('');
    apiEssayRevisions(getAccessToken() ?? '', initial.id, historyPage).then(data => { if (active) setHistory(data); })
      .catch(() => { if (active) setPanelError('Não foi possível carregar as versões. Feche e abra o histórico para tentar novamente.'); });
    return () => { active = false; };
  }, [showHistory, historyPage, initial.id, state.version]);

  function edit(field: keyof EssayDraft, value: string) {
    saver.edit({ ...saver.getState().draft, [field]: value });
  }

  async function compare(version?: number) {
    if (panelLock.current || saver.getState().busy) return;
    panelLock.current = true;
    setPanelBusy(true); setPanelError('');
    try {
      const data = version === undefined ? await apiEssay(getAccessToken() ?? '', initial.id) : await apiEssayRevision(getAccessToken() ?? '', initial.id, version);
      setPreview(data); setComparingServer(version === undefined);
    } catch { setPanelError('Não foi possível abrir a versão. Tente novamente.'); }
    finally { panelLock.current = false; setPanelBusy(false); }
  }

  async function applyPreview(useMine: boolean) {
    if (!preview) return;
    if (comparingServer) saver.rebase(preview);
    if (!useMine) saver.edit(draftFields(preview));
    setPreview(null);
    setNotice(useMine ? 'Seu texto será salvo como uma nova versão.' : 'Versão carregada no editor. As versões anteriores continuam no histórico.');
    await saver.save();
  }

  function download() {
    const draft = saver.getState().draft;
    const url = URL.createObjectURL(new Blob([`${draft.title}\n${draft.theme}\n\n${draft.content}`], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `redacao-${initial.id}.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importText(file?: File) {
    if (!file || importLock.current) return;
    importLock.current = true;
    setImportBusy(true); setImportError(''); setImportedText(null);
    try {
      if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('Escolha um arquivo .txt em UTF-8.');
      if (file.size > 120000) throw new Error('O arquivo deve ter até 120 KB.');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).replace(/\r\n?/g, '\n');
      if (!content.trim()) throw new Error('O arquivo está vazio.');
      if (content.includes('\0')) throw new Error('O arquivo não contém texto válido.');
      if (content.length > 30000) throw new Error('O texto deve ter até 30.000 caracteres.');
      setImportedText(content);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.'); }
    finally { importLock.current = false; setImportBusy(false); }
  }

  async function leave() {
    if (saver.getState().busy || saver.getState().error) return;
    setLeaving(true);
    if (await saver.save()) {
      const latest = saver.getState();
      if (sameDraft(latest.draft, latest.saved)) navigate('/app/redacoes');
    }
    setLeaving(false);
  }

  const inputClass = 'w-full rounded-xl border border-surface-line bg-white p-3 focus:outline-primary disabled:opacity-60';
  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8"><div className="mx-auto max-w-6xl">
    <button type="button" onClick={() => void leave()} disabled={state.busy || !!state.error || !!preview || panelBusy} className="inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-40"><ArrowLeft size={16} />Salvar e voltar às redações</button>
    <header className="my-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">Seu espaço de escrita</h1><p role="status" className="mt-2 text-sm text-graphite-500">{state.busy ? 'Salvando na sua conta…' : state.error ? 'Texto ainda não salvo na conta' : dirty ? 'Alterações aguardando salvamento…' : `Salvo na sua conta · Versão ${state.version}`}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={download}><Download size={16} />Baixar texto</Button><Button variant="outline" onClick={() => navigate(`/app/redacoes/${initial.id}/revisao`)}><MessageSquare size={16} />Revisão humana</Button><Button variant="outline" disabled={state.busy || panelBusy || !!preview} onClick={() => setShowHistory(value => !value)}><History size={16} />Versões</Button><Button disabled={!ready || !dirty || state.busy || !!preview || panelBusy || !!state.error} onClick={() => void saver.save()}><Save size={16} />Salvar agora</Button></div></header>
    {notice ? <p role="status" className="mb-4 rounded-xl bg-primary/10 p-3 text-sm">{notice}</p> : null}
    <section aria-label="Importar redação" className="mb-5 rounded-xl border border-surface-line bg-white p-4">
      <label htmlFor="essay-import" className="block text-sm font-semibold">Importar texto (.txt)</label>
      <p className="my-2 text-sm text-graphite-500">Escolha um arquivo UTF-8 com até 30.000 caracteres. Confira o texto antes de substituir o conteúdo do editor.</p>
      <input id="essay-import" type="file" accept=".txt,text/plain" disabled={!ready || importBusy || state.busy || !!state.error || !!preview || panelBusy || leaving} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importText(file); }} className="max-w-full text-sm" />
      {importBusy ? <p role="status" className="mt-2 text-sm">Lendo arquivo…</p> : null}
      {importError ? <p role="alert" className="mt-2 text-sm text-red-700">{importError}</p> : null}
      {importedText !== null ? <div className="mt-4"><h2 className="font-semibold">Prévia · {essayWordCount(importedText)} palavras</h2><pre className="my-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-card p-4 font-sans text-sm">{importedText}</pre><div className="flex flex-wrap gap-2"><Button disabled={state.busy || !!state.error || !!preview || panelBusy || leaving} onClick={async () => {
        if (panelLock.current) return;
        panelLock.current = true; setPanelBusy(true);
        try {
          if (!await saver.save()) return;
          edit('content', importedText); setImportedText(null); setNotice('Texto importado. O título e o tema foram preservados.');
        } finally { panelLock.current = false; setPanelBusy(false); }
      }}>Usar texto no editor</Button><Button variant="ghost" onClick={() => setImportedText(null)}>Cancelar importação</Button></div></div> : null}
    </section>
    {localWarning ? <p role="alert" className="mb-4 text-sm text-red-700">{localWarning}</p> : null}
    {state.error ? <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4"><p>O texto continua no editor. {state.error instanceof Error ? state.error.message : 'Não foi possível salvar.'}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={state.busy || panelBusy || !!preview || state.conflict} onClick={() => void saver.save()}>Tentar salvar novamente</Button><Button variant="outline" disabled={state.busy || panelBusy || !!preview} onClick={() => void compare()}>Comparar com a versão da conta</Button></div></div> : null}
    {panelError ? <p role="alert" className="mb-4 text-red-700">{panelError}</p> : null}
    {panelBusy ? <p role="status" className="mb-4">Carregando versão…</p> : null}
    {preview ? <Card className="mb-6 bg-white p-5"><h2 className="text-lg font-bold">{comparingServer ? 'Texto salvo na conta' : 'Histórico'} · Versão {preview.version}</h2><p className="mt-2 text-sm text-graphite-500">Compare os textos antes de escolher. Usar uma versão anterior preserva o histórico e salva uma nova versão.</p><div className="my-4 grid gap-4 md:grid-cols-2"><section><h3 className="mb-2 font-semibold">Seu texto no editor</h3><p className="break-words font-semibold">{state.draft.title || 'Sem título'}</p><p className="mb-2 break-words text-sm">{state.draft.theme || 'Tema livre'}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-card p-4 font-sans text-sm">{state.draft.content || '(Texto vazio)'}</pre></section><section><h3 className="mb-2 font-semibold">Versão {preview.version}</h3><p className="break-words font-semibold">{preview.title || 'Sem título'}</p><p className="mb-2 break-words text-sm">{preview.theme || 'Tema livre'}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-card p-4 font-sans text-sm">{preview.content || '(Texto vazio)'}</pre></section></div><div className="flex flex-wrap gap-2"><Button onClick={() => void applyPreview(false)}>Usar versão {preview.version}</Button>{comparingServer ? <Button variant="outline" onClick={() => void applyPreview(true)}>Manter meu texto e salvar</Button> : null}<Button variant="ghost" onClick={() => setPreview(null)}>Cancelar</Button></div></Card> : null}
    <div className={`grid gap-6 ${showHistory ? 'lg:grid-cols-[1fr_280px]' : ''}`}><Card className="bg-white p-5 sm:p-8"><fieldset disabled={!ready || !!preview || panelBusy || leaving} className="space-y-5"><div><label htmlFor="essay-title" className="mb-2 block text-sm font-semibold">Título</label><input id="essay-title" maxLength={160} value={state.draft.title} onChange={event => edit('title', event.target.value)} placeholder="Dê um título à sua redação" className={inputClass} /></div><div><label htmlFor="essay-theme" className="mb-2 block text-sm font-semibold">Tema</label><input id="essay-theme" list="essay-themes" maxLength={300} value={state.draft.theme} onChange={event => edit('theme', event.target.value)} placeholder="Escreva seu tema ou escolha uma proposta" className={inputClass} /><datalist id="essay-themes">{themes.map(theme => <option key={theme.id} value={theme.title} />)}</datalist><label htmlFor="essay-theme-select" className="mt-3 block text-xs font-semibold">Propostas do ENEM e autorais</label><select id="essay-theme-select" value="" onChange={event => { const selected = themes.find(theme => theme.id === event.target.value); if (selected) edit('theme', selected.title); }} className={`${inputClass} mt-1 text-sm`}><option value="">Escolha um ano ou tema</option>{themes.map(theme => <option key={theme.id} value={theme.id}>{theme.exam === 'ENEM' ? `ENEM ${theme.year} · ` : 'Autoral · '}{theme.title}</option>)}</select>{themes.find(theme => theme.title === state.draft.theme)?.sourceUrl ? <a className="mt-2 inline-block text-xs text-primary-700 underline" target="_blank" rel="noopener noreferrer" href={themes.find(theme => theme.title === state.draft.theme)?.sourceUrl ?? undefined}>Ver proposta oficial no Inep</a> : null}</div><div><label htmlFor="essay-content" className="mb-2 block text-sm font-semibold">Redação</label><textarea id="essay-content" aria-describedby="essay-count" maxLength={30000} value={state.draft.content} onChange={event => edit('content', event.target.value)} placeholder="Comece a escrever sua introdução…" className={`${inputClass} min-h-[460px] resize-y leading-8`} /><p id="essay-count" className="mt-2 text-sm text-graphite-500">{essayWordCount(state.draft.content)} palavras · {state.draft.content.length}/30.000 caracteres</p></div></fieldset><div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-line pt-4"><Button disabled={!canCorrect || quotaExhausted || correctionBusy || correction?.status === 'IN_PROGRESS'} onClick={() => void requestCorrection()}><Sparkles size={16} />{correction?.status === 'COMPLETED' ? 'Corrigir novamente' : 'Corrigir com a LuminIA'}</Button><Button variant="ghost" onClick={() => navigate('/app/redacoes/scanner')}><ScanLine size={16} />Corrigir uma redação no papel</Button><p className="text-sm text-graphite-500">{!canCorrect ? (dirty || state.busy ? 'Salve o texto para pedir a correção.' : state.draft.theme.trim().length < 3 ? 'Informe o tema para pedir a correção.' : 'Escreva a redação para pedir a correção.') : 'Nota pelas cinco competências do Enem, com os critérios da cartilha do Inep.'}</p>{quota ? <p className={`w-full text-sm ${quotaExhausted ? 'font-semibold text-amber-700' : 'text-graphite-500'}`}>{quotaLabel(quota)}</p> : null}</div>{correctionError ? <p role="status" className="mt-3 text-sm text-amber-700">{correctionError}</p> : null}{correction?.status ? <div className="mt-5"><EssayCorrectionView correction={correction} onRetry={() => void requestCorrection()} retrying={correctionBusy} /></div> : null}</Card>
      {showHistory ? <aside aria-label="Histórico de versões"><h2 className="mb-3 text-lg font-semibold">Versões salvas</h2>{history ? <><ul className="space-y-2">{history.items.map(item => <li key={item.id}><button type="button" disabled={state.busy || panelBusy || !!preview || dirty} onClick={() => void compare(item.version)} className="w-full rounded-xl border border-surface-line bg-white p-4 text-left hover:border-primary disabled:opacity-50"><span className="block font-semibold">Versão {item.version}</span><span className="mt-1 block text-xs text-graphite-500">{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.wordCount} palavras</span></button></li>)}</ul>{!history.items.length ? <p className="text-sm">As versões aparecem após a primeira alteração salva.</p> : null}<div className="mt-3 flex items-center justify-between gap-2"><button type="button" disabled={historyPage === 1} className="text-sm underline disabled:opacity-40" onClick={() => setHistoryPage(page => page - 1)}>Anterior</button><span className="text-xs">{historyPage}</span><button type="button" disabled={!history.hasMore} className="text-sm underline disabled:opacity-40" onClick={() => setHistoryPage(page => page + 1)}>Próxima</button></div></> : !panelError ? <p role="status">Carregando versões…</p> : null}{dirty ? <p className="mt-4 text-xs text-graphite-500">Salve as alterações antes de restaurar uma versão.</p> : null}</aside> : null}
    </div>
  </div></main>;
}
