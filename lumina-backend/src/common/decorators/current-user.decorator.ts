import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserWithProfile } from '../../users/users.repository';

/** Extrai o usuário autenticado (anexado pelo JwtStrategy) direto no
 * parâmetro do handler: `@CurrentUser() user: UserWithProfile`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserWithProfile => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
