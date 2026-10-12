import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [SchedulesModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
