import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fake-prisma';

// Sobe a aplicação NestJS real com o PrismaService fake em memória e testa
// o fluxo completo do banco de questões via HTTP: criar, listar com filtros,
// detalhar (modo responder x modo autor), responder e excluir.
describe('Questions (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let fakePrisma: any;
  let bankWorkspace: any;

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

    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/database/prisma.service');
    const { MailerService } = await import('../src/mailer/mailer.service');

    fakePrisma = createFakePrisma();
    bankWorkspace = fakePrisma.seedBankWorkspace();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
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

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'João',
        lastName: 'Pereira',
        username: 'joao.pereira',
        email: 'joao@exemplo.com',
        password: 'SenhaForte123',
      });
    accessToken = register.body.accessToken;
    // Subir uma segunda aplicação Nest completa em paralelo com a do
    // auth.e2e-spec ultrapassa o timeout padrão de 10s dos hooks.
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const questionPayload = {
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    difficulty: 'MEDIA',
    exam: 'ENEM',
    year: 2023,
    examNumber: 47,
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    alternatives: [
      { text: '4', isCorrect: false },
      { text: '6', isCorrect: false },
      { text: '8', isCorrect: true },
      { text: '10', isCorrect: false },
    ],
  };

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  /** Insere uma questão diretamente no banco central (via fake) para testar o
   * acesso público de leitura/escrita do banco. */
  async function seedBankQuestion() {
    const created = await fakePrisma.question.create({
      data: {
        workspaceId: bankWorkspace.id,
        createdBy: null,
        sourceType: 'OFFICIAL',
        sourceName: 'Lumina',
        sourceId: null,
        contentHash: null,
        subject: 'Biologia',
        topic: 'Citologia',
        difficulty: 'MEDIA',
        exam: 'ENEM',
        year: 2021,
        examNumber: null,
        stem: 'Qual organela é responsável pela produção de ATP na célula eucarionte?',
        explanation: null,
        imageUrl: null,
        subjectId: null,
        topicId: null,
        examId: null,
        alternatives: {
          create: [
            { text: 'Ribossomo', position: 1, isCorrect: false },
            { text: 'Mitocôndria', position: 2, isCorrect: true },
            { text: 'Lisossomo', position: 3, isCorrect: false },
            { text: 'Complexo de Golgi', position: 4, isCorrect: false },
          ],
        },
      },
      include: { alternatives: true },
    });
    return created;
  }

  it('rejeita requisições sem token (401)', async () => {
    const res = await request(app.getHttpServer()).get('/questions');
    expect(res.status).toBe(401);
  });

  it('POST /questions cria uma questão e devolve a visão de autor (com isCorrect)', async () => {
    const res = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.alternatives).toHaveLength(4);
    expect(res.body.alternatives.map((a: any) => a.position)).toEqual([1, 2, 3, 4]);
    expect(res.body.alternatives[2].isCorrect).toBe(true);
    expect(res.body.workspaceId).toBeUndefined();
  });

  it('POST /questions rejeita payload sem alternativa correta (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send({
        ...questionPayload,
        alternatives: questionPayload.alternatives.map((a) => ({ ...a, isCorrect: false })),
      });
    expect(res.status).toBe(400);
  });

  it('POST /questions rejeita payload com menos de 2 alternativas (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send({
        ...questionPayload,
        alternatives: [{ text: 'única', isCorrect: true }],
      });
    expect(res.status).toBe(400);
  });

  it('GET /questions lista com alternativas mascaradas (sem isCorrect)', async () => {
    const res = await request(app.getHttpServer())
      .get('/questions')
      .set(auth())
      .query({ subject: 'Matemática', difficulty: 'MEDIA' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.items[0].alternatives[2].isCorrect).toBeUndefined();
    expect(res.body.items[0].stem).toBe(questionPayload.stem);
  });

  it('GET /questions respeita filtros que não batem (total 0)', async () => {
    const res = await request(app.getHttpServer())
      .get('/questions')
      .set(auth())
      .query({ exam: 'FUVEST' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it('GET /questions/:id retorna visão pública (sem isCorrect)', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.alternatives[2].isCorrect).toBeUndefined();
  });

  it('GET /questions/:id?includeAnswer=true retorna a correta (modo autor)', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth())
      .query({ includeAnswer: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.alternatives[2].isCorrect).toBe(true);
  });

  it('POST /questions/:id/attempt registra acerto e devolve o gabarito', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .post(`/questions/${created.body.id}/attempt`)
      .set(auth())
      .send({ selectedPosition: 3 });

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.correctPosition).toBe(3);
  });

  it('POST /questions/:id/attempt registra erro e devolve a posição correta', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .post(`/questions/${created.body.id}/attempt`)
      .set(auth())
      .send({ selectedPosition: 1 });

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(false);
    expect(res.body.correctPosition).toBe(3);
  });

  it('POST /questions/:id/attempt rejeita posição inexistente (400)', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .post(`/questions/${created.body.id}/attempt`)
      .set(auth())
      .send({ selectedPosition: 9 });

    expect(res.status).toBe(400);
  });

  it('PATCH /questions/:id atualiza campos e substitui alternativas', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .patch(`/questions/${created.body.id}`)
      .set(auth())
      .send({
        subject: 'Matemática II',
        alternatives: [
          { text: '4', isCorrect: false },
          { text: '9', isCorrect: true },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Matemática II');
    expect(res.body.alternatives).toHaveLength(2);
    expect(res.body.alternatives[1].isCorrect).toBe(true);
  });

  it('DELETE /questions/:id exclui e a questão some da listagem', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const del = await request(app.getHttpServer())
      .delete(`/questions/${created.body.id}`)
      .set(auth());
    expect(del.status).toBe(204);

    const get = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth());
    expect(get.status).toBe(404);
  });

  it('GET /questions inclui questões do banco central com canManage=false', async () => {
    await seedBankQuestion();
    const res = await request(app.getHttpServer())
      .get('/questions')
      .set(auth())
      .query({ subject: 'Biologia' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].canManage).toBe(false);
    expect(res.body.items[0].alternatives[1].isCorrect).toBeUndefined();
    // Usuário comum não gerencia o banco central.
    expect(res.body.canManageBank).toBe(false);
  });

  it('POST /questions/:id/attempt responde questão do banco central', async () => {
    const bank = await seedBankQuestion();
    const res = await request(app.getHttpServer())
      .post(`/questions/${bank.id}/attempt`)
      .set(auth())
      .send({ selectedPosition: 2 });

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(true);
  });

  it('GET /questions/:id?includeAnswer=true em questão do banco central é rejeitado (403)', async () => {
    const bank = await seedBankQuestion();
    const res = await request(app.getHttpServer())
      .get(`/questions/${bank.id}`)
      .set(auth())
      .query({ includeAnswer: 'true' });

    expect(res.status).toBe(403);
  });

  it('PATCH /questions/:id em questão do banco central é rejeitado (403)', async () => {
    const bank = await seedBankQuestion();
    const res = await request(app.getHttpServer())
      .patch(`/questions/${bank.id}`)
      .set(auth())
      .send({ difficulty: 'DIFICIL' });

    expect(res.status).toBe(403);
  });

  it('DELETE /questions/:id em questão do banco central é rejeitado (403)', async () => {
    const bank = await seedBankQuestion();
    const res = await request(app.getHttpServer())
      .delete(`/questions/${bank.id}`)
      .set(auth());

    expect(res.status).toBe(403);
  });

  it('POST /questions com workspaceId do banco central é rejeitado (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send({ ...questionPayload, workspaceId: bankWorkspace.id });

    expect(res.status).toBe(403);
  });
});
