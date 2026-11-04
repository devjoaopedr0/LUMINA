import { Body, Controller, Delete, Get, Module, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QuestionsModule } from '../questions/questions.module';
import { UserWithProfile } from '../users/users.repository';
import { EnemImportService } from '../questions/import/enem/enem-import.service';
import { CheckAnswersDto, CommunityContributionDto, CreateAnswerKeyDto, ImportInepAnswerKeyDto, ListAnswerKeysQuery, ReadAnswerSheetDto, ReviseAnswerKeyDto, SetAnswerKeyStatusDto } from './answer-keys.dto';
import { AnswerKeysService } from './answer-keys.service';

const viewer = (user: UserWithProfile) => ({ id: user.id, accountType: user.accountType });

/** Gabarito Inteligente: gabaritos oficiais e de professor, conferência e desempenho. */
@ApiTags('answer-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('answer-keys')
export class AnswerKeysController {
  constructor(private readonly service: AnswerKeysService) {}

  @Get() list(@CurrentUser() user: UserWithProfile, @Query() query: ListAnswerKeysQuery) { return this.service.list(viewer(user), query); }
  @Get('exams') exams() { return this.service.exams(); }
  @Get('performance') performance(@CurrentUser() user: UserWithProfile) { return this.service.performance(viewer(user)); }
  @Get('checks/:checkId') getCheck(@CurrentUser() user: UserWithProfile, @Param('checkId', ParseUUIDPipe) checkId: string) { return this.service.getCheck(viewer(user), checkId); }
  @Get(':id') get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('answers') answers?: string) { return this.service.get(viewer(user), id, answers === 'true'); }
  @Post() create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateAnswerKeyDto) { return this.service.create(viewer(user), dto); }
  @Post('community/contributions') contribute(@CurrentUser() user: UserWithProfile, @Body() dto: CommunityContributionDto) { return this.service.contribute(viewer(user), dto); }
  @Delete(':id/votes/:userId') removeVotes(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.service.removeVotes(viewer(user), id, userId); }
  @Post('import/inep') importInep(@CurrentUser() user: UserWithProfile, @Body() dto: ImportInepAnswerKeyDto) { return this.service.importFromInep(viewer(user), dto); }
  @Put(':id/items') revise(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviseAnswerKeyDto) { return this.service.revise(viewer(user), id, dto); }
  @Patch(':id/status') setStatus(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAnswerKeyStatusDto) { return this.service.setStatus(viewer(user), id, dto.status); }
  @Get(':id/stats') stats(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.stats(viewer(user), id); }
  @Post(':id/link-questions') linkQuestions(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.linkQuestions(viewer(user), id); }
  @Get(':id/questions/:number/explanation') explain(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('number', ParseIntPipe) number: number,
    @Query('selected') selected?: string,
    @Query('language') language?: string,
  ) {
    const parsed = selected === undefined || selected === '' ? null : Number(selected);
    return this.service.explainQuestion(viewer(user), id, number, parsed, language || null);
  }
  @Get(':id/sheet') sheet(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.sheet(viewer(user), id); }
  @Post(':id/read-sheet') readSheet(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReadAnswerSheetDto) { return this.service.readSheet(viewer(user), id, dto.pdf); }
  @Post(':id/checks') check(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckAnswersDto) { return this.service.check(viewer(user), id, dto); }
}

@Module({
  imports: [AiModule, QuestionsModule],
  controllers: [AnswerKeysController],
  providers: [AnswerKeysService, EnemImportService],
})
export class AnswerKeysModule {}
