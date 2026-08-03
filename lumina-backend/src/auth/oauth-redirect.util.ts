import type { Response } from 'express';

const DEFAULT_OAUTH_ERROR = 'Não foi possível concluir o login com Google.';

export function formatOAuthError(source: unknown): string {
  if (source instanceof Error && source.message) {
    return source.message;
  }

  if (typeof source === 'object' && source !== null && 'message' in source) {
    const message = (source as { message: unknown }).message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }

  return DEFAULT_OAUTH_ERROR;
}

export function buildOAuthErrorLoginUrl(frontendUrl: string, message: string): URL {
  const url = new URL('/login', frontendUrl);
  url.searchParams.set('oauthError', message);
  return url;
}

export function redirectOAuthError(res: Response, frontendUrl: string, source: unknown): void {
  if (res.headersSent) return;

  const redirectUrl = buildOAuthErrorLoginUrl(frontendUrl, formatOAuthError(source));
  res.redirect(redirectUrl.toString());
}
