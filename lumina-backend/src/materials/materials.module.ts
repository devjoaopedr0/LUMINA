import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PlansModule } from '../plans/plans.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [AiModule, PlansModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
