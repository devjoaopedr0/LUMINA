import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN')?.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  // Validação automática de todo DTO de entrada. whitelist + forbidNonWhitelisted
  // rejeitam qualquer campo não declarado no DTO (evita mass assignment).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Lumina API — Auth')
    .setDescription('Cadastro, login e autenticação JWT da plataforma Lumina.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Lumina backend rodando em http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger disponível em http://localhost:${port}/docs`);
}

bootstrap();
