import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Min, Max, ValidateIf, IsDefined } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { MentalMathService } from './mental-math.service';

export class StartMathDto {
  @IsIn(['free', 'daily'])
  mode: 'free' | 'daily';
}
export class AnswerMathDto {
  @IsInt() @Min(0) @Max(10)
  version: number;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined() @IsInt() @Min(-100000) @Max(100000)
  answer: number | null;
}

@ApiTags('mental-math')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mental-math')
export class MentalMathController {
  constructor(private readonly service: MentalMathService) {}
  @Post('sessions')
  start(@CurrentUser() user: UserWithProfile, @Body() body: StartMathDto) { return this.service.start(user.id, body.mode); }
  @Get('history')
  history(@CurrentUser() user: UserWithProfile) { return this.service.history(user.id); }
  @Get('sessions/:id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(user.id, id); }
  @Post('sessions/:id/answers')
  answer(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() body: AnswerMathDto) { return this.service.answer(user.id, id, body.version, body.answer); }
}

@Module({ controllers: [MentalMathController], providers: [MentalMathService] })
export class MentalMathModule {}
