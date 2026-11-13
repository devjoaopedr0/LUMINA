import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotebookKind } from '@prisma/client';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import {
  CollectionItemsDto,
  CreateCollectionDto,
  CreateFormulaDto,
  CreateRepertoireDto,
  FormulaAiDto,
  ListFormulasQueryDto,
  ListRepertoiresQueryDto,
  RepertoireAiDto,
  UpdateCollectionDto,
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
  @ApiOperation({ summary: 'Busca no caderno de fórmulas (do aluno, do acervo ou ambos), com filtros e ordenação.' })
  list(@CurrentUser() user: UserWithProfile, @Query() query: ListFormulasQueryDto) {
    return this.service.listFormulas(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumo do caderno: totais, disciplinas, recentes e limite do plano.' })
  summary(@CurrentUser() user: UserWithProfile) {
    return this.service.formulaSummary(user.id);
  }

  @Post('ai')
  @ApiOperation({ summary: 'LuminIA: explica a fórmula, cria exercício resolvido ou dica de memorização.' })
  ai(@CurrentUser() user: UserWithProfile, @Body() dto: FormulaAiDto) {
    return this.service.formulaAi(user.id, dto);
  }

  @Get('collections')
  listCollections(@CurrentUser() user: UserWithProfile) {
    return this.service.listCollections(user.id, NotebookKind.FORMULA);
  }

  @Post('collections')
  createCollection(@CurrentUser() user: UserWithProfile, @Body() dto: CreateCollectionDto) {
    return this.service.createCollection(user.id, NotebookKind.FORMULA, dto);
  }

  @Patch('collections/:id')
  updateCollection(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.updateCollection(user.id, NotebookKind.FORMULA, id, dto);
  }

  @Delete('collections/:id')
  deleteCollection(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCollection(user.id, NotebookKind.FORMULA, id);
  }

  @Post('collections/:id/items')
  addItems(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CollectionItemsDto) {
    return this.service.addToCollection(user.id, NotebookKind.FORMULA, id, dto);
  }

  @Delete('collections/:id/items/:itemId')
  removeItem(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.removeFromCollection(user.id, NotebookKind.FORMULA, id, itemId);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFormula(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateFormulaDto) {
    return this.service.createFormula(user.id, dto);
  }

  @Post(':id/copy')
  @ApiOperation({ summary: 'Salva no caderno uma fórmula do acervo da plataforma.' })
  copy(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.copyFormula(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFormulaDto) {
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
  @ApiOperation({ summary: 'Busca no caderno de repertórios (do aluno, do acervo ou ambos), com filtros combináveis e ordenação.' })
  list(@CurrentUser() user: UserWithProfile, @Query() query: ListRepertoiresQueryDto) {
    return this.service.listRepertoires(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumo do caderno: totais, categorias usadas, favoritos, recentes e limite do plano.' })
  summary(@CurrentUser() user: UserWithProfile) {
    return this.service.repertoireSummary(user.id);
  }

  @Post('ai')
  @ApiOperation({ summary: 'LuminIA: sugere, explica, mostra como usar, conecta ou confere a pertinência de repertórios.' })
  ai(@CurrentUser() user: UserWithProfile, @Body() dto: RepertoireAiDto) {
    return this.service.repertoireAi(user.id, dto);
  }

  @Get('collections')
  listCollections(@CurrentUser() user: UserWithProfile) {
    return this.service.listCollections(user.id, NotebookKind.REPERTOIRE);
  }

  @Post('collections')
  createCollection(@CurrentUser() user: UserWithProfile, @Body() dto: CreateCollectionDto) {
    return this.service.createCollection(user.id, NotebookKind.REPERTOIRE, dto);
  }

  @Patch('collections/:id')
  updateCollection(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.updateCollection(user.id, NotebookKind.REPERTOIRE, id, dto);
  }

  @Delete('collections/:id')
  deleteCollection(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCollection(user.id, NotebookKind.REPERTOIRE, id);
  }

  @Post('collections/:id/items')
  addItems(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CollectionItemsDto) {
    return this.service.addToCollection(user.id, NotebookKind.REPERTOIRE, id, dto);
  }

  @Delete('collections/:id/items/:itemId')
  removeItem(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.removeFromCollection(user.id, NotebookKind.REPERTOIRE, id, itemId);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRepertoire(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateRepertoireDto) {
    return this.service.createRepertoire(user.id, dto);
  }

  @Post(':id/copy')
  @HttpCode(201)
  @ApiOperation({ summary: 'Salva no caderno um repertório do acervo da plataforma.' })
  copy(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.copyRepertoire(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRepertoireDto) {
    return this.service.updateRepertoire(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRepertoire(user.id, id);
  }
}

@Module({
  imports: [AiModule],
  controllers: [FormulasController, RepertoiresController],
  providers: [NotebooksService],
})
export class NotebooksModule {}
