import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, Max, ValidateNested } from 'class-validator';
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

  @IsOptional() @IsIn(['ACTIVITY', 'LIST', 'TEST', 'SIMULATION'])
  assessmentType?: 'ACTIVITY' | 'LIST' | 'TEST' | 'SIMULATION';

  @IsOptional() @IsDateString()
  dueAt?: string;

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


export class CreateAcademicPeriodDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;
  @IsDateString()
  startsAt!: string;
  @IsDateString()
  endsAt!: string;
}

export class UpdateAcademicPeriodDto {
  @IsOptional() @IsBoolean()
  active?: boolean;
}


export class UpdateInstitutionMemberDto {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
  @IsOptional() @IsIn(['TEACHER', 'COORDINATOR'])
  accountType?: 'TEACHER' | 'COORDINATOR';
  @IsOptional() @IsString() @MaxLength(120)
  subject?: string;
}


export class UpdateClassDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500)
  maxStudents?: number | null;
  @IsOptional() @IsUUID()
  subjectId?: string | null;
  @IsOptional() @IsUUID()
  academicPeriodId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(12)
  gradeYear?: number | null;
}

export class ArchiveClassDto {
  @IsBoolean()
  archived!: boolean;
}

export class ClassMemberEmailDto {
  @IsString() @IsNotEmpty() @MaxLength(254)
  email!: string;
}
