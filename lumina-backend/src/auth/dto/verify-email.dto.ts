import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** Código numérico de 6 dígitos enviado por e-mail para confirmar o cadastro. */
export class VerifyEmailDto {
  @ApiProperty({ example: '482913', description: 'Código de 6 dígitos recebido por e-mail.' })
  @IsString({ message: 'code deve ser um texto.' })
  @Matches(/^\d{6}$/, { message: 'code deve ter exatamente 6 dígitos.' })
  code: string;
}
