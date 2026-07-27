import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Aplica a estratégia 'google' (ver GoogleStrategy). Em GET /auth/google
 * dispara o redirect pro consentimento do Google; em GET /auth/google/callback
 * troca o "code" pelo profile e chama GoogleStrategy.validate. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
