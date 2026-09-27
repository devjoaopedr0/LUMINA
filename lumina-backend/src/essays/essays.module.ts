import { Body, Controller, DefaultValuePipe, Get, Module, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { CreateEssayThemeDto, SaveEssayDto } from './essays.dto';
import { EssaysService } from './essays.service';

function checkPage(page: number) {
  if (page < 1 || page > 10000) throw new BadRequestException('Página inválida.');
  return page;
}

@ApiTags('essays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essays')
export class EssaysController {
  constructor(private readonly service: EssaysService) {}
  @Get('themes')
  themes(@CurrentUser() user: UserWithProfile, @Query('year', new ParseIntPipe({ optional: true })) year?: number) {
    if (year && (year < 2011 || year > 2100)) throw new BadRequestException('Ano inválido.');
    return this.service.themes(user.id, year);
  }
  @Post('themes')
  createTheme(@CurrentUser() user: UserWithProfile, @Body() data: CreateEssayThemeDto) { return this.service.createTheme(user.id, data.title); }
  @Post()
  create(@CurrentUser() user: UserWithProfile) { return this.service.create(user.id); }
  @Get()
  list(@CurrentUser() user: UserWithProfile, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) { return this.service.list(user.id, checkPage(page)); }
  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(user.id, id); }
  @Put(':id')
  save(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() data: SaveEssayDto) { return this.service.save(user.id, id, data); }
  @Get(':id/revisions')
  revisions(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) { return this.service.revisions(user.id, id, checkPage(page)); }
  @Get(':id/revisions/:version')
  revision(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) {
    if (version < 1 || version > 2147483647) throw new BadRequestException('Versão inválida.');
    return this.service.revision(user.id, id, version);
  }
  @Get('models/list')
  listEssayModels(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('exam') exam?: string,
    @Query('theme') theme?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.service.listEssayModels({ year, exam, theme, page: checkPage(page), limit: Math.min(50, Math.max(1, limit)) });
  }
  @Get('models/:id')
  getEssayModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEssayModel(id);
  }
}

@Module({ controllers: [EssaysController], providers: [EssaysService] })
export class EssaysModule {}
