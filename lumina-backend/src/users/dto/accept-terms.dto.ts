import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AcceptTermsDto {
  @ApiProperty({ example: '2026-11-17', description: 'Versão dos Termos que o usuário leu e aceitou.' })
  @IsString()
  @MaxLength(20)
  version: string;
}
