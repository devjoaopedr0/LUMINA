import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fake-prisma';

// Fluxo HTTP completo do item 10 (Busca de questões na web) contra a aplicação
// NestJS real com PrismaService fake em memória:
//
//   1. GET /search/web — busca (modo demonstração quando o Google CSE não está
//      configurado), devolvendo APENAS metadados públicos + classificação e
//      sinalizando `provider`/`demoMode` explicitamente;
//   2. POST /search/save — salva a questão transcrita no banco do usuário via
//      pipeline real de importação, preservando a atribuição da fonte
//      (sourceName + sourceId = link original) e rejeitando duplicatas por
//      conteúdo.
describe('Busca de questões na web (e2e — item 10)', () => {
  let app: INestApplication;
  let accessToken: string;
  let fakePrisma: any;
  let bankWorkspace: any;

  const bearer = () => `Bearer ${accessToken}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-para-os-testes-e2e-000000';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-para-os-testes-e2e';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.CORS_ORIGIN = 'http://localhost:5174';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/unused-fake-db';
    process.env.PORT = '3998';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3998/auth/google/callback';
    // Provedores reais de busca desligados: o e2e cobre o modo demonstração e não
    // pode gastar créditos da Tavily nem do Google com a chave do .env local.
    process.env.TAVILY_API_KEY = '';
    process.env.GOOGLE_CSE_ID = '';
    process.env.GOOGLE_CSE_API_KEY = '';
    process.env.FRONTEND_URL = 'http://localhost:5174';
    // Garante o modo DEMO da fase 10: sem chaves do Google CSE, o serviço
    // escolhe o provedor demonstrativo e sinaliza no response.
    delete process.env.GOOGLE_CSE_ID;
    delete process.env.GOOGLE_CSE_API_KEY;

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
        firstName: 'Marina',
        lastName: 'Costa',
        username: 'marina.costa',
        email: 'marina@exemplo.com',
        password: 'SenhaForte123',
        acceptTerms: true,
      });
    accessToken = register.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  /** Semeia uma questão diretamente no BANCO CENTRAL (workspace público),
   * que é um dos escopos que o provider demo vasculha — o mesmo caminho que
   * o seed real de produção usa. */
  let seededCount = 0;
  const seedBankQuestion = async (overrides: Record<string, unknown> = {}) => {
    seededCount += 1;
    return fakePrisma.question.create({
      data: {
        workspaceId: bankWorkspace.id,
        sourceType: 'OFFICIAL',
        sourceName: 'Prova ENEM 2023',
        sourceId: `banco-enem-2023-${seededCount}`,
        subject: 'Matemática',
        topic: 'Funções exponenciais',
        exam: 'ENEM',
        year: 2023,
        examNumber: 100 + seededCount,
        difficulty: 'MEDIA',
        stem: `Considere a função exponencial f(x) = 2^x. O valor de f(3) é igual a (${seededCount}).`,
        ...overrides,
      },
    });
  };

  describe('GET /search/web', () => {
    it('exige autenticação (401 sem token)', async () => {
      await request(app.getHttpServer()).get('/search/web?q=matematica').expect(401);
    });

    it('rejeita query vazia ou muito curta (400 na validação do DTO)', async () => {
      await request(app.getHttpServer())
        .get('/search/web')
        .set('Authorization', bearer())
        .expect(400);

      await request(app.getHttpServer())
        .get('/search/web?q=ab')
        .set('Authorization', bearer())
        .expect(400);
    });

    it('sinaliza o modo demonstração explicitamente quando não há Google CSE', async () => {
      const response = await request(app.getHttpServer())
        .get('/search/web?q=exponencial')
        .set('Authorization', bearer())
        .expect(200);

      expect(response.body.provider).toBe('demo');
      expect(response.body.demoMode).toBe(true);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('devolve apenas metadados públicos (título/link/trecho/fonte) + classificação', async () => {
      await seedBankQuestion();

      const response = await request(app.getHttpServer())
        .get('/search/web?q=exponencial')
        .set('Authorization', bearer())
        .expect(200);

      expect(response.body.total).toBeGreaterThan(0);
      const [hit] = response.body.items;
      expect(hit).toHaveProperty('title');
      expect(hit).toHaveProperty('link');
      expect(hit).toHaveProperty('classification');
      // Não devolve o conteúdo integral da questão como campo dedicado.
      expect(hit).not.toHaveProperty('alternatives');
    });

    it('classifica o resultado com disciplina/assunto/prova/ano/dificuldade', async () => {
      await seedBankQuestion();

      const response = await request(app.getHttpServer())
        .get('/search/web?q=exponencial')
        .set('Authorization', bearer())
        .expect(200);

      const found = response.body.items.find((item: any) =>
        String(item.title).includes('Matemática'),
      );
      expect(found).toBeDefined();
      expect(found.classification.subject).toBe('Matemática');
      expect(found.classification.difficulty).toBe('MEDIA');
      expect(found.classification.exam).toBe('ENEM');
    });

    it('aplica o filtro de disciplina informado pelo cliente', async () => {
      await seedBankQuestion();

      const mathOnly = await request(app.getHttpServer())
        .get('/search/web?q=exponencial&subject=Matemática')
        .set('Authorization', bearer())
        .expect(200);
      expect(mathOnly.body.total).toBeGreaterThan(0);

      // Disciplina sem nenhum resultado no banco acessível → nenhum hit.
      const history = await request(app.getHttpServer())
        .get('/search/web?q=exponencial&subject=História')
        .set('Authorization', bearer())
        .expect(200);
      expect(history.body.total).toBe(0);
    });

    it('respeita o limite informado (1–20)', async () => {
      const response = await request(app.getHttpServer())
        .get('/search/web?q=exponencial&limit=1')
        .set('Authorization', bearer())
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(1);
    });

    it('rejeita limite fora da faixa válida (400)', async () => {
      await request(app.getHttpServer())
        .get('/search/web?q=exponencial&limit=0')
        .set('Authorization', bearer())
        .expect(400);
    });

    // A busca textual é insensível a acento (unaccent no banco): o aluno
    // digita "funcoes" sem acento o tempo todo e precisa achar "Funções".
    it('encontra a questão com acento tanto digitando com quanto sem acento', async () => {
      await seedBankQuestion();

      const semAcento = await request(app.getHttpServer())
        .get('/search/web?q=funcoes')
        .set('Authorization', bearer())
        .expect(200);
      const comAcento = await request(app.getHttpServer())
        .get('/search/web?q=funções')
        .set('Authorization', bearer())
        .expect(200);

      // O enunciado semeado fala de "função" e o assunto é "Funções
      // exponenciais": os dois termos têm de achar a mesma questão.
      expect(semAcento.body.total).toBeGreaterThan(0);
      expect(comAcento.body.total).toBeGreaterThan(0);
      expect(semAcento.body.items.map((i: any) => i.link).sort()).toEqual(
        comAcento.body.items.map((i: any) => i.link).sort(),
      );
    });

    it('a busca sem acento também vale para a listagem do banco de questões', async () => {
      await seedBankQuestion();

      const semAcento = await request(app.getHttpServer())
        .get('/questions?search=funcoes&limit=50')
        .set('Authorization', bearer())
        .expect(200);
      const comAcento = await request(app.getHttpServer())
        .get('/questions?search=funções&limit=50')
        .set('Authorization', bearer())
        .expect(200);

      expect(semAcento.body.total).toBeGreaterThan(0);
      expect(semAcento.body.total).toBe(comAcento.body.total);
    });

    it('nunca devolve o link de outro workspace, mesmo com o mesmo termo', async () => {
      // Outro usuário, com questão exclusively dele sobre o mesmo tema.
      const outro = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Bruno',
          lastName: 'Alves',
          username: 'bruno.alves',
          email: 'bruno@exemplo.com',
          password: 'SenhaForte123',
          acceptTerms: true,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/questions/import/json')
        .set('Authorization', `Bearer ${outro.body.accessToken}`)
        .send({
          target: 'PERSONAL',
          questions: [
            {
              sourceType: 'IMPORTED',
              sourceName: 'privado',
              subject: 'Geografia',
              topic: 'Termo exclusivo do Bruno',
              difficulty: 'FACIL',
              exam: 'PRIV',
              stem: 'Termo exclusivo do Bruno sobre populacao urbana.',
              options: [
                { text: 'Alternativa um', correct: true },
                { text: 'Alternativa dois' },
              ],
            },
          ],
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/search/web?q=populacao+urbana')
        .set('Authorization', bearer())
        .expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.items).toEqual([]);
    });

    it('devolve o link como URL absoluta http(s) (exigência do POST /search/save)', async () => {
      const seeded = await seedBankQuestion();

      const response = await request(app.getHttpServer())
        .get('/search/web?q=exponencial')
        .set('Authorization', bearer())
        .expect(200);

      const hit = response.body.items.find((item: any) => item.link.includes(seeded.id));
      expect(hit).toBeDefined();
      // Sem URL absoluta o save é rejeitado com 400 (o DTO exige http(s)).
      expect(hit.link).toMatch(/^https?:\/\/.+\/app\/questoes\//);
      expect(() => new URL(hit.link)).not.toThrow();
    });
  });

  describe('POST /search/save', () => {
    /** Monta um payload de questão da web com conteúdo único por teste, para
     * que a deduplicação de cada caso seja medida isoladamente. */
    const webPayload = (suffix: string, source = 'exemplo.org') => ({
      sourceUrl: `https://${source}/questoes/${suffix}`,
      sourceName: source,
      question: {
        sourceType: 'OFFICIAL',
        sourceName: 'fonte-que-deve-ser-substituida-pelo-service',
        exam: 'ENEM',
        year: 2023,
        subject: 'Física',
        topic: `Ondas ${suffix}`,
        difficulty: 'FACIL',
        stem: `Uma onda senoidal tem frequência de ${suffix} Hz. Qual é seu período?`,
        options: [
          { text: '0,02 s', correct: true },
          { text: '0,5 s' },
        ],
        correctOptionIndex: 0,
      },
    });

    /** Lê direto do banco fake o que efetivamente foi persistido. Busca pelo
     * sourceId (link original) porque é a chave de atribuição exata e
     * inequívoca de cada caso — o enunciado passa por normalização. */
    const persistedBySource = async (sourceId: string) =>
      (await fakePrisma.question.findMany({})).find(
        (q: any) => q.sourceId === sourceId,
      );

    it('exige autenticação (401 sem token)', async () => {
      await request(app.getHttpServer())
        .post('/search/save')
        .send(webPayload('50hz'))
        .expect(401);
    });

    it('rejeita payload sem os campos obrigatórios (400)', async () => {
      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send({})
        .expect(400);
    });

    it('rejeita sourceUrl que não é uma URL http(s) válida (400)', async () => {
      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send({ ...webPayload('url-invalida'), sourceUrl: 'não é uma url' })
        .expect(400);
    });

    it('salva a questão transcrita e devolve o relatório de importação', async () => {
      const response = await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(webPayload('50hz'))
        .expect(201);

      expect(response.body.total).toBe(1);
      expect(response.body.imported).toBe(1);
      expect(response.body.duplicates).toBe(0);
    });

    it('preserva a atribuição: sourceName=fonte e sourceId=link original, como IMPORTED', async () => {
      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(webPayload('75hz'))
        .expect(201);

      const saved = await persistedBySource('https://exemplo.org/questoes/75hz');
      expect(saved).toBeTruthy();
      expect(saved.sourceType).toBe('IMPORTED');
      expect(saved.sourceName).toBe('exemplo.org');
      expect(saved.sourceId).toBe('https://exemplo.org/questoes/75hz');
    });

    it('sobrescreve a origem enviada no payload pela fonte/URL do resultado web', async () => {
      const payload = webPayload('99hz', 'outra-fonte.test');

      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(payload)
        .expect(201);

      const saved = await persistedBySource('https://outra-fonte.test/questoes/99hz');
      expect(saved).toBeTruthy();
      expect(saved.sourceName).toBe('outra-fonte.test');
      // O service NÃO pode confiar no sourceName/origem do question no payload.
      expect(saved.sourceName).not.toBe(payload.question.sourceName);
      expect(saved.sourceType).toBe('IMPORTED');
    });

    it('salva no workspace pessoal do usuário autenticado', async () => {
      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(webPayload('120hz'))
        .expect(201);

      const saved = await persistedBySource('https://exemplo.org/questoes/120hz');
      expect(saved).toBeTruthy();
      expect(saved.workspaceId).toBeTruthy();
      expect(saved.workspaceId).not.toBe(bankWorkspace.id);
    });

    it('deduplica: salvar o MESMO conteúdo/link duas vezes não cria duplicata', async () => {
      const payload = webPayload('200hz');

      const first = await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(payload)
        .expect(201);
      expect(first.body.imported).toBe(1);
      expect(first.body.duplicates).toBe(0);

      const second = await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(payload)
        .expect(201);
      expect(second.body.imported).toBe(0);
      expect(second.body.duplicates).toBe(1);
    });

    // O link do modo demonstração é a URL do próprio app, que em
    // desenvolvimento é localhost:5174 — sem TLD. Exigir TLD rejeitava todo
    // save com 400 e deixava a funcionalidade inutilizável fora de produção.
    it('aceita sourceUrl em localhost (sem TLD), como o modo demonstração gera', async () => {
      const payload = {
        ...webPayload('300hz'),
        sourceUrl: 'http://localhost:5174/app/questoes/2191d701-1d5a-4362-9092-a1ee88a42452',
      };

      const response = await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(payload)
        .expect(201);
      expect(response.body.imported).toBe(1);

      const saved = await persistedBySource(payload.sourceUrl);
      expect(saved).toBeTruthy();
      expect(saved.sourceId).toBe(payload.sourceUrl);
    });

    it('continua recusando esquemas que não sejam http(s) (400)', async () => {
      for (const sourceUrl of [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'ftp://exemplo.org/questao',
      ]) {
        await request(app.getHttpServer())
          .post('/search/save')
          .set('Authorization', bearer())
          .send({ ...webPayload('esquema-perigoso'), sourceUrl })
          .expect(400);
      }
    });

    it('guarda exatamente uma alternativa correta, na posição transcrita', async () => {
      const payload = {
        ...webPayload('400hz'),
        question: {
          ...webPayload('400hz').question,
          stem: 'Gabarito transcrito na terceira alternativa, para conferir a posição.',
          options: [
            { text: 'primeira alternativa' },
            { text: 'segunda alternativa' },
            { text: 'terceira alternativa', correct: true },
            { text: 'quarta alternativa' },
          ],
          correctOptionIndex: undefined,
        },
      };

      await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send(payload)
        .expect(201);

      const saved = await persistedBySource('https://exemplo.org/questoes/400hz');
      expect(saved).toBeTruthy();

      const alternativas = (await fakePrisma.questionAlternative.findMany({})).filter(
        (a: any) => a.questionId === saved.id,
      );
      expect(alternativas).toHaveLength(4);
      expect(alternativas.filter((a: any) => a.isCorrect)).toHaveLength(1);
      const correta = alternativas.find((a: any) => a.isCorrect);
      expect(correta.text).toBe('terceira alternativa');
      expect(correta.position).toBe(3);
    });

    it('recusa questão sem gabarito indicado (nunca inventa a resposta)', async () => {
      const base = webPayload('500hz');
      const response = await request(app.getHttpServer())
        .post('/search/save')
        .set('Authorization', bearer())
        .send({
          ...base,
          question: {
            ...base.question,
            options: [{ text: 'primeira alternativa' }, { text: 'segunda alternativa' }],
            correctOptionIndex: undefined,
          },
        })
        .expect(201);

      expect(response.body.imported).toBe(0);
      expect(response.body.invalid).toBe(1);
      expect(response.body.details[0].message).toMatch(/alternativa correta/i);
    });
  });
});
