import { INestApplicationContext, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/** Socket.IO (salas do Lumina Groups) com as mesmas origens do CORS HTTP. */
class CorsIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly origins: string[] | undefined) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origins ?? false, credentials: true } });
  }
}

async function bootstrap() {
  // Parser de corpo próprio: o padrão do Nest aceita até 100 kB, e a foto
  // digitalizada da redação (até 2 páginas de 3 MB em base64) não cabe. O
  // limite maior vale só para a rota do scanner; o resto continua com o
  // padrão do Nest (100 kB).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use('/essay-scans', json({ limit: '9mb' }));
  // Cartão-resposta: PDF com as folhas digitalizadas (até 25 MB → ~34 MB em base64).
  app.use('/answer-sheets/scan', json({ limit: '36mb' }));
  // Foto do cartão do Gabarito Inteligente: um PDF de uma página (~1–3 MB).
  app.use(/^\/answer-keys\/[0-9a-f-]+\/read-sheet$/, json({ limit: '8mb' }));
  // PDF para gerar flashcards: até 8 MB de arquivo (~11 MB em base64). O
  // arquivo é processado em memória e não fica armazenado.
  app.use('/flashcards/generate/from-pdf', json({ limit: '16mb' }));
  // Foto da questão no scanner de questões: até 3 MB (~4 MB em base64).
  app.use(/^\/simulations\/question-scans\/upload\/[0-9a-f-]+\/complete$/, json({ limit: '5mb' }));
  // Envio de material (PDF até 15 MB em base64) na central de materiais.
  app.use(/^\/materials$/, json({ limit: '22mb' }));
  // Chat da LuminIA com foto de questão (imagem já reduzida no app).
  app.use('/ai/chat', json({ limit: '6mb' }));
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  const configService = app.get(ConfigService);

  const corsOrigins = configService.get<string>('CORS_ORIGIN')?.split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins));

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
