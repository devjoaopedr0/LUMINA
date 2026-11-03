import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { EssayCorrectionService } from './essay-correction.service';

export class CreateEssayScanDto {
  @ApiProperty({ description: 'Páginas já digitalizadas no aparelho, como data URL (JPEG, PNG ou WebP, até 3 MB cada).', type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(4_300_000, { each: true })
  pages: string[];

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  theme?: string;
}

export class ConfirmEssayScanDto {
  @ApiProperty({ description: 'Texto conferido pelo aluno (pode ter sido corrigido na revisão).', maxLength: 20000 })
  @IsString() @MinLength(1) @MaxLength(20000)
  text: string;

  @ApiProperty({ description: 'Tema da proposta — necessário para avaliar fuga e tangenciamento.', maxLength: 300 })
  @IsString() @MinLength(3) @MaxLength(300)
  theme: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @IsString() @MaxLength(160)
  title?: string;
}

@ApiTags('essay-scans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essay-scans')
export class EssayScanController {
  constructor(private readonly service: EssayCorrectionService) {}

  @Post()
  @HttpCode(202)
  create(@CurrentUser() user: UserWithProfile, @Body() dto: CreateEssayScanDto) {
    return this.service.createScan(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: UserWithProfile) {
    return this.service.listScans(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getScan(user.id, id);
  }

  @Get(':id/pages/:index')
  async page(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Param('index', ParseIntPipe) index: number, @Res() res: Response) {
    const page = await this.service.getScanPage(user.id, id, index);
    res.setHeader('Content-Type', page.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(page.image);
  }

  @Post(':id/retry')
  @HttpCode(202)
  retry(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retryScan(user.id, id);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmEssayScanDto) {
    return this.service.confirmScan(user.id, id, dto);
  }

  @Delete(':id/pages')
  deleteImages(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteScanImages(user.id, id);
  }
}

@ApiTags('essays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essays')
export class EssayCorrectionController {
  constructor(private readonly service: EssayCorrectionService) {}

  @Post(':id/correction')
  @HttpCode(202)
  request(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.requestCorrection(user.id, id);
  }

  @Get(':id/correction')
  get(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCorrection(user.id, id);
  }
}

@ApiTags('essays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('essay-corrections')
export class EssayCorrectionQuotaController {
  constructor(private readonly service: EssayCorrectionService) {}

  /** Correções por IA do mês: limite, usadas, restantes e quando renova. */
  @Get('quota')
  quota(@CurrentUser() user: UserWithProfile) {
    return this.service.getQuota(user.id);
  }
}
