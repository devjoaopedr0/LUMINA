import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail({}, { message: 'email deve ser um endereço de e-mail válido.' })
  email: string;

  @ApiProperty({ example: 'SenhaForte123' })
  @IsString({ message: 'password deve ser um texto.' })
  @MinLength(1, { message: 'password é obrigatório.' })
  password: string;
}
