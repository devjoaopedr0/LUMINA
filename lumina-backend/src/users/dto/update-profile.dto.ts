import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username deve conter apenas letras, números, ponto, hífen ou underline',
  })
  username?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^(https?:\/\/|data:image\/(?:jpeg|png|webp);base64,)/, {
    message: 'avatarUrl deve ser uma URL http(s) ou uma imagem enviada pelo perfil',
  })
  @MaxLength(100000)
  avatarUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, { message: 'telefone inválido' })
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString({}, { message: 'data de nascimento inválida' })
  birthDate?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  bio?: string | null;
}
