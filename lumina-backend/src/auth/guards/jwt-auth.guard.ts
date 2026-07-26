import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Aplica a estratégia 'jwt' (ver JwtStrategy) a uma rota. Uso:
 * `@UseGuards(JwtAuthGuard)` no controller/handler. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
