import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const CHECKOUT_BILLING_TYPES = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'] as const;
export type CheckoutBillingType = (typeof CHECKOUT_BILLING_TYPES)[number];

export class CheckoutDto {
  @ApiProperty({ description: 'CPF ou CNPJ de quem paga (só repassado ao Asaas, não é guardado).', example: '123.456.789-09' })
  @IsString()
  @Matches(/^[\d.\-/ ]{11,20}$/, { message: 'Informe um CPF ou CNPJ válido.' })
  cpfCnpj!: string;

  @ApiPropertyOptional({ enum: ['YEARLY', 'MONTHLY'], default: 'YEARLY', description: 'Anual (cartão, em até 12x, sem renovação automática) ou mensal (recorrente).' })
  @IsOptional()
  @IsIn(['YEARLY', 'MONTHLY'])
  cycle?: 'YEARLY' | 'MONTHLY';

  @ApiPropertyOptional({ description: 'Parcelas do anual (1 a 12).', default: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @ApiPropertyOptional({ enum: CHECKOUT_BILLING_TYPES, default: 'UNDEFINED', description: 'Só no mensal. UNDEFINED deixa o aluno escolher na página do Asaas; o anual é sempre no cartão.' })
  @IsOptional()
  @IsIn(CHECKOUT_BILLING_TYPES)
  billingType?: CheckoutBillingType;
}

export class AdminGrantDto {
  @ApiPropertyOptional({ description: 'E-mail do aluno (concessão individual Premium).' })
  @ValidateIf((dto: AdminGrantDto) => !dto.institutionId)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Instituição (licença institucional).' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ description: 'Duração em meses; sem valor = sem prazo.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;

  @ApiPropertyOptional({ description: 'Data exata de fim (ISO); tem prioridade sobre months.' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ description: 'Motivo da concessão (fica registrado).' })
  @IsString()
  @MaxLength(300)
  note!: string;
}
