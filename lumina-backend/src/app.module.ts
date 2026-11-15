import { join } from 'node:path';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DatabaseModule } from './database/prisma.module';
import { QuestionsModule } from './questions/questions.module';
import { SchedulesModule } from './schedules/schedules.module';
import { MentalMathModule } from './mental-math/mental-math.module';
import { EssaysModule } from './essays/essays.module';
import { EssayCorrectionModule } from './essay-correction/essay-correction.module';
import { EssayReviewModule } from './essay-review/essay-review.module';
import { SimulationsModule } from './simulations/simulations.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { SearchModule } from './search/search.module';
import { validateEnv } from './config/env.validation';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { AiModule } from './ai/ai.module';
import { CutoffsModule } from './cutoffs/cutoffs.module';
import { NotebooksModule } from './notebooks/notebooks.module';
import { AnswerKeysModule } from './answer-keys/answer-keys.module';
import { InstitutionalAnalyticsModule } from './institutional-analytics/institutional-analytics.module';
import { RecoveryPlansModule } from './recovery-plans/recovery-plans.module';
import { PlansModule } from './plans/plans.module';
import { GroupsModule } from './groups/groups.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Ancorado em __dirname (não em process.cwd()) — o default do
      // ConfigModule resolve `.env` relativo ao cwd do processo que
      // invocou o Node, que varia conforme a ferramenta usada pra rodar
      // (ex: `npm run --prefix`), e silenciosamente falha ao achar o
      // arquivo se o cwd não for a raiz do projeto.
      envFilePath: join(__dirname, '..', '.env'),
    }),
    DatabaseModule,
    PlansModule,
    GroupsModule,
    UsersModule,
    AuthModule,
    WorkspacesModule,
    InstitutionsModule,
    QuestionsModule,
    SchedulesModule,
    MentalMathModule,
    EssaysModule,
    EssayCorrectionModule,
    EssayReviewModule,
    SimulationsModule,
    SearchModule,
    AiModule,
    CutoffsModule,
    NotebooksModule,
    AnswerKeysModule,
    InstitutionalAnalyticsModule,
    RecoveryPlansModule,
  ],
  providers: [
    RateLimitMiddleware,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Defesa extra: garante que @Exclude/@Expose (ver UserResponseDto) seja
    // respeitado mesmo se algum handler futuro devolver uma instância sem
    // passar pelo mapeamento manual do UsersService.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
