import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import {
  CreateFormulaDto,
  CreateRepertoireDto,
  UpdateFormulaDto,
  UpdateRepertoireDto,
} from './notebooks.dto';
import { NotebooksService } from './notebooks.service';

@ApiTags('formulas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('formulas')
export class FormulasController {
  constructor(private readonly service: NotebooksService) {}

  @Get()
  list(@CurrentUser() user: UserWithProfile) {
    return this.service.listFormulas(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFormula(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateFormulaDto) {
    return this.service.createFormula(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormulaDto,
  ) {
    return this.service.updateFormula(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteFormula(user.id, id);
  }
}

@ApiTags('repertoires')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('repertoires')
export class RepertoiresController {
  constructor(private readonly service: NotebooksService) {}

  @Get()
  list(@CurrentUser() user: UserWithProfile) {
    return this.service.listRepertoires(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRepertoire(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateRepertoireDto) {
    return this.service.createRepertoire(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserWithProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRepertoireDto,
  ) {
    return this.service.updateRepertoire(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRepertoire(user.id, id);
  }
}

@Module({
  controllers: [FormulasController, RepertoiresController],
  providers: [NotebooksService],
})
export class NotebooksModule {}
