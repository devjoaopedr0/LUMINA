import { QuestionDifficulty } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ImportQuestionDto,
  ImportReportDto,
} from '../questions/dto/import-questions.dto';

/** Limite padrão de resultados por chamada de busca na web. */
export const DEFAULT_SEARCH_LIMIT = 10;

/** Parâmetros da busca web pública (GET /search/web). */
export class SearchWebQueryDto {
  @ApiProperty({ description: 'Conteúdo/tema a pesquisar (ex: "funções exponenciais").' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  q: string;

  @ApiPropertyOptional({ description: 'Vestibular/prova (ex: ENEM, UECE).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  exam?: string;

  @ApiPropertyOptional({ description: 'Disciplina (ex: Matemática).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @ApiPropertyOptional({ description: 'Assunto/tópico (ex: Funções exponenciais).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ enum: QuestionDifficulty })
  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({ description: 'Máximo de resultados (1–20, padrão 10).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** Classificação determinística anexada a um resultado de busca (heurística
 * + catálogo, nunca IA externa). */
export class WebQuestionClassificationDto {
  @ApiPropertyOptional({ nullable: true })
  subject?: string | null;

  @ApiPropertyOptional({ nullable: true })
  subjectId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  topic?: string | null;

  @ApiPropertyOptional({ nullable: true })
  topicId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  exam?: string | null;

  @ApiPropertyOptional({ nullable: true })
  examId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  year?: number | null;

  @ApiPropertyOptional({ enum: QuestionDifficulty, nullable: true })
  difficulty?: QuestionDifficulty | null;
}

/** Um item do resultado da busca web — SOMENTE metadados públicos do hit
 * + atribuição da fonte. O conteúdo integral é transcrito ao salvar. */
export class WebSearchResultDto {
  @ApiProperty({ description: 'Título do resultado.' })
  title: string;

  @ApiProperty({ description: 'Link do resultado.' })
  link: string;

  @ApiPropertyOptional({ description: 'Trecho/contexto retornado pelo buscador.' })
  snippet?: string;

  @ApiPropertyOptional({ description: 'Nome da fonte (site).' })
  sourceName?: string;

  @ApiPropertyOptional({ description: 'Identificador/URL original da fonte.' })
  sourceId?: string;

  @ApiPropertyOptional({ type: WebQuestionClassificationDto })
  classification?: WebQuestionClassificationDto | null;
}

export class SearchWebResultsDto {
  @ApiProperty({ maxLength: 80 })
  provider: string;

  @ApiProperty({ description: 'true quando nenhum provedor real (Tavily ou Google CSE) está configurado.' })
  demoMode: boolean;

  @ApiProperty({ type: SearchWebQueryDto })
  query: SearchWebQueryDto;

  @ApiProperty({ type: () => [WebSearchResultDto] })
  items: WebSearchResultDto[];

  @ApiProperty()
  total: number;
}

/** Corpo de POST /search/save — salva uma questão da web no banco Lumina.
 * O usuário transcreve o conteúdo integral; NÓS preservamos a atribuição
 * da fonte (sourceUrl → sourceId) e marcamos a questão como IMPORTED. */
export class SaveWebQuestionDto {
  @ApiProperty({ description: 'URL da fonte original (preservada em sourceId).' })
  @IsString()
  @IsUrl(
    {
      require_protocol: true,
      // Sem TLD obrigatório: em desenvolvimento o app roda em
      // localhost:5174 e o link da fonte (modo demonstração) é uma URL do
      // próprio app — exigir TLD rejeitava todo save com 400.
      require_tld: false,
      protocols: ['http', 'https'],
    },
    { message: 'sourceUrl deve ser uma URL http(s) válida (link original da fonte).' },
  )
  @MaxLength(2048)
  sourceUrl: string;

  @ApiProperty({ description: 'Nome da fonte (ex: "QConcursos", "Prova ENEM").' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  sourceName: string;

  @ApiProperty({ type: () => ImportQuestionDto })
  @ValidateNested()
  @Type(() => ImportQuestionDto)
  question: ImportQuestionDto;
}

export { ImportReportDto };
