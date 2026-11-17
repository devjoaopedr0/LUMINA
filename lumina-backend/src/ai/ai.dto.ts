import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsArray, ValidateNested, IsOptional, IsIn, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** Modos de tutoria aceitos pelo chat. O padrão (sem campo) é resposta direta. */
export type AiChatMode = 'SOCRATIC';

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

  /** Quando `SOCRATIC`, a LuminIA conduz por perguntas e pistas progressivas
   *  em vez de entregar a explicação pronta. O contexto da questão continua
   *  sendo montado no servidor; o cliente não envia gabarito nem instruções. */
  @ApiProperty({ required: false, enum: ['SOCRATIC'] })
  @IsOptional()
  @IsIn(['SOCRATIC'])
  mode?: AiChatMode;

  /** Imagem da mensagem atual (foto de questão, print), em data URL. Vai só
   *  para modelos com entrada de imagem; imagens de mensagens antigas não são
   *  reenviadas. O app reduz a foto para até 1600 px antes de enviar. */
  @ApiProperty({ required: false, description: 'data:image/(jpeg|png|webp);base64,… até ~4 MB' })
  @IsOptional()
  @IsString()
  @MaxLength(6_000_000)
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Envie a imagem em JPG, PNG ou WEBP.' })
  image?: string;
}

export class AiChatResponseDto {
  @ApiProperty()
  message!: string;
}