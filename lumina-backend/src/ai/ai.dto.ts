import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsArray, ValidateNested, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

export class AiChatRequestDto {
  @ApiProperty({ type: AiChatMessageDto })
  @ValidateNested()
  @Type(() => AiChatMessageDto)
  message!: AiChatMessageDto;

  @ApiProperty({ type: [AiChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  history!: AiChatMessageDto[];
}

export class AiChatResponseDto {
  @ApiProperty()
  message!: string;
}