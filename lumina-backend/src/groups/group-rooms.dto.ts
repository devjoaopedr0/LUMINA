import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** Entrar numa sala: a matéria é de cada um; mostrar matéria e tempo é opcional. */
export class JoinRoomDto {
  @ApiPropertyOptional({ nullable: true, description: 'Matéria (StudySubject) que o aluno vai estudar.' })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @ApiPropertyOptional({ description: 'Mostrar matéria e cronômetro para a sala. Padrão: não.' })
  @IsOptional()
  @IsBoolean()
  showDetails?: boolean;
}

export class OpenRoomDto extends JoinRoomDto {
  @ApiPropertyOptional({ maxLength: 80, nullable: true, example: 'Revisão de exatas' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80)
  title?: string | null;
}

export class UpdateParticipationDto extends JoinRoomDto {}
