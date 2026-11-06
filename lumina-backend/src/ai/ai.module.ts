import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TopicLessonsService } from './topic-lessons.service';

@Module({
  imports: [SchedulesModule, QuestionsModule],
  controllers: [AiController],
  providers: [AiService, TopicLessonsService],
  exports: [AiService],
})
export class AiModule {}
