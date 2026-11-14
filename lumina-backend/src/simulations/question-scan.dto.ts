import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Foto da questão já reduzida no aparelho (JPEG, PNG ou WebP, até 3 MB). */
export class QuestionScanCompleteDto {
  @ApiProperty({ description: 'Imagem como data URL base64.' })
  @IsString()
  @Matches(/^data:image\/(jpeg|png|webp);base64,/, { message: 'Envie a foto como imagem JPEG, PNG ou WebP.' })
  @MaxLength(4_200_000)
  fileUrl!: string;

  @ApiProperty()
  @IsInt() @Min(1) @Max(20000)
  width!: number;

  @ApiProperty()
  @IsInt() @Min(1) @Max(20000)
  height!: number;

  @ApiProperty()
  @IsInt() @Min(1)
  sizeBytes!: number;
}
