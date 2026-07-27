import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Mesmas regras de senha do cadastro (RegisterDto) — usado quando uma
 * conta criada via Google ainda não tem senha local e o usuário decide
 * definir uma. */
export class SetPasswordDto {
  @ApiProperty({ example: 'SenhaForte123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'password deve ser um texto.' })
  @MinLength(8, { message: 'password deve ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'password deve ter no máximo 72 caracteres.' })
  password: string;
}
