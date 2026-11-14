import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TopicLessonsService } from './topic-lessons.service';
import { SimilarQuestionController } from './similar-question.controller';
import { SimilarQuestionService } from './similar-question.service';
import { VideoLessonsService } from './video-lessons.service';

@Module({
  imports: [SchedulesModule, QuestionsModule],
  controllers: [AiController, SimilarQuestionController],
  providers: [AiService, TopicLessonsService, SimilarQuestionService, VideoLessonsService],
  exports: [AiService],
})
export class AiModule {}
