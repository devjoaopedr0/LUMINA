import { Body, Controller, Get, Global, Headers, HttpCode, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserWithProfile } from '../users/users.repository';
import { AsaasWebhookPayload } from './asaas-events';
import { AdminGrantDto, CheckoutDto } from './billing.dto';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';
import { FoundersService } from './founders.service';
import { PlanUsageService } from './plan-usage.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('me')
  @ApiOperation({ summary: 'Plano em vigor, uso dos limites e assinatura do usuário.' })
  me(@CurrentUser() user: UserWithProfile) {
    return this.billing.me(user.id);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Assina o Premium no Asaas e devolve o link da cobrança.' })
  checkout(@CurrentUser() user: UserWithProfile, @Body() dto: CheckoutDto) {
    return this.billing.checkout(user, dto);
  }

  @Post('cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela a recorrência; o período pago continua valendo.' })
  cancel(@CurrentUser() user: UserWithProfile) {
    return this.billing.cancel(user.id);
  }

  @Get('admin/subscriptions')
  @ApiOperation({ summary: '(Admin) Assinaturas, concessões e a campanha de fundadores.' })
  adminList(@CurrentUser() user: UserWithProfile) {
    return this.billing.adminList(user.id);
  }

  @Post('admin/grants')
  @ApiOperation({ summary: '(Admin) Concede Premium a um aluno ou licença a uma instituição.' })
  adminGrant(@CurrentUser() user: UserWithProfile, @Body() dto: AdminGrantDto) {
    return this.billing.adminGrant(user.id, dto);
  }

  @Post('admin/grants/:id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: '(Admin) Revoga uma concessão manual ou de fundador.' })
  adminRevoke(@CurrentUser() user: UserWithProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.adminRevoke(user.id, id);
  }
}

/** Sem JWT: o Asaas se autentica pelo header `asaas-access-token`. */
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('asaas')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  asaas(@Headers('asaas-access-token') token: string | undefined, @Body() payload: AsaasWebhookPayload) {
    return this.billing.handleAsaasWebhook(token, payload);
  }
}

/** Global: os limites são checados em vários módulos (IA, simulados, flashcards, redação). */
@Global()
@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [EntitlementsService, PlanUsageService, FoundersService, BillingService],
  exports: [EntitlementsService, PlanUsageService, FoundersService],
})
export class PlansModule {}
