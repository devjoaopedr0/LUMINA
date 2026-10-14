import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { GoogleCseSearchProvider } from './google-cse.provider';
import { DemoWebSearchProvider } from './demo-search.provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Módulo de busca de questões na web (item 10 do inventário).
 *
 * O SearchService seleciona o provedor ativo: Google CSE quando as chaves
 * GOOGLE_CSE_ID/GOOGLE_CSE_API_KEY existem; caso contrário, o provedor
 * demo (busca no banco Lumina acessível, sempre sinalizado como demo no
 * response). O save reusa o pipeline real de importação de questões
 * (validação, deduplicação, atribuição de catálogo), marcando a fonte
 * original (IMPORTED) com sourceName/sourceId sempre preservados. */
@Module({
  imports: [QuestionsModule],
  controllers: [SearchController],
  providers: [SearchService, GoogleCseSearchProvider, DemoWebSearchProvider],
  exports: [SearchService],
})
export class SearchModule {}
