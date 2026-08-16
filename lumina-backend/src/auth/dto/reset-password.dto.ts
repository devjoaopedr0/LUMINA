import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Redefinição de senha usando o token recebido por e-mail. Mesmas regras
 * de senha do cadastro (RegisterDto) e do set-password. */
export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recebido por e-mail (parâmetro ?token= do link).' })
  @IsString({ message: 'token deve ser um texto.' })
  @MinLength(16, { message: 'token inválido.' })
  @MaxLength(256, { message: 'token inválido.' })
  token: string;

  @ApiProperty({ example: 'SenhaForte123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'password deve ser um texto.' })
  @MinLength(8, { message: 'password deve ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'password deve ter no máximo 72 caracteres.' })
  password: string;
}
