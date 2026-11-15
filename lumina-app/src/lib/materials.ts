/** Central de materiais (itens 48 a 50): tipos e regras de exibição. */
export type MaterialKind = 'PDF' | 'SLIDES' | 'APOSTILA' | 'LISTA' | 'LINK' | 'VIDEO';

export interface Material {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  url: string | null;
  hasFile: boolean;
  sizeBytes: number | null;
  pageCount: number | null;
  textStatus: 'OK' | 'NO_TEXT' | 'NONE';
  classId: string | null;
  className: string | null;
  subjectId: string | null;
  topicId: string | null;
  ownerName: string;
  isOwner: boolean;
  createdAt: string;
}

export interface MaterialSearchResult {
  query: string;
  pages: { materialId: string; title: string; page: number; snippet: string; matched: string[] }[];
  materials: { id: string; title: string; kind: MaterialKind; url: string | null }[];
}

export interface MaterialCitation { materialId: string; title: string; page: number }
export interface MaterialAnswer { found: boolean; answer: string; citations: MaterialCitation[]; model: string | null }

export interface DraftQuestion {
  stem: string;
  alternatives: { text: string; isCorrect: boolean }[];
  explanation: string;
  page: number | null;
}

export const KIND_LABEL: Record<MaterialKind, string> = {
  PDF: 'PDF',
  SLIDES: 'Slides',
  APOSTILA: 'Apostila',
  LISTA: 'Lista de exercícios',
  LINK: 'Link',
  VIDEO: 'Vídeo',
};

export const FILE_KINDS: MaterialKind[] = ['PDF', 'SLIDES', 'APOSTILA', 'LISTA'];
export const MAX_MATERIAL_BYTES = 15 * 1024 * 1024;

export function needsFile(kind: MaterialKind): boolean {
  return FILE_KINDS.includes(kind);
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Agrupa por turma (sem turma = "Minha biblioteca"), na ordem em que aparecem. */
export function groupByClass(items: Material[]): { key: string; label: string; items: Material[] }[] {
  const groups = new Map<string, { key: string; label: string; items: Material[] }>();
  for (const m of items) {
    const key = m.classId ?? 'library';
    const g = groups.get(key) ?? { key, label: m.className ?? 'Minha biblioteca (só você vê)', items: [] };
    g.items.push(m);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Valida o envio antes de chamar a API. Devolve a mensagem de erro ou null. */
export function validateUpload(input: { title: string; kind: MaterialKind; url: string; file: { size: number; type: string } | null }): string | null {
  if (input.title.trim().length < 3) return 'Dê um título com pelo menos 3 letras.';
  if (needsFile(input.kind)) {
    if (!input.file) return 'Escolha o arquivo em PDF.';
    if (input.file.type && input.file.type !== 'application/pdf') return 'Por enquanto a central aceita só PDF (exporte slides e apostilas em PDF).';
    if (input.file.size > MAX_MATERIAL_BYTES) return 'O arquivo passa do limite de 15 MB.';
    return null;
  }
  if (!/^https?:\/\/\S+$/i.test(input.url.trim())) return 'Informe o endereço completo, começando com http:// ou https://.';
  return null;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
