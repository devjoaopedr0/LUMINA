import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { EssayCorrectionController, EssayCorrectionQuotaController, EssayScanController } from './essay-correction.controller';
import { EssayCorrectionService } from './essay-correction.service';

/**
 * Correção de redação por foto (scanner) e por texto: digitalização no
 * aparelho, leitura por visão, revisão do aluno e correção pelas cinco
 * competências com RAG da cartilha do Inep servido por MCP.
 */
@Module({
  imports: [AiModule],
  controllers: [EssayScanController, EssayCorrectionController, EssayCorrectionQuotaController],
  providers: [EssayCorrectionService],
  exports: [EssayCorrectionService],
})
export class EssayCorrectionModule {}
