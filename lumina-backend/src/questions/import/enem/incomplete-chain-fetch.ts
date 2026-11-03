import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect, rootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';

/**
 * Alguns servidores (ex.: download.inep.gov.br) não enviam o certificado
 * intermediário da cadeia TLS. Navegadores e o Windows completam a cadeia
 * sozinhos (AIA); o Node não, e o download falha com
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * Aqui fazemos o mesmo que o navegador: lemos no certificado do servidor o
 * endereço do emissor ("CA Issuers", AIA), baixamos esse intermediário e
 * repetimos a requisição com ele na lista de confiança. Continua seguro: o
 * intermediário só é aceito se ele mesmo for assinado por uma raiz confiável
 * (a verificação TLS normal acontece de novo, com a cadeia completa).
 */

const intermediateCache = new Map<string, string>();
const MAX_BYTES = 60 * 1024 * 1024;

export function isIncompleteChainError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
}

/** Endereço "CA Issuers" do certificado que o servidor apresenta. */
function issuerUrlOf(host: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const info = socket.getPeerCertificate()?.infoAccess as Record<string, string[]> | undefined;
      socket.end();
      const url = info?.['CA Issuers - URI']?.find((u) => /^https?:\/\//.test(u)) ?? null;
      resolve(url);
    });
    socket.setTimeout(15_000, () => socket.destroy(new Error('Tempo esgotado ao consultar o certificado.')));
    socket.on('error', reject);
  });
}

function getBytes(url: string, options: { ca?: string[] } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? httpsRequest : httpRequest)(url, { method: 'GET', ...(options.ca ? { ca: options.ca } : {}), timeout: 60_000 }, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        res.resume();
        reject(Object.assign(new Error(`status ${res.statusCode}`), { status: res.statusCode }));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) req.destroy(new Error('Arquivo grande demais.'));
        else chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado no download.')));
    req.on('error', reject);
    req.end();
  });
}

/** Intermediário em PEM (o AIA costuma servir DER). */
async function intermediateFor(host: string): Promise<string> {
  const cached = intermediateCache.get(host);
  if (cached) return cached;
  const url = await issuerUrlOf(host);
  if (!url) throw new Error('O servidor não informa onde obter o certificado intermediário.');
  const raw = await getBytes(url);
  const pem = raw.toString('latin1').includes('-----BEGIN CERTIFICATE-----') ? raw.toString('latin1') : new X509Certificate(raw).toString();
  intermediateCache.set(host, pem);
  return pem;
}

/** GET com fallback para servidor que não envia o intermediário. */
export async function fetchCompletingChain(url: string): Promise<{ status: number; bytes: Uint8Array }> {
  try {
    const res = await fetch(url);
    return { status: res.status, bytes: res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array() };
  } catch (error) {
    if (!isIncompleteChainError(error)) throw error;
    const host = new URL(url).hostname;
    const pem = await intermediateFor(host);
    try {
      return { status: 200, bytes: new Uint8Array(await getBytes(url, { ca: [...rootCertificates, pem] })) };
    } catch (retryError) {
      const status = (retryError as { status?: number }).status;
      if (status) return { status, bytes: new Uint8Array() };
      throw retryError;
    }
  }
}
