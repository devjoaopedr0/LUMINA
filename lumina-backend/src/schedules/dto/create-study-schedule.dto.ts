import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { StudyArea, StudyEssayFrequency, StudyTaskStatus } from "@prisma/client";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayNotEmpty,
  ArrayUnique,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsIn,
} from "class-validator";

export class SubjectTargetDto {
  @ApiProperty({ example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01" })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ example: 20, description: "Horas totais planejadas para esta disciplina" })
  @IsNumber()
  @Min(0)
  targetHours: number;
}

/// Tempo de estudo de um dia da semana (onboarding, fase 5 §11).
export class DayMinutesDto {
  @ApiProperty({ example: 1, description: "0=dom, 1=seg, ..., 6=sáb" })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @ApiProperty({ example: 90, description: "Minutos nesse dia; 0 = não estuda" })
  @IsInt()
  @Min(0)
  @Max(1440)
  minutes: number;
}

export class CreateStudyScheduleDto {
  @ApiProperty({ format: "date", example: "2025-01-01" })
  @IsDateString()
  startDate: string;

  @ApiProperty({ format: "date", example: "2025-06-30" })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    example: [0, 1, 2, 3, 4],
    description: "Dias da semana disponíveis (0=dom, 1=seg, ..., 6=sáb)",
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDays: number[];

  @ApiProperty({ example: 120, description: "Minutos por dia" })
  @IsInt()
  @Min(1)
  @Max(1440)
  dailyMinutes: number;

  @ApiProperty({ type: String, nullable: true, example: "Passar no ENEM com 1400+ pontos" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @ApiProperty({
    type: [DayMinutesDto],
    required: false,
    description: "Tempo por dia da semana. Dia de estudo sem entrada aqui usa dailyMinutes.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique((day: DayMinutesDto) => day?.weekday)
  @ValidateNested({ each: true })
  @Type(() => DayMinutesDto)
  dayMinutes?: DayMinutesDto[];

  @ApiProperty({ type: String, nullable: true, required: false, example: "Medicina" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetCourse?: string;

  @ApiProperty({ enum: StudyArea, nullable: true, required: false })
  @IsOptional()
  @IsEnum(StudyArea)
  priorityArea?: StudyArea;

  @ApiProperty({ enum: StudyEssayFrequency, nullable: true, required: false })
  @IsOptional()
  @IsEnum(StudyEssayFrequency)
  essayFrequency?: StudyEssayFrequency;

  @ApiProperty({ type: [SubjectTargetDto], description: "Disciplinas e horas-alvo" })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((subject: SubjectTargetDto) => subject?.subjectId)
  @ValidateNested({ each: true })
  @Type(() => SubjectTargetDto)
  subjects: SubjectTargetDto[];
}

export class UpdateStudyScheduleDto {
  @ApiProperty({ format: "date", required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ format: "date", required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDays?: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyMinutes?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @ApiProperty({
    type: [DayMinutesDto],
    required: false,
    description: "Tempo por dia da semana. Dia de estudo sem entrada aqui usa dailyMinutes.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique((day: DayMinutesDto) => day?.weekday)
  @ValidateNested({ each: true })
  @Type(() => DayMinutesDto)
  dayMinutes?: DayMinutesDto[];

  @ApiProperty({ type: String, nullable: true, required: false, example: "Medicina" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetCourse?: string;

  @ApiProperty({ enum: StudyArea, nullable: true, required: false })
  @IsOptional()
  @IsEnum(StudyArea)
  priorityArea?: StudyArea;

  @ApiProperty({ enum: StudyEssayFrequency, nullable: true, required: false })
  @IsOptional()
  @IsEnum(StudyEssayFrequency)
  essayFrequency?: StudyEssayFrequency;

  @ApiProperty({ type: [SubjectTargetDto], required: false, description: "Substitui as disciplinas do cronograma" })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((subject: SubjectTargetDto) => subject?.subjectId)
  @ValidateNested({ each: true })
  @Type(() => SubjectTargetDto)
  subjects?: SubjectTargetDto[];
}

export class CreateStudyTaskDto {
  @ApiProperty({ example: "b0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00" })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01", nullable: true })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiProperty({ example: "Resolver 10 questões de Funções" })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 45 })
  @IsInt()
  @Min(0)
  @Max(1440)
  scheduledMinutes: number;
}

export class UpdateStudyTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ["PENDING", "IN_PROGRESS", "DONE"], required: false })
  @IsOptional()
  @IsEnum(StudyTaskStatus)
  status?: StudyTaskStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  scheduledMinutes?: number;

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  notes?: string | null;
}

export class RescheduleTaskDto {
  @ApiProperty({ example: "b0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00" })
  @IsUUID()
  sessionId: string;
}

export class TimeLogDto {
  @ApiProperty({ type: String, nullable: true, example: "2025-01-15T14:30:00Z" })
  startTime?: string;

  @ApiProperty({ type: String, nullable: true, example: "2025-01-15T15:30:00Z" })
  endTime?: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMinutes: number;
}

/// Registro de tempo do cronômetro, que é por MATÉRIA e não por subtópico.
export class SubjectTimeLogDto {
  @ApiProperty({
    example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01",
    description: "Disciplina (matéria) que está sendo estudada",
  })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ example: 45 })
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes: number;
}

export class SetVestibularDto {
  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00", nullable: true })
  @IsOptional()
  @IsUUID()
  examId?: string;

  @ApiProperty({ type: String, nullable: true, example: "ENEM 2025" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customName?: string | null;

  @ApiProperty({ format: "date", nullable: true, example: "2025-01-15" })
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export const REPLAN_STRATEGIES = ["TOMORROW", "SATURDAY", "AUTO", "SKIP"] as const;
export type ReplanStrategy = (typeof REPLAN_STRATEGIES)[number];

/// Replanejamento de uma tarefa não feita (fase 4, §12).
export class ReplanTaskDto {
  @ApiProperty({
    enum: REPLAN_STRATEGIES,
    description:
      "TOMORROW: próximo dia de estudo. SATURDAY: próximo sábado. AUTO: encaixa no " +
      "próximo dia redistribuindo o tempo das outras matérias. SKIP: não fazer.",
  })
  @IsIn(REPLAN_STRATEGIES)
  strategy: ReplanStrategy;

  @ApiProperty({ format: "date", required: false, description: "Hoje no fuso do aluno" })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    required: false,
    description: "Só para AUTO: false devolve a prévia sem gravar; true aplica.",
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}