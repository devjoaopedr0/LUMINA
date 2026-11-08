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
    // Esta suíte não testa o limitador (que tem spec próprio) e faz dezenas de
    // requisições em poucos segundos: um 429 no meio de uma asserção seria um
    // falso negativo sobre o banco de questões.
    process.env.RATE_LIMIT_MAX = '5000';

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

  /** Mesma questão, agora com a explicação de cada alternativa escrita pelo
   * autor — o gabarito comentado por alternativa. */
  const questionWithExplanations = {
    ...questionPayload,
    alternatives: [
      { text: '4', isCorrect: false, explanation: '2^2 = 4: o expoente foi trocado.' },
      { text: '6', isCorrect: false },
      { text: '8', isCorrect: true, explanation: '2^3 = 8.' },
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

  it('a visão de responder nunca entrega a explicação das alternativas', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionWithExplanations);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.alternatives.every((a: any) => a.explanation === undefined)).toBe(true);
  });

  it('a visão de autor entrega a explicação de cada alternativa', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionWithExplanations);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth())
      .query({ includeAnswer: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.alternatives[0].explanation).toBe('2^2 = 4: o expoente foi trocado.');
  });

  it('POST /questions/:id/attempt devolve a explicação das alternativas erradas', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionWithExplanations);

    const res = await request(app.getHttpServer())
      .post(`/questions/${created.body.id}/attempt`)
      .set(auth())
      .send({ selectedPosition: 1 });

    expect(res.status).toBe(200);
    expect(res.body.explanations).toEqual([
      {
        position: 1,
        text: '4',
        isCorrect: false,
        selected: true,
        explanation: '2^2 = 4: o expoente foi trocado.',
      },
      {
        position: 3,
        text: '8',
        isCorrect: true,
        selected: false,
        explanation: '2^3 = 8.',
      },
    ]);
  });

  it('GET /questions/:id/hint entrega dica sem revelar a alternativa correta', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}/hint`)
      .set(auth())
      .query({ level: 1 });

    expect(res.status).toBe(200);
    expect(res.body.level).toBe(1);
    expect(res.body.maxLevel).toBe(3);
    expect(res.body.provider).toBe('rules');
    expect(res.body.hint).toContain('Matemática');
    // a alternativa correta da questão é "8": a dica não pode conter o gabarito
    expect(res.body.hint).not.toMatch(/\b8\b/);
  });

  it('GET /questions/:id/hint recusa nível fora de 1..3 (400)', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}/hint`)
      .set(auth())
      .query({ level: 9 });

    expect(res.status).toBe(400);
  });

  it('dica não conta como tentativa (não altera as estatísticas da questão)', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    await request(app.getHttpServer())
      .get(`/questions/${created.body.id}/hint`)
      .set(auth())
      .query({ level: 2 });

    const res = await request(app.getHttpServer())
      .get(`/questions/${created.body.id}`)
      .set(auth());

    expect(res.body.stats).toBeNull();
  });

  it('POST /questions/:id/review marca para revisar e o estado volta na listagem', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send(questionPayload);

    const marked = await request(app.getHttpServer())
      .post(`/questions/${created.body.id}/review`)
      .set(auth());

    expect(marked.status).toBe(200);
    expect(marked.body).toEqual({ markedForReview: true });

    const list = await request(app.getHttpServer()).get('/questions').set(auth());
    const item = list.body.items.find((q: any) => q.id === created.body.id);
    expect(item.progress.markedForReview).toBe(true);
    // favoritar e revisar são decisões independentes
    expect(item.progress.isFavorite).toBe(false);

    const reviewList = await request(app.getHttpServer())
      .get('/users/me/questions/review')
      .set(auth());
    expect(reviewList.body.items.map((p: any) => p.questionId)).toContain(created.body.id);
    expect(reviewList.body.items[0].markedForReview).toBe(true);

    const unmarked = await request(app.getHttpServer())
      .delete(`/questions/${created.body.id}/review`)
      .set(auth());
    expect(unmarked.body).toEqual({ markedForReview: false });
  });

  it('POST /questions/:id/review de questão inacessível devolve 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/questions/11111111-2222-4333-8444-555555555555/review')
      .set(auth());

    expect(res.status).toBe(404);
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

  // --- Caderno de erros (item 12) e motivo do erro (item 13) -------------------
  describe('caderno de erros', () => {
    // O caderno é estado pessoal e acumulado. Cada teste cria o seu aluno (e,
    // portanto, o seu caderno vazio) para não depender do que os testes
    // anteriores daquele aluno erraram — nem estragar o que eles provam.
    let alunos = 0;

    async function novoAluno() {
      alunos += 1;
      const cadastro = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: `Aluno ${alunos}`,
          lastName: 'do Caderno',
          username: `aluno.caderno.${alunos}`,
          email: `aluno.caderno.${alunos}@exemplo.com`,
          password: 'SenhaForte123',
        });
      return { Authorization: `Bearer ${cadastro.body.accessToken}` };
    }

    /** Cria uma questão e responde errado de propósito (a alternativa 1 é a
     *  errada em `questionPayload`: a correta é a 3). */
    async function errar(header: Record<string, string>, overrides: Record<string, unknown> = {}) {
      const created = await request(app.getHttpServer())
        .post('/questions')
        .set(header)
        .send({ ...questionPayload, ...overrides });
      const tentativa = await request(app.getHttpServer())
        .post(`/questions/${created.body.id}/attempt`)
        .set(header)
        .send({ selectedPosition: 1 });
      return { questionId: created.body.id as string, tentativa };
    }

    it('caderno nasce vazio e a listagem não se confunde com "erro de carregamento"', async () => {
      const header = await novoAluno();
      const list = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header);
      expect(list.status).toBe(200);
      expect(list.body).toEqual({ items: [], total: 0, page: 1, totalPages: 1, limit: 20 });

      const resumo = await request(app.getHttpServer())
        .get('/users/me/error-notebook/summary')
        .set(header);
      expect(resumo.body).toMatchObject({
        total: 0,
        open: 0,
        mastered: 0,
        dueToday: 0,
        withoutReason: 0,
        bySubject: [],
        byTopic: [],
        byReason: [],
      });
    });

    it('errar cria a entrada e o resultado da tentativa já traz o estado novo', async () => {
      const header = await novoAluno();
      const { tentativa } = await errar(header);
      expect(tentativa.status).toBe(200);
      expect(tentativa.body.isCorrect).toBe(false);
      // O caderno volta na MESMA resposta: a interface não precisa de segunda
      // chamada para mostrar que a questão entrou na fila.
      expect(tentativa.body.errorNotebook).toMatchObject({
        status: 'ABERTA',
        wrongAttempts: 1,
        correctStreak: 0,
        evolution: 'E',
        reason: null,
        due: false,
      });

      const list = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header);
      expect(list.status).toBe(200);
      const item = list.body.items.find(
        (e: any) => e.questionId === tentativa.body.errorNotebook.questionId,
      );
      expect(item.subject).toBe('Matemática');
      expect(item.difficulty).toBe('MEDIA');
      expect(item.stem).toContain('2^x');
      // A procedência completa: é ela que o aluno usa para achar a questão no
      // caderno original da prova.
      expect(item).toMatchObject({ exam: 'ENEM', year: 2023, examNumber: 47 });
    });

    it('acerto evolui a entrada e dois acertos seguidos dominam a questão', async () => {
      const header = await novoAluno();
      const { questionId } = await errar(header);

      const primeiro = await request(app.getHttpServer())
        .post(`/questions/${questionId}/attempt`)
        .set(header)
        .send({ selectedPosition: 3 });
      expect(primeiro.body.errorNotebook.status).toBe('ABERTA');
      expect(primeiro.body.errorNotebook.correctStreak).toBe(1);
      expect(primeiro.body.errorNotebook.evolution).toBe('EA');

      const segundo = await request(app.getHttpServer())
        .post(`/questions/${questionId}/attempt`)
        .set(header)
        .send({ selectedPosition: 3 });
      expect(segundo.body.errorNotebook.status).toBe('DOMINADA');
      expect(segundo.body.errorNotebook.evolution).toBe('EAA');
      expect(segundo.body.errorNotebook.resolvedAt).not.toBeNull();

      // A dominada sai da fila padrão, mas continua no histórico.
      const abertas = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header);
      expect(abertas.body.items).toHaveLength(0);

      const dominadas = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ status: 'DOMINADA' });
      expect(dominadas.body.items.map((e: any) => e.questionId)).toEqual([questionId]);
    });

    it('errar de novo reabre a questão dominada', async () => {
      const header = await novoAluno();
      const { questionId } = await errar(header);
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post(`/questions/${questionId}/attempt`)
          .set(header)
          .send({ selectedPosition: 3 });
      }

      const errou = await request(app.getHttpServer())
        .post(`/questions/${questionId}/attempt`)
        .set(header)
        .send({ selectedPosition: 1 });
      expect(errou.body.errorNotebook.status).toBe('ABERTA');
      expect(errou.body.errorNotebook.wrongAttempts).toBe(2);
      expect(errou.body.errorNotebook.correctStreak).toBe(0);
      expect(errou.body.errorNotebook.resolvedAt).toBeNull();
      expect(errou.body.errorNotebook.evolution).toBe('EAAE');
    });

    it('acertar questão que não está no caderno não cria entrada', async () => {
      const header = await novoAluno();
      const created = await request(app.getHttpServer())
        .post('/questions')
        .set(header)
        .send(questionPayload);

      const tentativa = await request(app.getHttpServer())
        .post(`/questions/${created.body.id}/attempt`)
        .set(header)
        .send({ selectedPosition: 3 });

      expect(tentativa.body.isCorrect).toBe(true);
      expect(tentativa.body.errorNotebook).toBeNull();
      const depois = await request(app.getHttpServer())
        .get('/users/me/error-notebook/summary')
        .set(header);
      expect(depois.body.total).toBe(0);
    });

    it('PATCH registra motivo, observação e revisão combinada', async () => {
      const header = await novoAluno();
      const { questionId } = await errar(header);

      const patch = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reason: 'ERRO_CALCULO', notes: 'invertei a base' });
      expect(patch.status).toBe(200);
      expect(patch.body.reason).toBe('ERRO_CALCULO');
      expect(patch.body.notes).toBe('invertei a base');

      // Amanhã ainda não está vencida.
      const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const futuro = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reviewScheduledOn: amanha });
      expect(futuro.body.reviewScheduledAt).toBe(`${amanha}T00:00:00.000Z`);
      expect(futuro.body.due).toBe(false);

      // Hoje está.
      const hoje = new Date().toISOString().slice(0, 10);
      const vencido = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reviewScheduledOn: hoje });
      expect(vencido.body.due).toBe(true);

      const paraHoje = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ due: 'true' });
      expect(paraHoje.body.items.map((e: any) => e.questionId)).toEqual([questionId]);

      // Amanhã não aparece mais na fila de hoje, mas continua no caderno.
      const depois = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reviewScheduledOn: amanha });
      expect(depois.body.due).toBe(false);
      const semVencidas = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ due: 'true' });
      expect(semVencidas.body.items).toHaveLength(0);

      // Limpar a data não esconde a dívida: a entrada aberta continua pendente.
      const semData = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reviewScheduledOn: null });
      expect(semData.body.reviewScheduledAt).toBeNull();
      expect(semData.body.due).toBe(true);
      const pendente = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ due: 'true' });
      expect(pendente.body.items.map((e: any) => e.questionId)).toEqual([questionId]);
    });

    it('motivo inválido, data inválida e filtro inválido são recusados (400)', async () => {
      const header = await novoAluno();
      const { questionId } = await errar(header);

      const motivo = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reason: 'VOTEI_NO_CHUTE' });
      expect(motivo.status).toBe(400);

      const data = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(header)
        .send({ reviewScheduledOn: 'amanhã' });
      expect(data.status).toBe(400);

      const filtro = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ reason: 'CHUTE_CRIATIVO' });
      expect(filtro.status).toBe(400);
    });

    it('o resumo organiza por matéria, assunto e motivo', async () => {
      const header = await novoAluno();
      await errar(header);
      await errar(header, { subject: 'Física', topic: 'Óptica' });
      await errar(header, { subject: 'Física', topic: 'Óptica', difficulty: 'DIFICIL' });

      const resumo = await request(app.getHttpServer())
        .get('/users/me/error-notebook/summary')
        .set(header);

      expect(resumo.status).toBe(200);
      expect(resumo.body.total).toBe(3);
      expect(resumo.body.open).toBe(3);
      expect(resumo.body.bySubject).toEqual([
        { label: 'Física', value: 'Física', open: 2, mastered: 0 },
        { label: 'Matemática', value: 'Matemática', open: 1, mastered: 0 },
      ]);
      expect(resumo.body.byTopic).toEqual([
        { label: 'Óptica', value: 'Óptica', open: 2, mastered: 0 },
        { label: 'Funções exponenciais', value: 'Funções exponenciais', open: 1, mastered: 0 },
      ]);
      // Nada foi classificado ainda: o resumo diz isso explicitamente em vez de
      // esconder as entradas sem motivo.
      expect(resumo.body.withoutReason).toBe(3);
      expect(resumo.body.byReason).toEqual([
        { label: 'Sem motivo', value: 'SEM_MOTIVO', open: 3, mastered: 0 },
      ]);
    });

    it('o motivo registrado muda o recorte e o total de sem motivo', async () => {
      const header = await novoAluno();
      const primeira = await errar(header);
      const segunda = await errar(header);

      await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${primeira.questionId}`)
        .set(header)
        .send({ reason: 'CHUTE' });

      const resumo = await request(app.getHttpServer())
        .get('/users/me/error-notebook/summary')
        .set(header);
      expect(resumo.body.withoutReason).toBe(1);
      // Empate em abertos (1 x 1) desempata pelo rótulo.
      expect(resumo.body.byReason).toEqual([
        { label: 'Chute', value: 'CHUTE', open: 1, mastered: 0 },
        { label: 'Sem motivo', value: 'SEM_MOTIVO', open: 1, mastered: 0 },
      ]);

      // O valor do recorte vai no filtro: "Sem motivo" devolve exatamente a
      // entrada que ainda não foi classificada.
      const semMotivo = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ reason: 'SEM_MOTIVO' });
      expect(semMotivo.body.items.map((e: any) => e.questionId)).toEqual([segunda.questionId]);
    });

    it('filtra o caderno por matéria, assunto, motivo e dificuldade', async () => {
      const header = await novoAluno();
      const alvo = await errar(header, {
        subject: 'Química',
        topic: 'Estequiometria',
        difficulty: 'DIFICIL',
      });
      await errar(header, { subject: 'Física', topic: 'Termologia' });

      const materia = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ subject: 'Química' });
      expect(materia.body.items.map((e: any) => e.questionId)).toEqual([alvo.questionId]);

      const assunto = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ topic: 'Termologia' });
      expect(assunto.body.items.map((e: any) => e.topic)).toEqual(['Termologia']);

      await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${alvo.questionId}`)
        .set(header)
        .send({ reason: 'FALTA_CONTEUDO' });

      const porMotivo = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ reason: 'FALTA_CONTEUDO' });
      expect(porMotivo.body.items.map((e: any) => e.questionId)).toEqual([alvo.questionId]);

      const porDificuldade = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header)
        .query({ difficulty: 'DIFICIL' });
      expect(porDificuldade.body.items.map((e: any) => e.questionId)).toEqual([alvo.questionId]);
    });

    it('inclui à mão, recusa duplicata e remove', async () => {
      const header = await novoAluno();
      const created = await request(app.getHttpServer())
        .post('/questions')
        .set(header)
        .send(questionPayload);

      const incluido = await request(app.getHttpServer())
        .post(`/users/me/error-notebook/${created.body.id}`)
        .set(header);
      expect(incluido.status).toBe(201);
      expect(incluido.body.status).toBe('ABERTA');

      const duplicata = await request(app.getHttpServer())
        .post(`/users/me/error-notebook/${created.body.id}`)
        .set(header);
      expect(duplicata.status).toBe(409);

      const listagem = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header);
      expect(listagem.body.total).toBe(1);

      const removido = await request(app.getHttpServer())
        .delete(`/users/me/error-notebook/${created.body.id}`)
        .set(header);
      expect(removido.status).toBe(204);

      const outraVez = await request(app.getHttpServer())
        .delete(`/users/me/error-notebook/${created.body.id}`)
        .set(header);
      expect(outraVez.status).toBe(404);

      const depois = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(header);
      expect(depois.body.total).toBe(0);
    });

    it('questão inexistente é 404 tanto para incluir quanto para editar', async () => {
      const header = await novoAluno();
      const id = '22222222-3333-4444-8555-666666666666';
      const incluir = await request(app.getHttpServer())
        .post(`/users/me/error-notebook/${id}`)
        .set(header);
      expect(incluir.status).toBe(404);

      const editar = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${id}`)
        .set(header)
        .send({ reason: 'CHUTE' });
      expect(editar.status).toBe(404);
    });

    it('o caderno é do aluno: outro aluno não vê nem edita a entrada', async () => {
      const header = await novoAluno();
      const { questionId } = await errar(header);
      const outro = await novoAluno();

      const lista = await request(app.getHttpServer())
        .get('/users/me/error-notebook')
        .set(outro);
      expect(lista.body.items).toHaveLength(0);

      const resumo = await request(app.getHttpServer())
        .get('/users/me/error-notebook/summary')
        .set(outro);
      expect(resumo.body.total).toBe(0);

      const edicao = await request(app.getHttpServer())
        .patch(`/users/me/error-notebook/${questionId}`)
        .set(outro)
        .send({ reason: 'CHUTE' });
      expect(edicao.status).toBe(404);

      const remocao = await request(app.getHttpServer())
        .delete(`/users/me/error-notebook/${questionId}`)
        .set(outro);
      expect(remocao.status).toBe(404);
    });

    it('questão do outro workspace não entra no caderno por inclusão manual', async () => {
      const outsider = await novoAluno();
      const alheia = await request(app.getHttpServer())
        .post('/questions')
        .set(auth())
        .send(questionPayload);

      const res = await request(app.getHttpServer())
        .post(`/users/me/error-notebook/${alheia.body.id}`)
        .set(outsider);
      expect(res.status).toBe(404);
    });
  });
});
