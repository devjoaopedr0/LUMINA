import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Corpo de POST /auth/refresh — o refresh token emitido no login/registro. */
export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token emitido no login, registro ou refresh anterior.' })
  @IsString({ message: 'refreshToken deve ser um texto.' })
  @IsNotEmpty({ message: 'refreshToken é obrigatório.' })
  refreshToken: string;
}
