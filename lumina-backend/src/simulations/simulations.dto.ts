import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClassDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
}

export class JoinClassDto {
  @IsString() @IsNotEmpty() @MaxLength(12)
  joinCode!: string;
}

export class CreateSimulationDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  title!: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(90) @IsUUID('4', { each: true })
  questionIds!: string[];
}

export class SimulationAnswerDto {
  @IsInt() @Min(1) @Max(90)
  position!: number;
  @IsInt() @Min(1) @Max(5)
  selectedPosition!: number;
}

export class SubmitSimulationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(90) @ValidateNested({ each: true }) @Type(() => SimulationAnswerDto)
  answers!: SimulationAnswerDto[];
}
