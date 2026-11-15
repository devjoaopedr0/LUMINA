import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaterialKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: MaterialKind }) @IsEnum(MaterialKind)
  kind!: MaterialKind;

  @ApiPropertyOptional({ description: 'Link ou vídeo (http/https).' })
  @IsOptional() @IsString() @MaxLength(1000) @Matches(/^https?:\/\/\S+$/i, { message: 'Informe um endereço que comece com http:// ou https://.' })
  url?: string;

  @ApiPropertyOptional({ description: 'PDF em data URL (application/pdf;base64), até 15 MB.' })
  @IsOptional() @IsString()
  file?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() topicId?: string;
}

export class ListMaterialsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() topicId?: string;
  @ApiPropertyOptional({ enum: MaterialKind }) @IsOptional() @IsEnum(MaterialKind) kind?: MaterialKind;
}

export class SearchMaterialsQueryDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200) q!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() classId?: string;
}

export class AskMaterialsDto {
  @ApiProperty({ description: 'Pergunta do aluno (ex.: "onde o professor explicou estequiometria?").' })
  @IsString() @MinLength(3) @MaxLength(1000)
  question!: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Restringe a um material.' }) @IsOptional() @IsUUID() materialId?: string;

  @ApiPropertyOptional({ description: 'Explicar esta página do material (exige materialId).' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page?: number;
}

export class GenerateQuestionsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, default: 3 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  count?: number;

  @ApiPropertyOptional({ type: [Number], description: 'Páginas usadas; sem valor, o material inteiro.' })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsInt({ each: true }) @Min(1, { each: true })
  pages?: number[];
}
