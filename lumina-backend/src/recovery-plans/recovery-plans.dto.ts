import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateRecoveryPlanDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Aluno do plano (professor). Sem valor: o próprio usuário.' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Assunto. Sem valor: o assunto mais fraco do aluno (plano automático).' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restringe o plano automático a uma matéria.' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Turma em que o professor acompanha o aluno.' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Alerta pedagógico que originou o plano.' })
  @IsOptional()
  @IsUUID()
  alertId?: string;
}

export class ListRecoveryPlansQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra um aluno das turmas do professor.' })
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
