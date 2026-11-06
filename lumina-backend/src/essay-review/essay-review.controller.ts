import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EssayReviewStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import {
  CreateEssayLearningDto,
  EssayReviewChatDto,
  EssayReviewQueueQueryDto,
  SubmitEssayReviewDto,
  ValidateEssayReviewDto,
} from './essay-review.dto';
import { EssayReviewService } from './essay-review.service';

@ApiTags('essay-review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essays')
export class EssayReviewController {
  constructor(private readonly service: EssayReviewService) {}

  /** Área de revisão: redação, correção da IA, revisões, chat e aprendizados. */
  @Get(':id/review')
  workspace(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getWorkspace(user, id);
  }

  /** Chat contextual por competência, com RAG oficial e exemplos validados. */
  @Post(':id/review/chat')
  chat(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EssayReviewChatDto,
  ) {
    return this.service.chat(user, id, dto);
  }

  /** Registra uma lição explicitamente, sem esperar a submissão da revisão. */
  @Post(':id/review/learning')
  createLearning(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEssayLearningDto,
  ) {
    return this.service.createLearning(user, id, dto);
  }

  /** Submete a revisão humana por competência. */
  @Post(':id/reviews')
  submit(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitEssayReviewDto,
  ) {
    return this.service.submitReview(user, id, dto);
  }

  @Get(':id/reviews')
  list(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getWorkspace(user, id).then((workspace) => workspace.reviews);
  }
}

@ApiTags('essay-review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essay-reviews')
export class EssayReviewQueueController {
  constructor(private readonly service: EssayReviewService) {}

  @Get('queue')
  queue(@CurrentUser() user: UserWithProfile, @Query() query: EssayReviewQueueQueryDto) {
    return this.service.queue(user, query.status as EssayReviewStatus | undefined);
  }

  @Get('divergences')
  divergences(@CurrentUser() user: UserWithProfile) {
    return this.service.divergences(user);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getReview(user, id);
  }

  @Get(':id/audit')
  audit(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAudit(user, id);
  }

  @Post(':id/validate')
  validate(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateEssayReviewDto,
  ) {
    return this.service.validateReview(user, id, dto);
  }
}

@ApiTags('essay-review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essay-learning')
export class EssayLearningController {
  constructor(private readonly service: EssayReviewService) {}

  @Post(':id/validate')
  validate(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateEssayReviewDto,
  ) {
    return this.service.validateLearning(user, id, dto);
  }

  @Delete(':id')
  archive(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLearning(user, id);
  }
}
