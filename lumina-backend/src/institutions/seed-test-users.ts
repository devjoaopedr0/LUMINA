/**
 * Contas de teste de telas e funcionalidades, por perfil (ambiente de
 * desenvolvimento). Idempotente: reexecutar não duplica nem troca senhas.
 *
 *   npm run build && npm run seed:test-users
 *
 * Cria a instituição "Escola Teste Lumina" (pelo mesmo fluxo do cadastro de
 * instituição do app) com direção, coordenação, professor e aluno
 * vinculados, e a turma "Turma Teste 3A" com o professor e o aluno. Também
 * garante as contas independentes (.teste@lumina.dev) que já existiam.
 *
 * Senha de todas as contas desta lista: Teste@1234 (só para desenvolvimento).
 * As contas do seed principal (admin@lumina.app, demo@lumina.app) têm as
 * senhas documentadas em src/prisma/seed.ts.
 */
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkspaceMemberStatus, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { InstitutionsService, ROLE_ALUNO, ROLE_COORDENADOR, ROLE_PROFESSOR } from './institutions.service';

export const TEST_PASSWORD = 'Teste@1234';
const INSTITUTION = { name: 'Escola Teste Lumina', email: 'escola.teste@lumina.dev' };
const CLASS_NAME = 'Turma Teste 3A';
const CLASS_JOIN_CODE = 'TESTE3A';

type AccountType = 'STUDENT_INDEPENDENT' | 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR' | 'DIRECTOR' | 'ADMIN';

interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  accountType: AccountType;
  teacherSubject?: string;
}

export const TEST_USERS = {
  director: { email: 'diretor.teste@lumina.dev', firstName: 'Diretora', lastName: 'Teste', username: 'diretora_teste', accountType: 'DIRECTOR' },
  coordinator: { email: 'coordenador.teste@lumina.dev', firstName: 'Coordenador', lastName: 'Teste', username: 'coordenador_teste', accountType: 'COORDINATOR' },
  schoolTeacher: { email: 'professor.escola.teste@lumina.dev', firstName: 'Professora', lastName: 'da Escola', username: 'professora_escola_teste', accountType: 'TEACHER', teacherSubject: 'Matemática' },
  schoolStudent: { email: 'aluno.escola.teste@lumina.dev', firstName: 'Aluno', lastName: 'da Escola', username: 'aluno_escola_teste', accountType: 'STUDENT_INSTITUTION' },
} satisfies Record<string, TestUser>;

async function ensureUser(prisma: PrismaService, u: TestUser) {
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        emailVerified: true,
        accountType: u.accountType,
        profile: { create: { firstName: u.firstName, lastName: u.lastName, username: u.username } },
      },
    }));
  if (u.teacherSubject) {
    await prisma.teacherProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, subject: u.teacherSubject } });
  }
  // Workspace pessoal com cargo Owner, como no cadastro normal.
  const personal = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspace: { type: WorkspaceType.PERSONAL } } });
  if (!personal) {
    await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name: `Workspace de ${u.firstName}`, type: WorkspaceType.PERSONAL } });
      const role = await tx.role.create({ data: { workspaceId: ws.id, name: 'Owner', description: 'Cargo padrão do dono do workspace pessoal.', isSystem: true } });
      await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, roleId: role.id } });
    });
  }
  return user;
}

async function main() {
  process.loadEnvFile(join(__dirname, '..', '..', '.env'));
  const prisma = new PrismaService({ get: (k: string) => process.env[k] } as unknown as ConfigService);
  try {
    const director = await ensureUser(prisma, TEST_USERS.director);
    let institution = await prisma.institution.findUnique({ where: { email: INSTITUTION.email }, include: { workspace: true } });
    if (!institution) {
      institution = await prisma.$transaction((tx) =>
        InstitutionsService.createInTransaction(tx as Prisma.TransactionClient, director.id, { name: INSTITUTION.name, email: INSTITUTION.email } as never),
      );
    }
    const workspaceId = institution.workspace!.id;
    const roles = await prisma.role.findMany({ where: { workspaceId } });
    const roleId = (name: string) => roles.find((r) => r.name === name)!.id;

    const link = async (userId: string, role: string, accountType: AccountType) => {
      await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: {},
        create: { workspaceId, userId, roleId: roleId(role), status: WorkspaceMemberStatus.ACTIVE },
      });
      await prisma.user.update({ where: { id: userId }, data: { accountType } });
    };
    const coordinator = await ensureUser(prisma, TEST_USERS.coordinator);
    await link(coordinator.id, ROLE_COORDENADOR, 'COORDINATOR');
    const teacher = await ensureUser(prisma, TEST_USERS.schoolTeacher);
    await link(teacher.id, ROLE_PROFESSOR, 'TEACHER');
    const student = await ensureUser(prisma, TEST_USERS.schoolStudent);
    await link(student.id, ROLE_ALUNO, 'STUDENT_INSTITUTION');

    const klass =
      (await prisma.class.findFirst({ where: { workspaceId, name: CLASS_NAME } })) ??
      (await prisma.class.create({ data: { workspaceId, name: CLASS_NAME, joinCode: CLASS_JOIN_CODE, createdBy: teacher.id, coordinatorId: coordinator.id } }));
    await prisma.classTeacher.upsert({ where: { classId_userId: { classId: klass.id, userId: teacher.id } }, update: {}, create: { classId: klass.id, userId: teacher.id } });
    await prisma.classMember.upsert({ where: { classId_userId: { classId: klass.id, userId: student.id } }, update: {}, create: { classId: klass.id, userId: student.id } });

    console.log(`Instituição: ${institution.name} · turma ${klass.name} (código ${klass.joinCode})`);
    for (const u of Object.values(TEST_USERS)) console.log(`  ${u.accountType.padEnd(20)} ${u.email}`);
    console.log(`Senha (desenvolvimento): ${TEST_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
