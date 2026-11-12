import { Type, plainToInstance } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/**
 * Valida process.env no boot da aplicação. Se faltar (ou for inválida)
 * qualquer variável obrigatória, a aplicação falha imediatamente ao subir,
 * com uma mensagem clara — em vez de falhar de forma confusa mais tarde,
 * no meio de uma requisição (ex: JWT_SECRET undefined ao assinar um token).
 */
/** Valida só quando a variável tem valor: vazio no .env conta como ausente. */
const IfSet = (key: string) =>
  ValidateIf((env: Record<string, unknown>) => env[key] !== undefined && env[key] !== null && String(env[key]) !== '');

class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  // @Type explícito (em vez de depender só de enableImplicitConversion) —
  // esbuild (usado pelo `tsx`, no `start:dev`) não emite a metadata de
  // decorators que o class-transformer usaria pra inferir o tipo sozinho;
  // sem isso, PORT chega como string "3001" e falha em @IsInt/@Min/@Max.
  // tsc (build de produção) e SWC (testes) emitem essa metadata
  // corretamente, por isso o bug só aparecia em dev.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  CORS_ORIGIN: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET deve ter pelo menos 16 caracteres.' })
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET deve ter pelo menos 16 caracteres.' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsString()
  GOOGLE_CLIENT_ID: string;

  @IsString()
  GOOGLE_CLIENT_SECRET: string;

  @IsString()
  GOOGLE_CALLBACK_URL: string;

  @IsString()
  FRONTEND_URL: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1000)
  RATE_LIMIT_TTL_MS?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX?: number;

  // Opcionais: sem RESEND_API_KEY o MailerService simula o envio no console
  // (útil em dev), em vez de quebrar o boot da aplicação.
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_FROM_EMAIL?: string;

  // Planos e cobrança (Asaas). Opcionais: sem ASAAS_API_KEY ou sem preço, o
  // app funciona e a assinatura aparece como "em breve".
  @IsOptional()
  @IsString()
  ASAAS_API_KEY?: string;

  @IfSet('ASAAS_ENVIRONMENT')
  @IsIn(['sandbox', 'production'])
  ASAAS_ENVIRONMENT?: string;

  @IsOptional()
  @IsString()
  ASAAS_WEBHOOK_TOKEN?: string;

  @IfSet('PLAN_PREMIUM_MONTHLY_PRICE')
  @Matches(/^\d+([.,]\d{1,2})?$/, { message: 'PLAN_PREMIUM_MONTHLY_PRICE deve ser um valor como 29.90' })
  PLAN_PREMIUM_MONTHLY_PRICE?: string;

  @Type(() => Number)
  @IfSet('FOUNDER_STUDENT_SLOTS')
  @IsInt()
  @Min(0)
  FOUNDER_STUDENT_SLOTS?: number;

  @Type(() => Number)
  @IfSet('FOUNDER_GRANT_MONTHS')
  @IsInt()
  @Min(1)
  FOUNDER_GRANT_MONTHS?: number;

  @IfSet('FOUNDER_CAMPAIGN_STARTS_AT')
  @IsDateString()
  FOUNDER_CAMPAIGN_STARTS_AT?: string;

  @IfSet('FOUNDER_CAMPAIGN_ENDS_AT')
  @IsDateString()
  FOUNDER_CAMPAIGN_ENDS_AT?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${messages}`);
  }

  return validatedConfig;
}
