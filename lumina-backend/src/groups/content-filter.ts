/**
 * Filtro de conteúdo do Lumina Groups (etapa 4). Determinístico, sem IA:
 * palavrões e ofensas comuns em português, e dados de contato nas mensagens.
 *
 * O chat é aberto a todas as idades (decisão de 18/11/2026), então o filtro
 * é conservador: recusa a mensagem e diz o motivo, em vez de mascarar.
 * Telefone e e-mail são bloqueados para evitar contato fora da plataforma.
 */

/** Termos bloqueados (já normalizados: minúsculas, sem acento). Raízes curtas
 * só casam como palavra inteira; as longas casam também dentro de palavras. */
const WHOLE_WORDS = [
  'porra', 'caralho', 'cacete', 'merda', 'bosta', 'puta', 'puto', 'putaria', 'foda', 'fodase', 'foder', 'fodido',
  'buceta', 'boceta', 'xoxota', 'piroca', 'pinto', 'rola', 'cu', 'cuzao', 'arrombado', 'arrombada',
  'viado', 'viadinho', 'bicha', 'sapatao', 'traveco', 'retardado', 'retardada', 'mongol', 'otario', 'otaria',
  'vagabunda', 'vagabundo', 'piranha', 'vadia', 'corno', 'babaca', 'idiota', 'imbecil', 'desgracado', 'desgracada',
  'fdp', 'pqp', 'vsf', 'tnc', 'krl', 'crl',
  'nazista', 'macaco', 'macaca',
];
const INSIDE_WORDS = ['caralh', 'filhadaput', 'vaitomarnocu', 'tomarnocu', 'chupamina', 'punheta', 'siririca', 'estupr', 'suicid'];

const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't' };

/** Minúsculas, sem acento, sem leetspeak e sem letras repetidas ("poooorra"). */
export function normalizeForFilter(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[4@3!1!05$7]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1');
}

function words(normalized: string): string[] {
  return normalized.split(/[^a-z]+/).filter(Boolean);
}

/** Primeiro termo ofensivo encontrado, ou null. */
export function findOffensive(text: string): string | null {
  const normalized = normalizeForFilter(text);
  const list = words(normalized);
  const whole = new Set(WHOLE_WORDS);
  for (const w of list) if (whole.has(w)) return w;
  // "p u t a", "p.u.t.a": junta letras soltas em sequência.
  const glued = normalized.replace(/\b([a-z])[\s._-]+(?=[a-z]\b)/g, '$1');
  for (const w of words(glued)) if (whole.has(w)) return w;
  const compact = normalized.replace(/[^a-z]/g, '');
  for (const root of INSIDE_WORDS) if (compact.includes(root)) return root;
  return null;
}

const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]| arroba )\s*[a-z0-9-]+(\.[a-z0-9-]+)+/i;
// 8+ dígitos em sequência (com espaço, ponto, traço ou parênteses no meio): telefone/WhatsApp.
const PHONE = /(?:\+?\d[\s().-]*){8,}/;
const CONTACT_HINT = /\b(whats|wpp|zap|zapzap|telegram|insta|instagram|discord|snap)\b/i;

/** Telefone, e-mail ou convite explícito para contato fora do app. */
export function findContactInfo(text: string): 'email' | 'phone' | 'external' | null {
  if (EMAIL.test(text)) return 'email';
  if (PHONE.test(text)) return 'phone';
  // Rede social + @usuário ("me segue no insta @fulano").
  if (CONTACT_HINT.test(normalizeForFilter(text)) && /@[a-z0-9_.]{3,}/i.test(text)) return 'external';
  return null;
}

export type FilterVerdict = { ok: true } | { ok: false; reason: 'offensive' | 'contact'; message: string };

/** Mensagem do chat ou aviso do grupo. */
export function checkMessage(text: string): FilterVerdict {
  if (findOffensive(text)) {
    return { ok: false, reason: 'offensive', message: 'Sua mensagem tem palavras que não são permitidas no grupo. Reescreva com respeito.' };
  }
  if (findContactInfo(text)) {
    return { ok: false, reason: 'contact', message: 'Por segurança, não compartilhe telefone, e-mail ou contato de outras redes no grupo.' };
  }
  return { ok: true };
}

/** Nome, propósito, descrição e regras do grupo. */
export function checkGroupText(fields: Array<string | null | undefined>): FilterVerdict {
  for (const field of fields) {
    if (field && findOffensive(field)) {
      return { ok: false, reason: 'offensive', message: 'O nome ou a descrição do grupo têm palavras que não são permitidas.' };
    }
  }
  return { ok: true };
}
