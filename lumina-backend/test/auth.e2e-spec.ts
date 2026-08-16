import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fake-prisma';

// Sobe a aplicação NestJS real end-to-end (guards, pipes, filtro global,
// controllers) trocando só o PrismaService por um fake em memória — testa
// os endpoints de verdade via HTTP (supertest), sem exigir um Postgres.
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-para-os-testes-e2e-000000';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-para-os-testes-e2e';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.CORS_ORIGIN = 'http://localhost:5174';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/unused-fake-db';
    process.env.PORT = '3999';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3999/auth/google/callback';
    process.env.FRONTEND_URL = 'http://localhost:5174';

    // Import dinâmico DEPOIS de setar as envs: um `import` estático no topo
    // do arquivo seria avaliado antes deste beforeAll rodar (hoisting),
    // fazendo o ConfigModule.forRoot({ validate }) falhar por env ausente.
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/database/prisma.service');
    const { MailerService } = await import('../src/mailer/mailer.service');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      // Sem mock, o register dispararia e-mail real (Resend) — o .env local
      // tem RESEND_API_KEY e o ConfigService prioriza o .env sobre o
      // process.env. Manter os testes e2e livres de rede externa.
      .overrideProvider(MailerService)
      .useValue({
        sendPasswordResetEmail: async () => undefined,
        sendVerificationCodeEmail: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const registerPayload = {
    firstName: 'Maria',
    lastName: 'Silva',
    username: 'maria.silva',
    email: 'maria@exemplo.com',
    password: 'SenhaForte123',
  };

  it('POST /auth/register cria a conta e nunca retorna password_hash', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send(registerPayload);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(registerPayload.email);
    expect(res.body.user.username).toBe(registerPayload.username);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  it('POST /auth/register com e-mail duplicado retorna 409', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send(registerPayload);
    expect(res.status).toBe(409);
  });

  it('POST /auth/register rejeita payload com e-mail malformado (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...registerPayload, email: 'nao-e-um-email', username: 'outro.username' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/register rejeita campos não declarados no DTO (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...registerPayload, username: 'campo.extra', isAdmin: true });
    expect(res.status).toBe(400);
  });

  it('POST /auth/login autentica com credenciais corretas', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /auth/login com senha errada retorna 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: 'senha-errada' });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me sem token retorna 401', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me com token válido retorna o usuário autenticado', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(registerPayload.email);
    expect(res.body.hasPassword).toBe(true);
  });

  it('GET /auth/me com token inválido retorna 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  it('POST /auth/set-password sem token retorna 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ password: 'OutraSenhaForte123' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/set-password numa conta que já tem senha retorna 409', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const res = await request(app.getHttpServer())
      .post('/auth/set-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ password: 'OutraSenhaForte123' });

    expect(res.status).toBe(409);
  });
});
