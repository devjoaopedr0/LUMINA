import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fake-prisma';

// Exercita os endpoints novos do banco de questões sobre a aplicação NestJS
// real (com PrismaService fake em memória): importação (com relatório e
// deduplicação), catálogo (disciplinas/assuntos/provas) e desempenho
// (favoritos, progresso e estatísticas).
describe('Question system (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
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
        firstName: 'Ana',
        lastName: 'Souza',
        username: 'ana.souza',
        email: 'ana@exemplo.com',
        password: 'SenhaForte123',
        acceptTerms: true,
      });
    accessToken = register.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  const importPayload = (overrides: Record<string, unknown> = {}) => ({
    sourceType: 'IMPORTED',
    sourceName: 'dataset-enem-2023',
    sourceId: 'enem-2023-001',
    exam: 'ENEM',
    year: 2023,
    examNumber: 1,
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    difficulty: 'MEDIA',
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    options: [
      { text: '4' },
      { text: '6' },
      { text: '8' },
      { text: '10' },
    ],
    correctOptionIndex: 2,
    explanation: '2^3 = 8.',
    ...overrides,
  });

  describe('POST /questions/import', () => {
    it('importa com relatório: insere, deduplica por fonte e por conteúdo, e rejeita inválidas', async () => {
      const res = await request(app.getHttpServer())
        .post('/questions/import')
        .set(auth())
        .send({
          questions: [
            importPayload(),
            // Mesma fonte (sourceId) com conteúdo diferente → duplicata por fonte.
            importPayload({
              sourceId: 'enem-2023-001',
              stem: 'Outro enunciado com conteúdo distinto para o teste.',
            }),
            // Sem alternativa correta → inválida (nunca entra silenciosamente).
            importPayload({
              sourceId: 'enem-2023-002',
              correctOptionIndex: undefined,
              options: [
                { text: '4' },
                { text: '6' },
                { text: '8' },
                { text: '10' },
              ],
            }),
            // Conteúdo idêntico ao primeiro, mas de outra fonte → duplicata por hash.
            importPayload({ sourceName: 'outro-dataset', sourceId: undefined }),
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        total: 4,
        imported: 1,
        duplicates: 2,
        invalid: 1,
        errors: 0,
      });
      const types = res.body.details.map((d: any) => d.type).sort();
      expect(types).toEqual(['duplicate', 'duplicate', 'invalid']);
    });
  });

  describe('catálogo', () => {
    it('GET /subjects lista as disciplinas classificadas na importação', async () => {
      const res = await request(app.getHttpServer()).get('/subjects').set(auth());

      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.name === 'Matemática')).toBe(true);
    });

    it('GET /subjects/:id/topics lista os assuntos da disciplina', async () => {
      const subjects = await request(app.getHttpServer()).get('/subjects').set(auth());
      const math = subjects.body.find((s: any) => s.name === 'Matemática');

      const res = await request(app.getHttpServer())
        .get(`/subjects/${math.id}/topics`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(math.id);
      expect(res.body.topics.some((t: any) => t.name === 'Funções exponenciais')).toBe(true);
    });

    it('GET /exams lista a prova cadastrada', async () => {
      const res = await request(app.getHttpServer()).get('/exams').set(auth());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({ name: 'ENEM', year: 2023 });
    });

    it('GET /exams/:id/questions lista as questões da prova', async () => {
      const exams = await request(app.getHttpServer()).get('/exams').set(auth());
      const enem = exams.body.items[0];

      const res = await request(app.getHttpServer())
        .get(`/exams/${enem.id}/questions`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].exam).toBe('ENEM');
    });
  });

  describe('desempenho', () => {
    let questionId: string;

    beforeAll(async () => {
      const list = await request(app.getHttpServer()).get('/questions').set(auth());
      questionId = list.body.items[0].id;
    });

    it('POST /questions/:id/favorite marca como favorito e a lista de favoritos o reflete', async () => {
      const fav = await request(app.getHttpServer())
        .post(`/questions/${questionId}/favorite`)
        .set(auth());
      expect(fav.status).toBe(200);
      expect(fav.body.isFavorite).toBe(true);

      const favorites = await request(app.getHttpServer())
        .get('/users/me/questions/favorites')
        .set(auth());
      expect(favorites.status).toBe(200);
      expect(favorites.body.total).toBe(1);
      expect(favorites.body.items[0].questionId).toBe(questionId);
    });

    it('DELETE /questions/:id/favorite desfaz o favorito', async () => {
      const unfav = await request(app.getHttpServer())
        .delete(`/questions/${questionId}/favorite`)
        .set(auth());
      expect(unfav.status).toBe(200);
      expect(unfav.body.isFavorite).toBe(false);

      const favorites = await request(app.getHttpServer())
        .get('/users/me/questions/favorites')
        .set(auth());
      expect(favorites.body.total).toBe(0);
    });

    it('POST /questions/:id/attempt alimenta progresso e estatísticas de desempenho', async () => {
      const attempt = await request(app.getHttpServer())
        .post(`/questions/${questionId}/attempt`)
        .set(auth())
        .send({ selectedPosition: 3 });
      expect(attempt.status).toBe(200);
      expect(attempt.body.isCorrect).toBe(true);

      const progress = await request(app.getHttpServer())
        .get('/users/me/questions/progress')
        .set(auth());
      expect(progress.status).toBe(200);
      expect(progress.body.total).toBe(1);
      expect(progress.body.items[0].attempts).toBe(1);
      expect(progress.body.items[0].correctAttempts).toBe(1);
      expect(progress.body.items[0].accuracy).toBe(100);

      const performance = await request(app.getHttpServer())
        .get('/users/me/questions/performance')
        .set(auth());
      expect(performance.status).toBe(200);
      expect(performance.body.summary).toMatchObject({ totalAttempts: 1, correct: 1, accuracy: 100 });
      expect(performance.body.bySubject[0]).toMatchObject({ subject: 'Matemática', accuracy: 100 });
      expect(performance.body.byTopic[0].topic).toBe('Funções exponenciais');
    });
  });
});
