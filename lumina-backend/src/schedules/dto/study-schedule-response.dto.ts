import { ApiProperty } from "@nestjs/swagger";
import { StudyTaskStatus } from "@prisma/client";

export class StudySubjectResponseDto {
  @ApiProperty({ example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01" })
  id: string;

  @ApiProperty({ example: "Matemática" })
  name: string;

  @ApiProperty({ example: "MATH" })
  code: string;

  @ApiProperty({ example: 1 })
  displayOrder: number;
}

export class StudyTaskResponseDto {
  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e9f" })
  id: string;

  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0eff" })
  scheduleId: string;

  @ApiProperty({ example: "b0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00" })
  sessionId: string;

  @ApiProperty({ type: String, nullable: true, example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01" })
  subjectId: string | null;

  @ApiProperty({ example: "Matemática: estudo programado" })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: "Conteúdo de Matemática" })
  description: string | null;

  @ApiProperty({ enum: StudyTaskStatus, example: "PENDING" })
  status: StudyTaskStatus;

  @ApiProperty({ example: 45 })
  scheduledMinutes: number;

  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  completedAt: Date | null;

  @ApiProperty({ type: String, nullable: true, example: "Revisar dúvidas com o Professor" })
  notes: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt: Date;

  @ApiProperty({ type: String, nullable: true, example: "Matemática" })
  subjectName?: string;

  @ApiProperty({ type: Number, nullable: true, example: 30 })
  loggedMinutes?: number;
}

export class StudyProgressDto {
  @ApiProperty({ example: 75.5 })
  completionPercentage: number;

  @ApiProperty({ example: 1200 })
  completedMinutes: number;

  @ApiProperty({ example: 2000 })
  totalScheduledMinutes: number;

  @ApiProperty({ example: 5 })
  streakDays: number;

  @ApiProperty({ example: "2025-01-18" })
  lastStudyDate: Date | null;

  @ApiProperty({ example: 42 })
  completedTasks: number;

  @ApiProperty({ example: 80 })
  totalTasks: number;
}

export class StudyScheduleResponseDto {
  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0eff" })
  id: string;

  @ApiProperty({ example: "9b3a7f12-4e8c-4f9d-b3a6-2d1e0f9a8b7c" })
  userId: string;

  @ApiProperty({ format: "date", example: "2025-01-01" })
  startDate: Date;

  @ApiProperty({ format: "date", example: "2025-06-30" })
  endDate: Date;

  @ApiProperty({ example: [0, 1, 2, 3, 4] })
  studyDays: number[];

  @ApiProperty({ example: 120 })
  dailyMinutes: number;

  @ApiProperty({ type: String, nullable: true, example: "Passar no ENEM com 1400+ pontos" })
  objective: string | null;

  @ApiProperty({ example: "ACTIVE" })
  status: string;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt: Date;
}

export class StudySessionResponseDto {
  @ApiProperty({ example: "b0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00" })
  id: string;

  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0eff" })
  scheduleId: string;

  @ApiProperty({ format: "date", example: "2025-01-15" })
  date: Date;

  @ApiProperty({ example: 180 })
  scheduledMinutes: number;

  @ApiProperty({ type: StudyTaskResponseDto, isArray: true })
  tasks: StudyTaskResponseDto[];

  @ApiProperty({ type: StudySubjectResponseDto, isArray: true })
  subjects: StudySubjectResponseDto[];
}

export class ProgressEvolutionPointDto {
  @ApiProperty({ format: "date", example: "2025-01-15" })
  date: string;

  @ApiProperty({ example: 180 })
  studyMinutes: number;

  @ApiProperty({ example: 5 })
  completedTasks: number;
}

export class PaginatedStudyTasksDto {
  @ApiProperty({ type: StudyTaskResponseDto, isArray: true })
  items: StudyTaskResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
