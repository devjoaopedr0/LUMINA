import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

/** Pedido de redefinição de senha — só o e-mail. A resposta é sempre
 * idêntica (mesmo quando o e-mail não existe), pra não revelar quais
 * e-mails estão cadastrados. */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsString({ message: 'email deve ser um texto.' })
  @IsEmail({}, { message: 'email deve ser um endereço de e-mail válido.' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'email deve seguir o padrão nome@dominio.com.',
  })
  @MaxLength(254, { message: 'email deve ter no máximo 254 caracteres.' })
  email: string;
}
