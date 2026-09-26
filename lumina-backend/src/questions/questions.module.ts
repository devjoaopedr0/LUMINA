import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CsvQuestionNormalizer } from './import/csv-question.normalizer';
import { EnemImportService } from './import/enem/enem-import.service';
import { JsonQuestionNormalizer } from './import/json-question.normalizer';
import { QuestionDeduplicator } from './import/question-deduplicator';
import { QuestionImportService } from './import/question-import.service';
import { QuestionValidator } from './import/question-validator';
import { ExamsRepository } from './exams.repository';
import { QuestionAccessService } from './question-access.service';
import { QuestionAttemptsRepository } from './question-attempts.repository';
import { QuestionCatalogService } from './question-catalog.service';
import { QuestionCatalogController } from './question-catalog.controller';
import { QuestionPerformanceService } from './question-performance.service';
import { QuestionPerformanceController } from './question-performance.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';
import { QuestionTextSearchRepository } from './question-text-search.repository';
import { SubjectsRepository } from './subjects.repository';
import { UserQuestionProgressRepository } from './user-question-progress.repository';
import {
  createDefaultHintProvider,
  QUESTION_HINTS_PROVIDER,
  QuestionHintsService,
} from './hints/question-hints.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [
    QuestionsController,
    QuestionCatalogController,
    QuestionPerformanceController,
  ],
  exports: [
    QuestionAccessService,
    QuestionsService,
    QuestionsRepository,
    QuestionImportService,
    QuestionTextSearchRepository,
  ],
  providers: [
    QuestionsService,
    QuestionsRepository,
    QuestionAttemptsRepository,
    UserQuestionProgressRepository,
    QuestionTextSearchRepository,
    SubjectsRepository,
    ExamsRepository,
    QuestionAccessService,
    QuestionCatalogService,
    QuestionPerformanceService,
    QuestionValidator,
    QuestionDeduplicator,
    JsonQuestionNormalizer,
    CsvQuestionNormalizer,
    QuestionImportService,
    EnemImportService,
    QuestionHintsService,
    // O provedor de dicas é trocável por token: para plugar um modelo de
    // linguagem basta registrar outro HintProvider aqui.
    { provide: QUESTION_HINTS_PROVIDER, useFactory: createDefaultHintProvider },
  ],
})
export class QuestionsModule {}
