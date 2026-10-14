import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';
import { QuestionImportTarget } from './import-questions.dto';

/**
 * POST /questions/import/enem — importa um caderno oficial do ENEM a partir
 * dos PDFs públicos do INEP (prova + gabarito). As URLs vêm explícitas (não
 * construídas a partir de year/day) porque o INEP já mudou o padrão de nome
 * de arquivo entre edições — expor as duas URLs deixa o chamador (hoje: um
 * admin olhando a página oficial) escolher exatamente o PDF certo.
 */
export class ImportEnemDto {
  @ApiProperty({ example: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2023_PV_impresso_D2_CD7.pdf' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  provaUrl: string;

  @ApiProperty({ example: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2023_GB_impresso_D2_CD7.pdf' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  gabaritoUrl: string;

  @ApiProperty({ example: 2023, description: 'Ano de aplicação da prova.' })
  @IsInt()
  @Min(1998)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 2, description: '1º ou 2º dia de aplicação.' })
  @IsIn([1, 2])
  day: 1 | 2;

  @ApiPropertyOptional({
    enum: QuestionImportTarget,
    default: QuestionImportTarget.BANK,
    description: 'Para onde importar. Questões oficiais do ENEM normalmente vão para o banco central.',
  })
  @IsOptional()
  @IsIn([QuestionImportTarget.PERSONAL, QuestionImportTarget.BANK])
  target?: QuestionImportTarget;
}
