import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { CheckAnswersDto, CreateAnswerKeyDto, ListAnswerKeysQuery, ReviseAnswerKeyDto, SetAnswerKeyStatusDto } from './answer-keys.dto';
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
  @Put(':id/items') revise(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviseAnswerKeyDto) { return this.service.revise(viewer(user), id, dto); }
  @Patch(':id/status') setStatus(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAnswerKeyStatusDto) { return this.service.setStatus(viewer(user), id, dto.status); }
  @Post(':id/checks') check(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckAnswersDto) { return this.service.check(viewer(user), id, dto); }
}

@Module({
  controllers: [AnswerKeysController],
  providers: [AnswerKeysService],
})
export class AnswerKeysModule {}
