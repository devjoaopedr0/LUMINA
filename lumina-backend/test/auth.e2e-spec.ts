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

  it('PATCH /users/me/profile atualiza e normaliza o perfil autenticado', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const res = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        firstName: '  Mariana  ',
        lastName: 'Oliveira',
        username: 'Mariana.Oliveira',
        phone: '+55 (11) 99999-9999',
        birthDate: '2004-05-12',
        bio: '  Estudante focada no ENEM.  ',
        educationLevel: 'ENSINO_MEDIO',
        schoolYear: 3,
        schoolName: '  Escola Exemplo  ',
        desiredCourse: '  Medicina  ',
        targetUniversity: '  UFC  ',
      });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Mariana');
    expect(res.body.username).toBe('mariana.oliveira');
    expect(res.body.birthDate).toContain('2004-05-12');
    expect(res.body.bio).toBe('Estudante focada no ENEM.');
    expect(res.body.educationLevel).toBe('ENSINO_MEDIO');
    expect(res.body.schoolYear).toBe(3);
    expect(res.body.schoolName).toBe('Escola Exemplo');
    expect(res.body.desiredCourse).toBe('Medicina');
    expect(res.body.targetUniversity).toBe('UFC');
    const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.body.schoolName).toBe('Escola Exemplo');
    expect(me.body.desiredCourse).toBe('Medicina');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('PATCH /users/me/profile rejeita campos desconhecidos e URL inválida', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const invalidUrl = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ avatarUrl: 'arquivo-local.png' });
    expect(invalidUrl.status).toBe(400);

    const extraField = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ isAdmin: true });
    expect(extraField.status).toBe(400);

    const invalidAcademic = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ educationLevel: 'DOUTORADO', schoolYear: 10 });
    expect(invalidAcademic.status).toBe(400);
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

  it('POST /auth/refresh troca um refresh token válido por um novo par de tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(registerPayload.email);

    // O novo access token precisa funcionar de verdade em rota protegida.
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('POST /auth/refresh com token inválido retorna 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'token-invalido' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/refresh com o access token (secret errado) retorna 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.accessToken });
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

  it('salva, consulta e limpa o vestibular-alvo da conta', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: registerPayload.email, password: registerPayload.password });
    const authorization = `Bearer ${login.body.accessToken}`;
    const saved = await request(app.getHttpServer()).post('/user/vestibular').set('Authorization', authorization).send({ customName: 'ENEM', targetDate: '2027-11-07' });
    expect(saved.status).toBe(201);
    const read = await request(app.getHttpServer()).get('/user/vestibular').set('Authorization', authorization);
    expect(read.body.customName).toBe('ENEM');
    const cleared = await request(app.getHttpServer()).post('/user/vestibular').set('Authorization', authorization).send({ customName: null });
    expect(cleared.status).toBe(201);
    expect(cleared.body.customName).toBeNull();
    expect(cleared.body.targetDate).toBeNull();
  });

  it('POST /auth/logout-all invalida access e refresh tokens antigos e permite novo login', async () => {
    const account = { ...registerPayload, email: 'sessoes@exemplo.com', username: 'sessoes.teste' };
    const first = await request(app.getHttpServer()).post('/auth/register').send(account);
    expect(first.status).toBe(201);

    const logout = await request(app.getHttpServer()).post('/auth/logout-all')
      .set('Authorization', `Bearer ${first.body.accessToken}`);
    expect(logout.status).toBe(204);

    const oldAccess = await request(app.getHttpServer()).get('/auth/me')
      .set('Authorization', `Bearer ${first.body.accessToken}`);
    expect(oldAccess.status).toBe(401);

    const oldRefresh = await request(app.getHttpServer()).post('/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(oldRefresh.status).toBe(401);

    const second = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: account.email, password: account.password });
    expect(second.status).toBe(200);
    const newAccess = await request(app.getHttpServer()).get('/auth/me')
      .set('Authorization', `Bearer ${second.body.accessToken}`);
    expect(newAccess.status).toBe(200);
  });

  it('lista sessões e encerra apenas a sessão escolhida', async () => {
    const account = { ...registerPayload, email: 'individual@exemplo.com', username: 'individual.teste' };
    const first = await request(app.getHttpServer()).post('/auth/register').send(account);
    const second = await request(app.getHttpServer()).post('/auth/login').send({ email: account.email, password: account.password });
    const listed = await request(app.getHttpServer()).get('/auth/sessions').set('Authorization', `Bearer ${first.body.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(2);
    const current = listed.body.find((session: { current: boolean }) => session.current);
    expect(current).toBeDefined();
    expect((await request(app.getHttpServer()).delete(`/auth/sessions/${current.id}`).set('Authorization', `Bearer ${first.body.accessToken}`)).status).toBe(204);
    expect((await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${first.body.accessToken}`)).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: first.body.refreshToken })).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${second.body.accessToken}`)).status).toBe(200);
  });
});
