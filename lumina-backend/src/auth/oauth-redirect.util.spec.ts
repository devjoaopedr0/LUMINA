import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  buildOAuthErrorLoginUrl,
  formatOAuthError,
  redirectOAuthError,
} from './oauth-redirect.util';

describe('oauth-redirect.util', () => {
  describe('formatOAuthError', () => {
    it('usa a mensagem quando o erro é um Error', () => {
      expect(formatOAuthError(new Error('Mensagem de erro'))).toBe('Mensagem de erro');
    });

    it('usa a mensagem quando o objeto tem .message', () => {
      expect(formatOAuthError({ message: 'Mensagem de info' })).toBe('Mensagem de info');
    });

    it('retorna a mensagem padrão para valores sem mensagem', () => {
      expect(formatOAuthError(null)).toBe('Não foi possível concluir o login com Google.');
      expect(formatOAuthError('texto solto')).toBe('Não foi possível concluir o login com Google.');
      expect(formatOAuthError({})).toBe('Não foi possível concluir o login com Google.');
    });
  });

  describe('buildOAuthErrorLoginUrl', () => {
    it('monta /login com o parâmetro oauthError', () => {
      const url = buildOAuthErrorLoginUrl('http://localhost:5174', 'Ocorreu um problema');
      expect(url.toString()).toBe('http://localhost:5174/login?oauthError=Ocorreu+um+problema');
    });
  });

  describe('redirectOAuthError', () => {
    it('redireciona para o login com a mensagem de erro', () => {
      const res = { redirect: vi.fn(), headersSent: false } as unknown as Response;

      redirectOAuthError(res, 'http://localhost:5174', new Error('Falha no Google'));

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5174/login?oauthError=Falha+no+Google',
      );
    });

    it('não redireciona quando os headers já foram enviados', () => {
      const res = { redirect: vi.fn(), headersSent: true } as unknown as Response;

      redirectOAuthError(res, 'http://localhost:5174', new Error('Falha'));

      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
