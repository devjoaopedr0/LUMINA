import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const FORMULA_DISCIPLINES = ['MATEMATICA', 'FISICA', 'QUIMICA', 'BIOLOGIA', 'OUTRA'] as const;

/** Temas de redação (filtro rápido, vindo da primeira versão do caderno). */
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

/** Categorias do caderno (especificação de 01/11/2026). O aluno também pode criar as suas. */
export const REPERTOIRE_CATEGORIES = [
  'FILOSOFIA',
  'SOCIOLOGIA',
  'HISTORIA',
  'LITERATURA',
  'CINEMA_SERIES',
  'MUSICA',
  'CIENCIA_TECNOLOGIA',
  'ATUALIDADES',
  'LEGISLACAO',
  'DADOS_ESTATISTICOS',
  'PENSADORES',
  'OBRAS_ACONTECIMENTOS',
  'ARTES_CULTURA',
  'OUTRA',
] as const;

export const REFERENCE_TYPES = [
  'LIVRO',
  'FILME',
  'SERIE',
  'MUSICA',
  'LEI',
  'PESQUISA',
  'PENSADOR',
  'OBRA_DE_ARTE',
  'ACONTECIMENTO',
  'CONCEITO',
  'OUTRO',
] as const;

/** Eixos temáticos do caderno (especificação de 13/11/2026). */
export const REPERTOIRE_AXES = [
  'EDUCACAO',
  'DESIGUALDADE',
  'POLITICA_CIDADANIA',
  'CULTURA_IDENTIDADE',
  'TECNOLOGIA',
  'MEIO_AMBIENTE',
  'SAUDE',
  'TRABALHO_ECONOMIA',
  'DIREITOS_HUMANOS',
  'MIDIA_COMPORTAMENTO',
] as const;

/** Mapa de aplicação argumentativa: a função do repertório no texto. */
export const ARGUMENT_FUNCTIONS = [
  'DESIGUALDADES_ESTRUTURAIS',
  'OMISSAO_ESTATAL',
  'FALHAS_EDUCACIONAIS',
  'COMPORTAMENTOS_COLETIVOS',
  'PROBLEMAS_HISTORICOS',
  'VIOLACOES_DE_DIREITOS',
  'IMPACTOS_TECNOLOGICOS',
  'RELACOES_DE_PODER',
] as const;

export const NOTEBOOK_SORTS = ['recent', 'oldest', 'favorites', 'az'] as const;
export type NotebookSort = (typeof NOTEBOOK_SORTS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const optionalText = (max: number) => [IsOptional(), Transform(emptyToNull), IsString(), MaxLength(max)];
function OptionalText(max: number): PropertyDecorator {
  return (target, key) => optionalText(max).forEach((decorator) => decorator(target, key));
}

// ------------------------------------------------------------- fórmulas

export class CreateFormulaDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ enum: FORMULA_DISCIPLINES, default: 'MATEMATICA' })
  @IsOptional() @IsIn(FORMULA_DISCIPLINES)
  discipline?: (typeof FORMULA_DISCIPLINES)[number];

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @OptionalText(160)
  topic?: string | null;

  @ApiProperty({ description: 'A expressão em LaTeX.' })
  @IsString() @MinLength(1) @MaxLength(4000)
  latex: string;

  @ApiPropertyOptional({ nullable: true, description: 'Anotações pessoais.' })
  @OptionalText(4000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'O que cada símbolo significa.' })
  @OptionalText(2000)
  variables?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Em que tipo de questão a fórmula aparece.' })
  @OptionalText(2000)
  whenToUse?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Exemplo resolvido curto.' })
  @OptionalText(4000)
  example?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isFavorite?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isMemorized?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Só a administração: publica no acervo da plataforma.' })
  @IsOptional() @IsBoolean()
  isPlatform?: boolean;
}

export class UpdateFormulaDto extends PartialType(CreateFormulaDto) {}

export class ListFormulasQueryDto {
  @ApiPropertyOptional({ description: 'Busca no nome, assunto, LaTeX e anotações.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: FORMULA_DISCIPLINES })
  @IsOptional() @IsIn(FORMULA_DISCIPLINES)
  discipline?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: 'true = só as que ainda não decorou.' })
  @IsOptional() @Transform(toBool) @IsBoolean()
  toMemorize?: boolean;

  @ApiPropertyOptional({ enum: ['mine', 'platform', 'all'], default: 'mine' })
  @IsOptional() @IsIn(['mine', 'platform', 'all'])
  scope?: 'mine' | 'platform' | 'all';

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ enum: NOTEBOOK_SORTS, default: 'recent' })
  @IsOptional() @IsIn(NOTEBOOK_SORTS)
  sort?: NotebookSort;
}

// ---------------------------------------------------------- repertórios

export class CreateRepertoireDto {
  @ApiProperty({ maxLength: 240 })
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(240)
  title: string;

  @ApiProperty({ maxLength: 5000, description: 'Explicação do conceito ou da ideia principal.' })
  @IsString() @MinLength(10) @MaxLength(5000)
  summary: string;

  @ApiPropertyOptional({ description: 'Categoria do caderno ou o nome de uma categoria própria.', default: 'OUTRA' })
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true, description: 'Autor ou responsável.' })
  @OptionalText(200)
  author?: string | null;

  @ApiPropertyOptional({ enum: REFERENCE_TYPES, default: 'OUTRO' })
  @IsOptional() @IsIn(REFERENCE_TYPES)
  referenceType?: (typeof REFERENCE_TYPES)[number];

  @ApiPropertyOptional({ maxLength: 160, nullable: true, description: 'Fonte ou bibliografia.' })
  @OptionalText(160)
  source?: string | null;

  @ApiPropertyOptional({ minimum: -3000, maximum: 2100, nullable: true })
  @IsOptional() @IsInt() @Min(-3000) @Max(2100)
  year?: number | null;

  @ApiPropertyOptional({ enum: REPERTOIRE_THEMES, default: 'OUTRO' })
  @IsOptional() @IsIn(REPERTOIRE_THEMES)
  theme?: (typeof REPERTOIRE_THEMES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Temas de redação relacionados.' })
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) @MaxLength(120, { each: true })
  relatedThemes?: string[];

  @ApiPropertyOptional({ nullable: true, description: 'Contexto histórico, social ou cultural.' })
  @OptionalText(5000)
  context?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Importância sociocultural.' })
  @OptionalText(5000)
  importance?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Como aplicar na redação.' })
  @OptionalText(5000)
  essayUse?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Exemplo de uso argumentativo.' })
  @OptionalText(5000)
  example?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Anotações pessoais.' })
  @OptionalText(5000)
  notes?: string | null;

  @ApiPropertyOptional({ enum: REPERTOIRE_AXES, isArray: true, description: 'Eixos temáticos.' })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsIn(REPERTOIRE_AXES, { each: true })
  axes?: (typeof REPERTOIRE_AXES)[number][];

  @ApiPropertyOptional({ enum: ARGUMENT_FUNCTIONS, isArray: true, description: 'Funções no mapa de aplicação argumentativa.' })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsIn(ARGUMENT_FUNCTIONS, { each: true })
  argumentFunctions?: (typeof ARGUMENT_FUNCTIONS)[number][];

  @ApiPropertyOptional({ type: [String], description: 'Conceitos fundamentais.' })
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(120, { each: true })
  concepts?: string[];

  @ApiPropertyOptional({ nullable: true, description: 'Problemas sociais que o repertório ajuda a explicar.' })
  @OptionalText(5000)
  socialProblems?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Relação com a realidade brasileira.' })
  @OptionalText(5000)
  brazilRelation?: string | null;

  @ApiPropertyOptional({ enum: ['D1', 'D2'], nullable: true, description: 'Em que desenvolvimento o exemplo se encaixa.' })
  @IsOptional() @IsIn(['D1', 'D2', null])
  exampleSlot?: 'D1' | 'D2' | null;

  @ApiPropertyOptional({ nullable: true, description: 'Possíveis conexões com outros repertórios.' })
  @OptionalText(3000)
  connections?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Cuidados para evitar uso superficial ou decorativo.' })
  @OptionalText(3000)
  pitfalls?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Citação LITERAL (só com a fonte exata). Paráfrase vai na ideia central.' })
  @OptionalText(1500)
  quote?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Fonte exata da citação literal (obra, edição, página).' })
  @OptionalText(300)
  quoteSource?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isStudied?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isFavorite?: boolean;

  @ApiPropertyOptional({ enum: ['MANUAL', 'AI'], default: 'MANUAL', description: 'AI = sugestão da LuminIA revisada pelo aluno.' })
  @IsOptional() @IsIn(['MANUAL', 'AI'])
  origin?: 'MANUAL' | 'AI';

  @ApiPropertyOptional({ default: false, description: 'Só a administração: publica no acervo da plataforma.' })
  @IsOptional() @IsBoolean()
  isPlatform?: boolean;
}

export class UpdateRepertoireDto extends PartialType(CreateRepertoireDto) {}

export class ListRepertoiresQueryDto {
  @ApiPropertyOptional({ description: 'Busca no título, autor, categoria, palavras-chave, temas, conceito e uso.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ enum: REPERTOIRE_THEMES })
  @IsOptional() @IsIn(REPERTOIRE_THEMES)
  theme?: string;

  @ApiPropertyOptional({ enum: REFERENCE_TYPES })
  @IsOptional() @IsIn(REFERENCE_TYPES)
  referenceType?: string;

  @ApiPropertyOptional({ enum: REPERTOIRE_AXES })
  @IsOptional() @IsIn(REPERTOIRE_AXES)
  axis?: string;

  @ApiPropertyOptional({ enum: ARGUMENT_FUNCTIONS })
  @IsOptional() @IsIn(ARGUMENT_FUNCTIONS)
  argumentFunction?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(toBool) @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ enum: ['mine', 'platform', 'all'], default: 'mine' })
  @IsOptional() @IsIn(['mine', 'platform', 'all'])
  scope?: 'mine' | 'platform' | 'all';

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ enum: NOTEBOOK_SORTS, default: 'recent' })
  @IsOptional() @IsIn(NOTEBOOK_SORTS)
  sort?: NotebookSort;
}

// ------------------------------------------------------------ coleções

export class CreateCollectionDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @OptionalText(1000)
  description?: string | null;
}

export class UpdateCollectionDto extends PartialType(CreateCollectionDto) {}

export class CollectionItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true })
  ids: string[];
}

// ------------------------------------------------------------- LuminIA

export const REPERTOIRE_AI_ACTIONS = ['suggest', 'explain', 'howToUse', 'connections', 'check', 'apply', 'analyzeUse'] as const;
export type RepertoireAiAction = (typeof REPERTOIRE_AI_ACTIONS)[number];

export class RepertoireAiDto {
  @ApiProperty({
    enum: REPERTOIRE_AI_ACTIONS,
    description:
      'suggest: repertórios para um tema; explain: explica um repertório; howToUse: como usar na introdução ou no desenvolvimento; connections: relações entre repertórios; check: pertinência ao tema; apply: as 5 perguntas de aplicação para um tema; analyzeUse: analisa o uso de um repertório no parágrafo do aluno (produtivo ou decorativo).',
  })
  @IsIn(REPERTOIRE_AI_ACTIONS)
  action: RepertoireAiAction;

  @ApiPropertyOptional({ description: 'Tema da redação (suggest e check).' })
  @IsOptional() @Transform(trim) @IsString() @MinLength(3) @MaxLength(300)
  theme?: string;

  @ApiPropertyOptional({ type: [String], description: 'Repertórios do caderno (explain, howToUse, check: 1; connections: 2 a 4).' })
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'analyzeUse: o parágrafo do aluno (até 3.000 caracteres).' })
  @IsOptional() @IsString() @MinLength(40) @MaxLength(3000)
  paragraph?: string;

  @ApiPropertyOptional({ enum: ['INTRODUCAO', 'DESENVOLVIMENTO'], description: 'howToUse: parte do texto.' })
  @IsOptional() @IsIn(['INTRODUCAO', 'DESENVOLVIMENTO'])
  part?: 'INTRODUCAO' | 'DESENVOLVIMENTO';
}

export const FORMULA_AI_ACTIONS = ['explain', 'example', 'mnemonic'] as const;
export type FormulaAiAction = (typeof FORMULA_AI_ACTIONS)[number];

export class FormulaAiDto {
  @ApiProperty({ enum: FORMULA_AI_ACTIONS, description: 'explain: o que significa e quando usar; example: exercício resolvido; mnemonic: dica para memorizar.' })
  @IsIn(FORMULA_AI_ACTIONS)
  action: FormulaAiAction;

  @ApiProperty()
  @IsUUID()
  id: string;
}
