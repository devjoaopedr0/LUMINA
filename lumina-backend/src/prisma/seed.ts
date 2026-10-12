import 'dotenv/config';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  QuestionSourceType,
  WorkspaceType,
} from '@prisma/client';
import { EXATAS_QUESTIONS } from '../../prisma/seed-data/exatas';
import { BIOLOGICAS_QUESTIONS } from '../../prisma/seed-data/biologicas';
import { HUMANAS_QUESTIONS } from '../../prisma/seed-data/humanas';
import { LINGUAGENS_QUESTIONS } from '../../prisma/seed-data/linguagens';
import { AMPLIACAO_QUESTIONS } from '../../prisma/seed-data/ampliacao';
import { ESSAY_MODELS } from '../../prisma/seed-data/essay-models';
import { EXAM_PAPERS } from '../../prisma/seed-data/exam-papers';
import { FORMULAS, REPERTORIOS } from '../../prisma/seed-data/notebooks';
import { STUDY_SUBJECT_TOPICS } from '../../prisma/seed-data/study-subject-topics';
import { mergeDuplicateTopics } from './merge-duplicate-topics';
import type { SeedQuestion } from '../../prisma/seed-data/types';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from '../schedules/study-subject-question-bank-map';

/**
 * Seed do banco de questões da Lumina. Cria:
 *  - o banco central de questões: Institution "Lumina" (banco@lumina.app)
 *    com um Workspace INSTITUTION público ("Banco de Questões Lumina"), onde
 *    qualquer usuário autenticado pode ler/responder, mas só o admin interno
 *    (com a permissão QUESTION_MANAGE) pode gerenciar conteúdo;
 *  - a conta do administrador do banco (admin@lumina.app / AdminLumina123),
 *    com workspace pessoal e cargo de administrador no banco;
 *  - uma conta demo (demo@lumina.app / DemoLumina123) com workspace pessoal,
 *    para testes manuais;
 *  - o catálogo de classificação: disciplinas, assuntos e provas;
 *  - as questões originais (criadas para o projeto) vinculadas ao banco,
 *    a partir dos arquivos em prisma/seed-data/.
 *  - o acervo de exibição: modelos de redação nota mil (item 23), provas
 *    anteriores publicadas (item 19) e os cadernos de fórmulas e repertórios
 *    da conta demo (itens 21 e 22), para nenhuma tela abrir vazia.
 *
 * Idempotente: reexecutar não duplica (checa usuários/institution por e-mail,
 * workspaces por tipo/vínculo, assuntos/provas por nome e questões por
 * sourceId dentro do workspace do banco). Rodar com: npm run prisma:seed
 */

const BANK_INSTITUTION_EMAIL = 'banco@lumina.app';
const BANK_INSTITUTION_NAME = 'Lumina';
const BANK_WORKSPACE_NAME = 'Banco de Questões Lumina';

const ADMIN_EMAIL = 'admin@lumina.app';
const ADMIN_PASSWORD = 'AdminLumina123';
const ADMIN_FIRST_NAME = 'Admin';
const ADMIN_LAST_NAME = 'Lumina';

const DEMO_EMAIL = 'demo@lumina.app';
const DEMO_PASSWORD = 'DemoLumina123';
const DEMO_FIRST_NAME = 'Demo';
const DEMO_LAST_NAME = 'Lumina';

const QUESTION_MANAGE = 'QUESTION_MANAGE';

const BCRYPT_ROUNDS = 10;

const ALL_QUESTIONS: SeedQuestion[] = [
  ...EXATAS_QUESTIONS,
  ...BIOLOGICAS_QUESTIONS,
  ...HUMANAS_QUESTIONS,
  ...LINGUAGENS_QUESTIONS,
  ...AMPLIACAO_QUESTIONS,
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function computeContentHash(question: SeedQuestion): string {
  const canonical = JSON.stringify({
    stem: question.stem.toLowerCase().replace(/\s+/g, ' ').trim(),
    alternatives: question.alternatives.map((a) =>
      a.text.toLowerCase().replace(/\s+/g, ' ').trim(),
    ),
    subject: question.subject.toLowerCase().replace(/\s+/g, ' ').trim(),
    topic: question.topic.toLowerCase().replace(/\s+/g, ' ').trim(),
    year: question.year,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

async function ensureUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  username: string,
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: true,
      profile: { create: { firstName, lastName, username } },
    },
  });
}

/** Workspace pessoal do usuário (com cargo "Owner" de sistema), criado na
 * primeira execução. */
async function ensurePersonalWorkspace(prisma: PrismaClient, userId: string, name: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspace: { type: WorkspaceType.PERSONAL } },
    include: { workspace: true },
  });
  if (membership?.workspace) {
    return membership.workspace;
  }
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: { name, type: WorkspaceType.PERSONAL },
    });
    const role = await tx.role.create({
      data: {
        workspaceId: ws.id,
        name: 'Owner',
        description: 'Cargo padrão do dono do workspace pessoal.',
        isSystem: true,
      },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: ws.id, userId, roleId: role.id },
    });
    return ws;
  });
}

/** Instituição + Workspace INSTITUTION do banco central de questões. */
async function ensureBank(prisma: PrismaClient) {
  const institution =
    (await prisma.institution.findUnique({
      where: { email: BANK_INSTITUTION_EMAIL },
      include: { workspace: true },
    })) ??
    (await prisma.institution.create({
      data: {
        name: BANK_INSTITUTION_NAME,
        email: BANK_INSTITUTION_EMAIL,
        status: 'ACTIVE',
        workspace: { create: { name: BANK_WORKSPACE_NAME, type: WorkspaceType.INSTITUTION } },
      },
      include: { workspace: true },
    }));
  return { institution, workspace: institution.workspace! };
}

async function ensurePermission(prisma: PrismaClient, code: string) {
  return prisma.permission.upsert({
    where: { code },
    update: {},
    create: { code, name: 'Gerenciar questões' },
  });
}

/** Garante o cargo de administrador do banco com QUESTION_MANAGE e vincula o
 * admin como membro ATIVO. */
async function ensureBankAdmin(
  prisma: PrismaClient,
  bankWorkspaceId: string,
  adminUserId: string,
) {
  const permission = await ensurePermission(prisma, QUESTION_MANAGE);

  const existingRole = await prisma.role.findFirst({
    where: { workspaceId: bankWorkspaceId, name: 'Administrador do Banco' },
  });
  const role =
    existingRole ??
    (await prisma.role.create({
      data: {
        workspaceId: bankWorkspaceId,
        name: 'Administrador do Banco',
        description:
          'Cargo interno responsável por gerenciar o banco de questões central do Lumina.',
        isSystem: true,
      },
    }));

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    update: {},
    create: { roleId: role.id, permissionId: permission.id },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: bankWorkspaceId, userId: adminUserId },
    },
    update: { status: 'ACTIVE', roleId: role.id },
    create: { workspaceId: bankWorkspaceId, userId: adminUserId, roleId: role.id },
  });

  return role;
}

async function ensureSubject(prisma: PrismaClient, name: string) {
  return prisma.subject.upsert({ where: { name }, update: {}, create: { name } });
}

async function ensureTopic(prisma: PrismaClient, subjectId: string, name: string) {
  return prisma.topic.upsert({
    where: { subjectId_name: { subjectId, name } },
    update: {},
    create: { subjectId, name },
  });
}

/** Garante os tópicos do currículo (item 2 do design do cronograma adaptativo)
 *  como linhas reais de Topic, mesmo para tópicos que nenhuma questão ainda
 *  cobre — TopicMastery precisa de um topicId para existir, não só de
 *  questões respondidas. Idempotente (mesmo upsert de ensureTopic). */
async function seedCurriculumTopics(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const entry of STUDY_SUBJECT_TOPICS) {
    const subjectName = STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[entry.subjectCode];
    if (!subjectName) continue;
    const subject = await ensureSubject(prisma, subjectName);
    for (const group of entry.groups) {
      for (const topicName of group.topics) {
        const existing = await prisma.topic.findUnique({
          where: { subjectId_name: { subjectId: subject.id, name: topicName } },
        });
        if (existing) continue;
        await ensureTopic(prisma, subject.id, topicName);
        created += 1;
      }
    }
  }
  return created;
}

async function ensureExam(prisma: PrismaClient, name: string, year: number) {
  const existing = await prisma.exam.findFirst({ where: { name, year } });
  return (
    existing ??
    prisma.exam.create({
      data: { name, year, institution: name === 'ENEM' ? 'INEP' : null },
    })
  );
}

/** Página de prova sem arquivo no storage: um SVG embutido como data URI, que
 * o <img> da tela de provas carrega sem depender de bucket. Serve só para o
 * acervo de demonstração — prova real entra por upload com URL do storage. */
function placeholderPage(title: string, year: number, pageNumber: number): string {
  const lines = Array.from({ length: 18 }, (_, i) => {
    const y = 150 + i * 52;
    const width = i % 5 === 4 ? 420 : 690;
    return (
      `<rect x="48" y="${y}" width="${width}" height="10" rx="5" fill="#e3e6ea"/>` +
      `<rect x="48" y="${y + 20}" width="${Math.round(width * 0.72)}" height="10" rx="5" fill="#eef0f3"/>`
    );
  }).join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">' +
    '<rect width="794" height="1123" fill="#ffffff"/>' +
    '<rect x="0" y="0" width="794" height="96" fill="#f4f5f7"/>' +
    `<text x="48" y="58" font-family="sans-serif" font-size="22" font-weight="bold" fill="#22262b">${title} ${year}</text>` +
    `<text x="48" y="82" font-family="sans-serif" font-size="14" fill="#6b7280">Pagina ${pageNumber} - exemplar de demonstracao</text>` +
    lines +
    '<text x="48" y="1080" font-family="sans-serif" font-size="11" fill="#9aa1a9">Conteudo ilustrativo. Nao e a prova oficial.</text>' +
    '</svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Item 23: biblioteca de redações nota mil. Sem vínculo com usuário, então
 * a chave de idempotência é (exam, year, theme). */
async function seedEssayModels(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const model of ESSAY_MODELS) {
    const competencies = model.competencies;
    const totalScore = Object.values(competencies).reduce((sum, score) => sum + score, 0);
    const existing = await prisma.essayModel.findFirst({
      where: { exam: model.exam, year: model.year, theme: model.theme },
    });
    if (existing) continue;
    await prisma.essayModel.create({
      data: {
        year: model.year,
        exam: model.exam,
        theme: model.theme,
        text: model.text,
        competenciesJson: competencies,
        totalScore,
        highlightsJson: model.highlights,
      },
    });
    created += 1;
  }
  return created;
}

/** Item 19: provas anteriores publicadas, com páginas de exemplar e as
 * questões do banco vinculadas. Uma prova é (examId, year) no schema, então
 * o seed é idempotente por essa chave. */
async function seedExamPapers(prisma: PrismaClient, bankId: string): Promise<number> {
  let created = 0;
  for (const paper of EXAM_PAPERS) {
    const exam = await ensureExam(prisma, paper.exam, paper.year);
    const existing = await prisma.examPaper.findFirst({
      where: { examId: exam.id, year: paper.year },
    });
    if (existing) continue;

    const questions = await prisma.question.findMany({
      where: { workspaceId: bankId, exam: paper.exam, year: paper.year },
      select: { id: true, subject: true },
      take: 5,
    });

    await prisma.examPaper.create({
      data: {
        examId: exam.id,
        year: paper.year,
        metadataJson: paper.metadata,
        gabaritoJson: paper.gabarito,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        pages: {
          create: Array.from({ length: paper.pages }, (_, index) => ({
            pageNumber: index + 1,
            imageUrl: placeholderPage(paper.exam, paper.year, index + 1),
            dimensionsJson: { width: 794, height: 1123 },
            textContent: `Página ${index + 1} de ${paper.exam} ${paper.year} (exemplar de demonstração).`,
          })),
        },
        questions: {
          create: questions.map((question, index) => ({
            questionId: question.id,
            number: index + 1,
            pageNumber: Math.min(index + 1, paper.pages),
            area: question.subject,
          })),
        },
      },
    });
    created += 1;
  }
  return created;
}

/** Itens 21 e 22: cadernos do aluno. A chave de idempotência é o título /
 * nome, porque o aluno pode renomear os dois a qualquer momento. */
async function seedNotebooks(
  prisma: PrismaClient,
  userId: string,
): Promise<{ formulas: number; repertoires: number }> {
  let formulas = 0;
  for (const formula of FORMULAS) {
    const existing = await prisma.formula.findFirst({
      where: { userId, name: formula.name },
    });
    if (existing) continue;
    await prisma.formula.create({
      data: {
        userId,
        name: formula.name,
        discipline: formula.discipline,
        topic: formula.topic,
        latex: formula.latex,
        description: formula.description,
        isFavorite: formula.isFavorite ?? false,
      },
    });
    formulas += 1;
  }

  let repertoires = 0;
  for (const repertoire of REPERTORIOS) {
    const existing = await prisma.repertoire.findFirst({
      where: { userId, title: repertoire.title },
    });
    if (existing) continue;
    await prisma.repertoire.create({
      data: {
        userId,
        title: repertoire.title,
        summary: repertoire.summary,
        source: repertoire.source,
        year: repertoire.year,
        theme: repertoire.theme,
        keywords: repertoire.keywords,
        isStudied: repertoire.isStudied ?? false,
      },
    });
    repertoires += 1;
  }

  return { formulas, repertoires };
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  try {
    // ----------------------------------------------------------------------
    // 1. Banco central + administrador
    // ----------------------------------------------------------------------
    const admin = await ensureUser(
      prisma,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_FIRST_NAME,
      ADMIN_LAST_NAME,
      'admin.lumina',
    );
    await ensurePersonalWorkspace(prisma, admin.id, `Workspace de ${ADMIN_FIRST_NAME}`);
    console.log(`✓ Conta do administrador pronta (${ADMIN_EMAIL}).`);

    const { institution, workspace: bank } = await ensureBank(prisma);
    await ensureBankAdmin(prisma, bank.id, admin.id);
    console.log(
      `✓ Banco de questões pronto: "${bank.name}" (${institution.email}, workspace ${bank.id}).`,
    );

    // ----------------------------------------------------------------------
    // 2. Conta demo (opcional, para testes manuais)
    // ----------------------------------------------------------------------
    const demo = await ensureUser(
      prisma,
      DEMO_EMAIL,
      DEMO_PASSWORD,
      DEMO_FIRST_NAME,
      DEMO_LAST_NAME,
      'demo.lumina',
    );
    await ensurePersonalWorkspace(prisma, demo.id, `Workspace de ${DEMO_FIRST_NAME}`);
    console.log(`✓ Conta demo pronta (${DEMO_EMAIL}).`);

    // ----------------------------------------------------------------------
    // 3. Catálogo + questões
    // ----------------------------------------------------------------------

    // ----------------------------------------------------------------------
    // 3a. Catálogo de disciplinas de estudo (ENEM)
    // ----------------------------------------------------------------------
    const STUDY_SUBJECTS = [
      { name: "Matemática", code: "MATH", displayOrder: 1 },
      { name: "Física", code: "PHYSICS", displayOrder: 2 },
      { name: "Química", code: "CHEMISTRY", displayOrder: 3 },
      { name: "Biologia", code: "BIOLOGY", displayOrder: 4 },
      { name: "Português", code: "PORTUGUESE", displayOrder: 5 },
      { name: "Literatura", code: "LITERATURE", displayOrder: 6 },
      { name: "História", code: "HISTORY", displayOrder: 7 },
      { name: "Geografia", code: "GEOGRAPHY", displayOrder: 8 },
      { name: "Filosofia", code: "PHILOSOPHY", displayOrder: 9 },
      { name: "Sociologia", code: "SOCILOGY", displayOrder: 10 },
      { name: "Inglês", code: "ENGLISH", displayOrder: 11 },
      { name: "Espanhol", code: "SPANISH", displayOrder: 12 },
      { name: "Artes", code: "ARTS", displayOrder: 13 },
      { name: "Educação Física", code: "PHYSICAL_EDUCATION", displayOrder: 14 },
      { name: "Redação", code: "ESSAY", displayOrder: 15 },
    ];

    for (const subject of STUDY_SUBJECTS) {
      await prisma.studySubject.upsert({
        where: { code: subject.code },
        update: { name: subject.name, displayOrder: subject.displayOrder },
        create: subject,
      });
    }
    console.log(`✓ ${STUDY_SUBJECTS.length} disciplinas de estudo do ENEM prontas.`);

    let imported = 0;
    let skipped = 0;
    for (const question of ALL_QUESTIONS) {
      const subject = await ensureSubject(prisma, question.subject);
      const topic = await ensureTopic(prisma, subject.id, question.topic);
      const exam = await ensureExam(prisma, question.exam, question.year);

      const sourceId = `lumina-bank-${slugify(question.subject)}-${question.year}-${slugify(
        question.topic,
      )}-${slugify(question.stem).slice(0, 48)}`;
      const contentHash = computeContentHash(question);

      const existing = await prisma.question.findFirst({
        where: { workspaceId: bank.id, OR: [{ sourceId }, { contentHash }] },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.question.create({
        data: {
          workspaceId: bank.id,
          createdBy: admin.id,
          sourceType: QuestionSourceType.OFFICIAL,
          sourceName: 'Lumina',
          sourceId,
          contentHash,
          subject: question.subject,
          topic: question.topic,
          subjectId: subject.id,
          topicId: topic.id,
          examId: exam.id,
          difficulty: question.difficulty,
          exam: question.exam,
          year: question.year,
          examNumber: question.examNumber ?? null,
          stem: question.stem,
          explanation: question.explanation ?? null,
          alternatives: {
            create: question.alternatives.map((alternative, index) => ({
              text: alternative.text,
              position: index + 1,
              isCorrect: alternative.isCorrect,
            })),
          },
        },
      });
      imported += 1;
    }

    console.log(
      `✓ Questões do banco prontas: ${imported} criadas, ${skipped} já existiam (${ALL_QUESTIONS.length} no total).`,
    );

    const topicMerge = await mergeDuplicateTopics(prisma);
    console.log(
      `✓ Tópicos duplicados fundidos: ${topicMerge.merged} (${topicMerge.questionsMoved} questões, ${topicMerge.masteriesMoved} domínios e ${topicMerge.tasksMoved} tarefas movidos).`,
    );

    const curriculumTopicsCreated = await seedCurriculumTopics(prisma);
    console.log(
      `✓ Tópicos do currículo do ENEM prontos: ${curriculumTopicsCreated} criados (cronograma adaptativo, fase 1).`,
    );

    // ----------------------------------------------------------------------
    // 4. Acervo de exibição: modelos de redação, provas antigas e cadernos
    // ----------------------------------------------------------------------

    const modelsCreated = await seedEssayModels(prisma);
    console.log(
      `✓ Modelos de redação nota mil prontos: ${modelsCreated} criados, ${ESSAY_MODELS.length} no total.`,
    );

    const papersCreated = await seedExamPapers(prisma, bank.id);
    console.log(
      `✓ Provas anteriores publicadas: ${papersCreated} criadas, ${EXAM_PAPERS.length} no total.`,
    );

    const notebooks = await seedNotebooks(prisma, demo.id);
    console.log(
      `✓ Caderno do usuário demo: ${notebooks.formulas} fórmulas e ${notebooks.repertoires} repertórios criados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Erro no seed:', error);
  process.exit(1);
});
