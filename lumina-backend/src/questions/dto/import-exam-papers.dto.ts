import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsUrl, Max, Min, ValidateNested } from 'class-validator';

export class EnemPaperItemDto {
  @ApiProperty({ example: 2024 })
  @IsInt() @Min(1998) @Max(2100)
  year!: number;

  @ApiProperty({ example: 2 })
  @IsIn([1, 2])
  day!: 1 | 2;

  @ApiProperty({ example: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_PV_impresso_D2_CD7.pdf' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  provaUrl!: string;

  @ApiProperty({ example: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_GB_impresso_D2_CD7.pdf' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  gabaritoUrl!: string;
}

/** Lote de cadernos do ENEM para o acervo de provas anteriores (só PDFs do INEP). */
export class ImportEnemPapersDto {
  @ApiProperty({ type: [EnemPaperItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EnemPaperItemDto)
  items!: EnemPaperItemDto[];

  @ApiPropertyOptional({ default: false, description: 'Publicar no acervo ao terminar (senão fica em rascunho).' })
  @IsOptional() @IsBoolean()
  publish?: boolean;
}
