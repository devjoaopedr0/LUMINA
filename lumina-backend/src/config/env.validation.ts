import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * Valida process.env no boot da aplicação. Se faltar (ou for inválida)
 * qualquer variável obrigatória, a aplicação falha imediatamente ao subir,
 * com uma mensagem clara — em vez de falhar de forma confusa mais tarde,
 * no meio de uma requisição (ex: JWT_SECRET undefined ao assinar um token).
 */
class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

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
