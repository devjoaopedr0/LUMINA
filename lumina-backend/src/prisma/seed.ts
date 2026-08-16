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
import type { SeedQuestion } from '../../prisma/seed-data/types';

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

async function ensureExam(prisma: PrismaClient, name: string, year: number) {
  const existing = await prisma.exam.findFirst({ where: { name, year } });
  return (
    existing ??
    prisma.exam.create({
      data: { name, year, institution: name === 'ENEM' ? 'INEP' : null },
    })
  );
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Erro no seed:', error);
  process.exit(1);
});
