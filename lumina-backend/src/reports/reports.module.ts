import { Module } from '@nestjs/common';
import { InstitutionalAnalyticsModule } from '../institutional-analytics/institutional-analytics.module';
import { QuestionsModule } from '../questions/questions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [InstitutionalAnalyticsModule, QuestionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
