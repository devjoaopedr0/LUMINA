import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { AskMaterialsDto, CreateMaterialDto, GenerateQuestionsDto, ListMaterialsQueryDto, SearchMaterialsQueryDto } from './materials.dto';
import { MaterialsService } from './materials.service';

@ApiTags('materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  @Post()
  @ApiOperation({ summary: 'Professor envia um material (PDF até 15 MB, ou link/vídeo) para uma turma ou para a própria biblioteca.' })
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateMaterialDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Materiais visíveis: os próprios e os das turmas do usuário.' })
  list(@CurrentUser() user: UserWithProfile, @Query() query: ListMaterialsQueryDto) {
    return this.service.list(user.id, query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Busca nos materiais: trechos com material e página.' })
  search(@CurrentUser() user: UserWithProfile, @Query() query: SearchMaterialsQueryDto) {
    return this.service.search(user.id, query.q, query.classId);
  }

  @Post('ask')
  @ApiOperation({ summary: 'LuminIA responde com base nos materiais, citando material e página.' })
  ask(@CurrentUser() user: UserWithProfile, @Body() dto: AskMaterialsDto) {
    return this.service.ask(user.id, dto);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Arquivo PDF do material.' })
  async file(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, title } = await this.service.file(id, user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}.pdf"`);
    res.send(buffer);
  }

  @Post(':id/questions')
  @ApiOperation({ summary: 'Gera questões a partir do material para o professor revisar (não salva).' })
  questions(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateQuestionsDto) {
    return this.service.generateQuestions(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove o material (dono ou professor da turma).' })
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, user.id);
  }
}
