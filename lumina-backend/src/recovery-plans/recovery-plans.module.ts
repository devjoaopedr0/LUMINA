import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { RecoveryPlansController } from './recovery-plans.controller';
import { RecoveryPlansService } from './recovery-plans.service';

@Module({
  imports: [QuestionsModule],
  controllers: [RecoveryPlansController],
  providers: [RecoveryPlansService],
})
export class RecoveryPlansModule {}
