import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export type Db = PrismaService | Prisma.TransactionClient;

export interface SessionAllocation {
  date: Date;
  scheduledMinutes: number;
  subjectAllocations: { subjectId: string; estimatedMinutes: number }[];
}
