export interface EssayDraft { title: string; theme: string; content: string }
export interface SavedEssay extends EssayDraft { version: number }

export const sameDraft = (a: EssayDraft, b: EssayDraft) => a.title === b.title && a.theme === b.theme && a.content === b.content;
export const essayWordCount = (content: string) => (content.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
export const draftFields = ({ title, theme, content }: EssayDraft): EssayDraft => ({ title, theme, content });

export function parseLocalDraft(value: string | null): SavedEssay | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value);
    if (data?.schema !== 1 || !Number.isInteger(data.version) || data.version < 0 ||
      typeof data.title !== 'string' || data.title.length > 160 ||
      typeof data.theme !== 'string' || data.theme.length > 300 ||
      typeof data.content !== 'string' || data.content.length > 30000) return null;
    return { ...draftFields(data), version: data.version };
  } catch { return null; }
}

export interface EssaySaveState {
  draft: EssayDraft; saved: EssayDraft; version: number; busy: boolean; error: unknown; conflict: boolean;
}

/** Serializa gravações sem substituir o texto digitado durante uma requisição. */
export function createEssaySaver(initial: SavedEssay, persist: (data: SavedEssay) => Promise<SavedEssay>, notify: (state: EssaySaveState) => void) {
  let state: EssaySaveState = { draft: draftFields(initial), saved: draftFields(initial), version: initial.version, busy: false, error: null, conflict: false };
  const update = (patch: Partial<EssaySaveState>) => { state = { ...state, ...patch }; notify(state); };
  return {
    getState: () => state,
    edit(draft: EssayDraft) { update({ draft: draftFields(draft) }); },
    rebase(server: SavedEssay) {
      if (state.busy) return;
      update({ saved: draftFields(server), version: server.version, error: null, conflict: false });
    },
    markConflict() { update({ conflict: true, error: new Error('Há um rascunho local de uma versão anterior. Compare com o texto salvo antes de continuar.') }); },
    async save() {
      if (state.busy || state.conflict) return false;
      if (sameDraft(state.draft, state.saved)) return true;
      const snapshot = { ...state.draft, version: state.version };
      update({ busy: true, error: null });
      try {
        const saved = await persist(snapshot);
        update({ saved: draftFields(saved), version: saved.version, busy: false });
        return true;
      } catch (error) {
        update({ error, busy: false, conflict: typeof error === 'object' && error !== null && 'status' in error && error.status === 409 });
        return false;
      }
    },
  };
}
