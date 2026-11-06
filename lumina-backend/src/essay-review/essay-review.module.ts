import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { EssayLearningController, EssayReviewController, EssayReviewQueueController } from './essay-review.controller';
import { EssayReviewService } from './essay-review.service';

/**
 * Item 21: revisão humana colaborativa da correção de redação, chat
 * contextual, aprendizados estruturados e trilha de auditoria.
 */
@Module({
  imports: [AiModule],
  controllers: [EssayReviewController, EssayReviewQueueController, EssayLearningController],
  providers: [EssayReviewService],
  exports: [EssayReviewService],
})
export class EssayReviewModule {}
