import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT usado para autenticar requisições (Bearer token).' })
  accessToken: string;

  @ApiProperty({
    description:
      'JWT de longa duração, assinado com um segredo próprio (JWT_REFRESH_SECRET). ' +
      'Estrutura preparada para um futuro endpoint de refresh — ainda não é validado por nenhuma rota.',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
