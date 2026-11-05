import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsArray, ValidateNested, IsOptional, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

export class AiChatRequestDto {
  @ApiProperty({ type: AiChatMessageDto })
  @ValidateNested()
  @Type(() => AiChatMessageDto)
  message!: AiChatMessageDto;

  @ApiProperty({ type: [AiChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  history!: AiChatMessageDto[];

  /** Tarefa do cronograma sobre a qual o aluno está perguntando ("por que
   *  isso hoje?"). O cliente manda só o id: o contexto (domínio, fase,
   *  motivos) é montado no servidor, para o aluno não conseguir passar
   *  números inventados à IA. */
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  scheduleTaskId?: string;

  /** Questão sobre a qual o aluno pediu ajuda ("me explica essa questão").
   *  O cliente manda só o id: enunciado, alternativas e última tentativa são
   *  carregados no servidor, e o gabarito só entra no contexto depois que o
   *  aluno já respondeu. */
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  questionId?: string;
}

export class AiChatResponseDto {
  @ApiProperty()
  message!: string;
}