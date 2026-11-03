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
import { QuestionCalibrationService } from './question-calibration.service';
import { QuestionCatalogService } from './question-catalog.service';
import { QuestionCatalogController } from './question-catalog.controller';
import { QuestionPerformanceService } from './question-performance.service';
import { QuestionPerformanceController } from './question-performance.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';
import { QuestionTextSearchRepository } from './question-text-search.repository';
import { ErrorNotebookController } from './error-notebook.controller';
import { ErrorNotebookRepository } from './error-notebook.repository';
import { ErrorNotebookService } from './error-notebook.service';
import { SubjectsRepository } from './subjects.repository';
import { TopicMasteryController } from './topic-mastery.controller';
import { TopicMasteryService } from './topic-mastery.service';
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
    ErrorNotebookController,
    TopicMasteryController,
  ],
  exports: [
    QuestionAccessService,
    QuestionsService,
    QuestionsRepository,
    QuestionImportService,
    QuestionTextSearchRepository,
    ErrorNotebookService,
    TopicMasteryService,
    QuestionCalibrationService,
  ],
  providers: [
    QuestionsService,
    QuestionsRepository,
    QuestionAttemptsRepository,
    UserQuestionProgressRepository,
    ErrorNotebookRepository,
    ErrorNotebookService,
    TopicMasteryService,
    QuestionTextSearchRepository,
    SubjectsRepository,
    ExamsRepository,
    QuestionAccessService,
    QuestionCatalogService,
    QuestionCalibrationService,
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
