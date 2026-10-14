import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveEssayDto {
  @ApiProperty({ description: 'Versão lida pelo editor, para detectar conflitos.' })
  @IsInt() @Min(0) @Max(2147483646)
  version: number;

  @ApiProperty({ maxLength: 160 })
  @IsString() @MaxLength(160)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString() @MaxLength(300)
  theme: string;

  @ApiProperty({ maxLength: 30000 })
  @IsString() @MaxLength(30000)
  content: string;
}

export function countWords(text: string) {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export const ESSAY_THEMES = [
  'Desafios para ampliar o acesso à leitura no Brasil',
  'O papel da educação no combate à desinformação',
  'Caminhos para reduzir o desperdício de alimentos',
  'A valorização dos espaços públicos nas cidades brasileiras',
  'Desafios da inclusão digital entre diferentes gerações',
];

export class CreateEssayThemeDto {
  @ApiProperty({ maxLength: 300 })
  @IsString() @MinLength(10) @MaxLength(300)
  title: string;
}
