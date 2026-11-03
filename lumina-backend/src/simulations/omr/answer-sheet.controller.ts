import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserWithProfile } from '../../users/users.repository';
import { AnswerSheetScanService } from './answer-sheet-scan.service';

export class PrepareSheetsDto {
  @ApiPropertyOptional({ description: 'Alunos da turma para folhas personalizadas (padrão: todos). Só professor/autor.', type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true })
  studentIds?: string[];
}

export class ScanAnswerSheetDto {
  @ApiProperty({ description: 'PDF das folhas digitalizadas (uma por página), como data URL application/pdf, até 25 MB.' })
  @IsString() @MaxLength(35_000_000)
  pdf: string;

  @ApiPropertyOptional({ description: 'Simulado esperado: confere com o código da folha e serve de reserva se o código estiver ilegível.' })
  @IsOptional() @IsUUID()
  simulationId?: string;
}

class ReviewAnswerDto {
  @IsInt() @Min(1) @Max(180) number: number;
  @ApiProperty({ description: '1 = A … 5 = E; 0 = em branco/anulada.' })
  @IsInt() @Min(0) @Max(5) selected: number;
}

export class ReviewAnswerSheetDto {
  @ApiProperty({ type: [ReviewAnswerDto] })
  @IsArray() @ArrayMaxSize(180) @ValidateNested({ each: true }) @Type(() => ReviewAnswerDto)
  answers: ReviewAnswerDto[];
}

@ApiTags('answer-sheets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('answer-sheets')
export class AnswerSheetController {
  constructor(private readonly service: AnswerSheetScanService) {}

  @Post('simulations/:simulationId/sheets')
  prepare(@CurrentUser() user: UserWithProfile, @Param('simulationId', ParseUUIDPipe) simulationId: string, @Body() dto: PrepareSheetsDto) {
    return this.service.prepareSheets(user.id, simulationId, dto.studentIds);
  }

  @Post('scan')
  @HttpCode(200)
  scan(@CurrentUser() user: UserWithProfile, @Body() dto: ScanAnswerSheetDto) {
    return this.service.scan(user.id, dto);
  }

  @Get('scans')
  list(@CurrentUser() user: UserWithProfile, @Query('simulationId', new ParseUUIDPipe({ optional: true })) simulationId?: string) {
    return this.service.list(user.id, simulationId);
  }

  @Get('scans/:id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getScan(user.id, id);
  }

  @Get('scans/:id/image')
  async image(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const image = await this.service.getImage(user.id, id);
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(image.bytes);
  }

  @Get('batches/:id/pdf')
  async pdf(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.service.getBatchPdf(user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cartoes-${id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  }

  @Post('batches/:id/confirm')
  @HttpCode(200)
  confirmBatch(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirmBatch(user.id, id);
  }

  @Post('batches/:id/finalize')
  @HttpCode(200)
  finalizeBatch(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.finalizeBatch(user.id, id);
  }

  @Post('scans/:id/finalize')
  @HttpCode(200)
  finalize(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.finalizeScan(user.id, id);
  }

  @Post('scans/:id/review')
  review(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewAnswerSheetDto) {
    return this.service.review(user.id, id, dto.answers);
  }
}
