import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInstitutionDto } from '../../institutions/institutions.dto';

export class RegisterDto {
  @ApiProperty({
    description: 'Aceite dos Termos de Uso e da Política de Privacidade (e, se menor de 18, a autorização do responsável).',
    example: true,
  })
  @Equals(true, { message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.' })
  acceptTerms: boolean;

  @ApiProperty({ required: false, type: CreateInstitutionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInstitutionDto)
  institution?: CreateInstitutionDto;
  @ApiProperty({ required: false, enum: ['STUDENT_INDEPENDENT', 'TEACHER'] })
  @IsOptional()
  @IsIn(['STUDENT_INDEPENDENT', 'TEACHER'])
  accountType?: 'STUDENT_INDEPENDENT' | 'TEACHER';

  @ApiProperty({ required: false, description: 'Matéria lecionada. Preencher apenas ao cadastrar uma conta de professor.' })
  @IsOptional()
  @IsString()
  @IsIn(['Língua Portuguesa', 'Literatura', 'Redação', 'Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês', 'Espanhol'])
  teacherSubject?: string;
  @ApiProperty({ example: 'Maria Silva', description: 'Nome do usuário' })
  @IsString({ message: 'first_name deve ser um texto.' })
  @MinLength(2, { message: 'first_name deve ter pelo menos 2 caracteres.' })
  @MaxLength(80, { message: 'first_name deve ter no máximo 80 caracteres.' })
  firstName: string;

  @ApiProperty({ example: 'Silva', description: 'Sobrenome do usuário' })
  @IsString({ message: 'last_name deve ser um texto.' })
  @MinLength(2, { message: 'last_name deve ter pelo menos 2 caracteres.' })
  @MaxLength(80, { message: 'last_name deve ter no máximo 80 caracteres.' })
  lastName: string;

  @ApiProperty({ example: 'maria.silva', description: 'Nome de usuário único' })
  @IsString({ message: 'username deve ser um texto.' })
  @MinLength(3, { message: 'username deve ter pelo menos 3 caracteres.' })
  @MaxLength(30, { message: 'username deve ter no máximo 30 caracteres.' })
  @Matches(/^[a-z0-9_.]+$/, {
    message: 'username só pode conter letras minúsculas, números, "_" e ".".',
  })
  username: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail({}, { message: 'email deve ser um endereço de e-mail válido.' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'email deve seguir o padrão nome@dominio.com.',
  })
  @MaxLength(254, { message: 'email deve ter no máximo 254 caracteres.' })
  email: string;

  @ApiProperty({ example: 'SenhaForte123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'password deve ser um texto.' })
  @MinLength(8, { message: 'password deve ter pelo menos 8 caracteres.' })
  // bcrypt ignora silenciosamente bytes além do 72º; barrar aqui evita uma
  // senha "efetiva" truncada sem o usuário perceber.
  @MaxLength(72, { message: 'password deve ter no máximo 72 caracteres.' })
  password: string;
}
