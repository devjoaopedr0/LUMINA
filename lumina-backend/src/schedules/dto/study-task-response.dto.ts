import { ApiProperty } from "@nestjs/swagger";
import { StudyTaskStatus } from "@prisma/client";

export class StudyTaskResponseDto {
  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e9f" })
  id: string;

  @ApiProperty({ example: "c0a80121-7b3e-4f8a-9d4f-8a3b2c1d0eff" })
  scheduleId: string;

  @ApiProperty({ example: "b0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e00" })
  sessionId: string;

  @ApiProperty({ type: String, nullable: true, example: "a0a80121-7b3e-4f8a-9d4f-8a3b2c1d0e01" })
  subjectId: string | null;

  @ApiProperty({ example: "Resolver 10 questões de Funções" })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: "Questões de função afim e exponencial" })
  description: string | null;

  @ApiProperty({ enum: StudyTaskStatus, example: StudyTaskStatus.PENDING })
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
