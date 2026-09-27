import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const FORMULA_DISCIPLINES = ['MATEMATICA', 'FISICA', 'QUIMICA', 'BIOLOGIA', 'OUTRA'] as const;
export const REPERTOIRE_THEMES = [
  'TECNOLOGIA',
  'MEIO_AMBIENTE',
  'SAUDE',
  'POLITICA',
  'EDUCACAO',
  'ECONOMIA',
  'CULTURA',
  'CIENCIA',
  'DIREITOS_HUMANOS',
  'OUTRO',
] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export class CreateFormulaDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ enum: FORMULA_DISCIPLINES, default: 'MATEMATICA' })
  @IsOptional() @IsIn(FORMULA_DISCIPLINES)
  discipline?: (typeof FORMULA_DISCIPLINES)[number];

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160)
  topic?: string | null;

  @ApiProperty({ description: 'A expressão em LaTeX.' })
  @IsString() @MinLength(1) @MaxLength(4000)
  latex: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isFavorite?: boolean;
}

export class UpdateFormulaDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: FORMULA_DISCIPLINES })
  @IsOptional() @IsIn(FORMULA_DISCIPLINES)
  discipline?: (typeof FORMULA_DISCIPLINES)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160)
  topic?: string | null;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  latex?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isFavorite?: boolean;
}

export class CreateRepertoireDto {
  @ApiProperty({ maxLength: 240 })
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(240)
  title: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString() @MinLength(10) @MaxLength(5000)
  summary: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160)
  source?: string | null;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100, nullable: true })
  @IsOptional() @IsInt() @Min(1900) @Max(2100)
  year?: number | null;

  @ApiPropertyOptional({ enum: REPERTOIRE_THEMES, default: 'OUTRO' })
  @IsOptional() @IsIn(REPERTOIRE_THEMES)
  theme?: (typeof REPERTOIRE_THEMES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isStudied?: boolean;
}

export class UpdateRepertoireDto {
  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(240)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional() @IsString() @MinLength(10) @MaxLength(5000)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160)
  source?: string | null;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100, nullable: true })
  @IsOptional() @IsInt() @Min(1900) @Max(2100)
  year?: number | null;

  @ApiPropertyOptional({ enum: REPERTOIRE_THEMES })
  @IsOptional() @IsIn(REPERTOIRE_THEMES)
  theme?: (typeof REPERTOIRE_THEMES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  keywords?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isStudied?: boolean;
}
