import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
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
