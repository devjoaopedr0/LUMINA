import { Module } from "@nestjs/common";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";
import { SchedulesRepository } from "./schedules.repository";
import { ScheduleGeneratorService } from "./schedule-generator.service";

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulesRepository, ScheduleGeneratorService],
  exports: [SchedulesService, SchedulesRepository],
})
export class SchedulesModule {}
