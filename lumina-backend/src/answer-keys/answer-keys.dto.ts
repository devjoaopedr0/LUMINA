import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AnswerKeyOrigin, AnswerKeyStatus } from '@prisma/client';

export class AnswerKeyItemDto {
  @IsInt() @Min(1) @Max(999) number!: number;

  @ApiProperty({ description: '1 = A … 5 = E; null = questão anulada.', nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(5) answer!: number | null;

  @ApiPropertyOptional({ description: 'Questões de língua do Enem: INGLES ou ESPANHOL.' })
  @IsOptional() @IsIn(['', 'INGLES', 'ESPANHOL']) language?: string;

  @IsOptional() @IsString() @MaxLength(80) area?: string | null;
}

export class CreateAnswerKeyDto {
  @ApiPropertyOptional({ description: 'Prova já cadastrada.' })
  @IsOptional() @IsUUID() examId?: string;

  @ApiPropertyOptional({ description: 'Ou: nome da prova (ENEM, FUVEST, UECE…) — reaproveita se já existir.' })
  @IsOptional() @IsString() @MaxLength(80) examName?: string;

  @IsOptional() @IsInt() @Min(1990) @Max(2100) examYear?: number;

  @IsOptional() @IsString() @MaxLength(120) examInstitution?: string;

  @ApiPropertyOptional({ description: 'Edição/aplicação: Regular, Reaplicação/PPL, Digital…' })
  @IsOptional() @IsString() @MaxLength(60) application?: string;

  @IsOptional() @IsInt() @Min(1) @Max(4) day?: number | null;

  @IsOptional() @IsString() @MaxLength(30) bookletColor?: string | null;

  @IsOptional() @IsString() @MaxLength(80) area?: string | null;

  @ApiProperty({ enum: AnswerKeyOrigin })
  @IsEnum(AnswerKeyOrigin) origin!: AnswerKeyOrigin;

  @IsOptional() @IsString() @MaxLength(120) sourceName?: string;

  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(500) sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Data de publicação pela banca (obrigatória no oficial).' })
  @IsOptional() @IsDateString() publishedAt?: string;

  @ApiPropertyOptional({ description: 'Publica já (senão fica em rascunho, visível só para quem criou).' })
  @IsOptional() @IsBoolean() publish?: boolean;

  @ApiProperty({ type: [AnswerKeyItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => AnswerKeyItemDto)
  items!: AnswerKeyItemDto[];
}

export class SuggestAnswerKeyDto {
  @ApiProperty({ description: 'Prova já cadastrada, com questões no banco.' })
  @IsUUID() examId!: string;

  @IsOptional() @IsString() @MaxLength(60) application?: string;

  @IsOptional() @IsInt() @Min(1) @Max(4) day?: number | null;

  @IsOptional() @IsString() @MaxLength(30) bookletColor?: string | null;

  @IsOptional() @IsString() @MaxLength(80) area?: string | null;

  @ApiPropertyOptional({ description: 'Números a sugerir; vazio = todas as questões encontradas da prova/dia.' })
  @IsOptional() @IsArray() @ArrayMaxSize(400) @IsInt({ each: true }) @Min(1, { each: true }) @Max(999, { each: true }) numbers?: number[];

  @ApiPropertyOptional({ description: 'Enem 1º dia: sugere só uma língua nas questões 1–5; vazio = inglês e espanhol.' })
  @IsOptional() @IsIn(['INGLES', 'ESPANHOL']) language?: string;
}

export class ValidateAnswerKeyItemDto {
  @IsInt() @Min(1) @Max(999) number!: number;

  @IsOptional() @IsIn(['', 'INGLES', 'ESPANHOL']) language?: string;

  @ApiPropertyOptional({ description: 'Resposta confirmada ou corrigida pelo professor; null = anulada. Omitir mantém a sugestão.' })
  @IsOptional() @IsInt() @Min(1) @Max(5) answer?: number | null;

  @IsOptional() @IsString() @MaxLength(1000) justification?: string | null;
}

export class ValidateAnswerKeyItemsDto {
  @ApiProperty({ type: [ValidateAnswerKeyItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => ValidateAnswerKeyItemDto)
  items!: ValidateAnswerKeyItemDto[];
}

export class ReviseAnswerKeyDto {
  @ApiProperty({ description: 'O que mudou (ex.: "Retificação do INEP de 20/11: questão 37 anulada").' })
  @IsString() @MaxLength(500) correctionNote!: string;

  @ApiProperty({ type: [AnswerKeyItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => AnswerKeyItemDto)
  items!: AnswerKeyItemDto[];
}

export class SetAnswerKeyStatusDto {
  @ApiProperty({ enum: AnswerKeyStatus })
  @IsEnum(AnswerKeyStatus) status!: AnswerKeyStatus;
}

export class CheckAnswersDto {
  @ApiProperty({ description: '{ "número da questão": 1–5 | null (em branco) }' })
  @IsObject() answers!: Record<string, number | null>;

  @IsOptional() @IsIn(['INGLES', 'ESPANHOL']) language?: string | null;

  @IsOptional() @IsIn(['MANUAL', 'PHOTO']) inputMode?: string;
}

export class ListAnswerKeysQuery {
  @IsOptional() @IsUUID() examId?: string;
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @IsOptional() @Type(() => Number) @IsInt() day?: number;
  @IsOptional() @IsEnum(AnswerKeyOrigin) origin?: AnswerKeyOrigin;
}

export class ImportInepAnswerKeyDto {
  @ApiProperty({ description: 'PDF do gabarito em download.inep.gov.br (ex.: .../2024_GB_impresso_D2_CD5.pdf).' })
  @IsUrl({ require_protocol: true, host_whitelist: ['download.inep.gov.br'] }) @MaxLength(500) gabaritoUrl!: string;

  @ApiProperty({ description: 'Data de publicação do gabarito pelo INEP (o PDF não traz).' })
  @IsDateString() publishedAt!: string;

  @IsOptional() @IsString() @MaxLength(60) application?: string;

  @IsOptional() @IsBoolean() publish?: boolean;
}

export class ReadAnswerSheetDto {
  @ApiProperty({ description: 'Foto do cartão digitalizada como PDF de uma página (data URL application/pdf).' })
  @IsString() @MaxLength(35_000_000) pdf!: string;
}

export class CommunityContributionDto {
  @IsUUID() examId!: string;
  @IsOptional() @IsString() @MaxLength(60) application?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) day?: number | null;
  @IsOptional() @IsString() @MaxLength(30) bookletColor?: string | null;
  @IsOptional() @IsIn(['INGLES', 'ESPANHOL']) language?: string;

  @ApiProperty({ description: '{ "número": 1–5 | null } — em branco não vira voto.' })
  @IsObject() answers!: Record<string, number | null>;
}
