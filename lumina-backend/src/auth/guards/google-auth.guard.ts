import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { redirectOAuthError } from '../oauth-redirect.util';

/** Aplica a estratégia 'google' (ver GoogleStrategy). Em GET /auth/google
 * dispara o redirect pro consentimento do Google; em GET /auth/google/callback
 * troca o "code" pelo profile e chama GoogleStrategy.validate. Em falha,
 * redireciona pro frontend (/login?oauthError=...) em vez de devolver JSON. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const response = context.switchToHttp().getResponse<Response>();
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5174';
      redirectOAuthError(response, frontendUrl, err ?? info);
      return null as TUser;
    }

    return user;
  }
}
