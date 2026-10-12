import { Module } from "@nestjs/common";
import { CutoffsModule } from "../cutoffs/cutoffs.module";
import { QuestionsModule } from "../questions/questions.module";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";
import { SchedulesRepository } from "./schedules.repository";
import { ScheduleGeneratorService } from "./schedule-generator.service";
import { ScheduleInsightsService } from "./schedule-insights.service";

@Module({
  imports: [QuestionsModule, CutoffsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulesRepository, ScheduleGeneratorService, ScheduleInsightsService],
  exports: [SchedulesService, SchedulesRepository, ScheduleInsightsService],
})
export class SchedulesModule {}
