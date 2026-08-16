import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SubjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SubjectWithTopicsDto extends SubjectResponseDto {
  @ApiProperty({ type: () => [TopicResponseDto] })
  topics: TopicResponseDto[];
}

export class TopicResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  subjectId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedExamsDto {
  @ApiProperty({ type: () => [ExamResponseDto] })
  items: ExamResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  limit: number;
}

export class ExamResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  year: number | null;

  @ApiProperty({ nullable: true })
  institution: string | null;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ExamIdParamsDto {
  @ApiProperty()
  @IsUUID('4')
  id: string;
}

export class SubjectIdParamsDto {
  @ApiProperty()
  @IsUUID('4')
  id: string;
}
