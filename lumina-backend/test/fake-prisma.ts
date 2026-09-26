import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

/**
 * Substituto em memória do PrismaService para os testes e2e — sobe a
 * aplicação NestJS real (guards, pipes, filtros, controllers) sem depender
 * de um Postgres de verdade. Implementa só a fatia da API do Prisma que os
 * repositórios da aplicação realmente usam.
 */
export function createFakePrisma() {
  const users: any[] = [];
  const vestibulares: any[] = [];
  const authSessions: any[] = [];
  const profiles: any[] = [];
  const teacherProfiles: any[] = [];
  const essayThemes: any[] = [];
  const workspaces: any[] = [];
  const workspaceMembers: any[] = [];
  const roles: any[] = [];
  const institutions: any[] = [];
  const questions: any[] = [];
  const alternatives: any[] = [];
  const attempts: any[] = [];
  const subjects: any[] = [];
  const topics: any[] = [];
  const exams: any[] = [];
  const progress: any[] = [];
  let counter = 0;
  // IDs de verdade (UUID v4), como o Postgres gera — necessário porque o
  // ParseUUIDPipe valida o formato dos params de rota. O prefixo é ignorado.
  const nextId = (_prefix?: string) => randomUUID();
  // Permissões de workspace que o cadastro institucional consulta para
  // compor os cargos de Diretor e Coordenador.
  const permissions: any[] = ['ROLE_MANAGE', 'MEMBER_MANAGE', 'CLASS_MANAGE', 'REPORT_VIEW']
    .map((code) => ({ id: nextId('permission'), code }));

  /** Filtro do `user_question_progress`: usuário, favoritos, revisão e lote de
   * questões. Usado tanto pelo `findMany` quanto pelo `count`. */
  const matchesProgressWhere = (where: any) => (p: any) =>
    (!where?.userId || p.userId === where.userId) &&
    (where?.isFavorite === undefined || p.isFavorite === where.isFavorite) &&
    (where?.markedForReview === undefined ||
      p.markedForReview === where.markedForReview) &&
    (!where?.questionId ||
      (Array.isArray(where.questionId.in)
        ? where.questionId.in.includes(p.questionId)
        : p.questionId === where.questionId));

  const withProfile = (user: any) => ({
    ...user,
    profile: profiles.find((p) => p.userId === user.id) ?? null,
    teacherProfile: teacherProfiles.find((p) => p.userId === user.id) ?? null,
  });

  const withAlternatives = (question: any) => ({
    ...question,
    alternatives: alternatives
      .filter((a) => a.questionId === question.id)
      .sort((a, b) => a.position - b.position),
  });

  const questionMatches = (question: any, where: any) => {
    if (!where) return true;
    if (where.workspaceId) {
      if (Array.isArray(where.workspaceId?.in)) {
        if (!where.workspaceId.in.includes(question.workspaceId)) return false;
      } else if (question.workspaceId !== where.workspaceId) return false;
    }
    // Pré-filtro de ids vindo da busca textual (unaccent no banco): a
    // listagem restringe por este `in` em vez de repetir o `contains` acento
    // sensível no Prisma.
    if (where.id) {
      if (Array.isArray(where.id?.in)) {
        if (!where.id.in.includes(question.id)) return false;
      } else if (question.id !== where.id) return false;
    }
    if (where.difficulty && question.difficulty !== where.difficulty) return false;
    if (where.year && question.year !== where.year) return false;
    if (where.examNumber && question.examNumber !== where.examNumber) return false;
    if (where.stem?.contains && !question.stem.toLowerCase().includes(where.stem.contains.toLowerCase())) return false;
    if (where.subjectId && question.subjectId !== where.subjectId) return false;
    if (where.topicId && question.topicId !== where.topicId) return false;
    if (where.examId && question.examId !== where.examId) return false;
    if (where.sourceType && question.sourceType !== where.sourceType) return false;
    if (where.sourceId && question.sourceId !== where.sourceId) return false;
    if (where.contentHash && question.contentHash !== where.contentHash) return false;
    // Cláusula OR: ao menos um dos ramos precisa casar com a questão. Usada
    // pela busca de questões na web (item 10) para varrer assunto/tópico/
    // prova/enunciado pelo mesmo termo. Os ramos são reavaliados por esta
    // mesma função, então cada um aplica seus próprios filtros.
    if (Array.isArray(where.OR)) {
      if (!where.OR.some((clause: any) => questionMatches(question, clause))) return false;
    }
    for (const field of ['subject', 'topic', 'exam'] as const) {
      const filter = where[field];
      if (filter?.contains && !question[field].toLowerCase().includes(filter.contains.toLowerCase())) {
        return false;
      }
    }
    return true;
  };

  const findSubjectByName = (name: string) => subjects.find((s) => s.name === name);

  /** Emula o `unaccent()` do Postgres, para a busca textual do fake casar
   * "funcoes" com "Funções" como o banco real faz. */
  const unaccent = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const fake: any = {
    /**
     * Só a busca textual (QuestionTextSearchRepository) usa SQL cru. O
     * formato dos parâmetros é o de `buildTextSearchSql`: primeiro os
     * workspaceIds, depois o padrão ILIKE (uma vez por coluna pesquisável) e
     * por último o teto de ids. Reproduz o `unaccent(coluna) ILIKE unaccent($1)`
     * devolvendo só os ids, como o banco faria.
     */
    $queryRaw: vi.fn(async (sql: any) => {
      const values = (sql?.values ?? []).map((value: unknown) => String(value));
      const patternIndex = values.findIndex((v: string) => v.startsWith('%') && v.endsWith('%'));
      if (patternIndex < 0) return [];

      const workspaceIds = values.slice(0, patternIndex);
      // o padrão vem escapado para o LIKE; aqui só precisa virar texto
      const needle = unaccent(values[patternIndex].slice(1, -1).replace(/\\(.)/g, '$1'));
      const limit = Number(values[values.length - 1]) || questions.length;

      return questions
        .filter((q) => workspaceIds.length === 0 || workspaceIds.includes(q.workspaceId))
        .filter((q) =>
          (['stem', 'topic', 'subject', 'exam'] as const).some((field) =>
            unaccent(String(q[field] ?? '')).includes(needle),
          ),
        )
        .slice(0, limit)
        .map((q) => ({ id: q.id }));
    }),

    userVestibular: {
      findUnique: vi.fn(async ({ where }: any) => vestibulares.find(v => v.userId === where.userId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = vestibulares.find(v => v.userId === where.userId);
        if (existing) {
          Object.assign(existing, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)), { updatedAt: new Date() });
          return existing;
        }
        const value = { id: nextId('vestibular'), createdAt: new Date(), updatedAt: new Date(), ...create };
        vestibulares.push(value);
        return value;
      }),
    },
    authSession: {
      create: vi.fn(async ({ data }: any) => {
        const now = new Date();
        const session = { id: nextId('session'), userId: data.userId, createdAt: now, lastUsedAt: now, revokedAt: null };
        authSessions.push(session);
        return session;
      }),
      findFirst: vi.fn(async ({ where }: any) => authSessions.find(s => s.id === where.id && s.userId === where.userId && s.revokedAt === where.revokedAt) ?? null),
      findMany: vi.fn(async ({ where }: any) => authSessions.filter(s => s.userId === where.userId && s.revokedAt === where.revokedAt).sort((a, b) => +b.createdAt - +a.createdAt)),
      update: vi.fn(async ({ where, data }: any) => {
        const session = authSessions.find(s => s.id === where.id);
        Object.assign(session, data);
        return session;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = authSessions.filter(s => s.userId === where.userId && (!where.id || s.id === where.id) && s.revokedAt === where.revokedAt);
        matches.forEach(s => Object.assign(s, data));
        return { count: matches.length };
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const user = users.find(
          (u) =>
            (where.id && u.id === where.id) ||
            (where.email && u.email === where.email) ||
            (where.googleId && u.googleId === where.googleId),
        );
        if (!user) return null;
        return include?.profile ? withProfile(user) : user;
      }),
      create: vi.fn(async ({ data, include }: any) => {
        const id = nextId('user');
        const now = new Date();
        const user = {
          id,
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          googleId: data.googleId ?? null,
          accountType: data.accountType ?? 'STUDENT_INDEPENDENT',
          sessionVersion: 0,
          emailVerified: data.emailVerified ?? false,
          status: 'ACTIVE',
          lastLogin: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        users.push(user);

        if (data.profile?.create) {
          profiles.push({
            id: nextId('profile'),
            userId: id,
            firstName: data.profile.create.firstName,
            lastName: data.profile.create.lastName,
            username: data.profile.create.username ?? null,
            avatarUrl: data.profile.create.avatarUrl ?? null,
            phone: null,
            birthDate: null,
            bio: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        if (data.teacherProfile?.create) teacherProfiles.push({ userId: id, subject: data.teacherProfile.create.subject });

        return include?.profile ? withProfile(user) : user;
      }),
      update: vi.fn(async ({ where, data, include }: any) => {
        const user = users.find((u) => u.id === where.id);
        if (data.sessionVersion?.increment) data = { ...data, sessionVersion: user.sessionVersion + data.sessionVersion.increment };
        if (data.profile?.update) {
          const profile = profiles.find((p) => p.userId === user.id);
          Object.assign(profile, data.profile.update, { updatedAt: new Date() });
        }
        const { profile: _profile, ...userData } = data;
        Object.assign(user, userData);
        return include?.profile ? withProfile(user) : user;
      }),
    },
    teacherProfile: {
      findUnique: vi.fn(async ({ where }: any) => teacherProfiles.find(p => p.userId === where.userId) ?? null),
    },
    essayTheme: {
      findMany: vi.fn(async ({ where }: any) => essayThemes.filter(t => t.exam === where.exam && (!where.year || t.year === where.year) && (!where.createdBy || t.createdBy === where.createdBy)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))),
      create: vi.fn(async ({ data }: any) => {
        const theme = { id: nextId('theme'), year: null, sourceUrl: null, createdAt: new Date(), ...data };
        essayThemes.push(theme); return theme;
      }),
    },
    userProfile: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const profile = profiles.find((p) => p.username === where.username);
        if (!profile) return null;
        return include?.user ? { ...profile, user: users.find((u) => u.id === profile.userId) } : profile;
      }),
    },
    workspace: {
      create: vi.fn(async ({ data }: any) => {
        const workspace = {
          id: nextId('workspace'),
          name: data.name,
          type: data.type,
          institutionId: data.institutionId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        workspaces.push(workspace);
        return workspace;
      }),
      findUnique: vi.fn(async ({ where }: any) => workspaces.find((w) => w.id === where.id) ?? null),
    },
    institution: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const institution = institutions.find((i) => i.email === where.email);
        if (!institution) return null;
        return include?.workspace
          ? {
              ...institution,
              workspace: workspaces.find((w) => w.institutionId === institution.id) ?? null,
            }
          : institution;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = nextId('institution');
        const now = new Date();
        const institution = {
          id,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        };
        institutions.push(institution);
        if (data.workspace?.create) {
          workspaces.push({
            id: nextId('workspace'),
            name: data.workspace.create.name,
            type: data.workspace.create.type,
            institutionId: id,
            createdAt: now,
            updatedAt: now,
          });
        }
        return {
          ...institution,
          workspace: workspaces.find((w) => w.institutionId === id) ?? null,
        };
      }),
      findUniqueOrThrow: vi.fn(async ({ where, include }: any) => {
        const institution = institutions.find((i) => i.id === where.id);
        return include?.workspace
          ? {
              ...institution,
              workspace: workspaces.find((w) => w.institutionId === institution.id) ?? null,
            }
          : institution;
      }),
    },
    permission: {
      findMany: vi.fn(async ({ where }: any) =>
        permissions.filter((p) => !where?.code?.in || where.code.in.includes(p.code)),
      ),
    },
    workspaceMember: {
      create: vi.fn(async ({ data }: any) => {
        const member = {
          id: nextId('member'),
          workspaceId: data.workspaceId,
          userId: data.userId,
          roleId: data.roleId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        };
        workspaceMembers.push(member);
        return member;
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const member = workspaceMembers.find((m) => {
          if (where.userId && m.userId !== where.userId) return false;
          if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
          if (where.workspace?.type) {
            const workspace = workspaces.find((w) => w.id === m.workspaceId);
            if (workspace?.type !== where.workspace.type) return false;
          }
          return true;
        });
        if (!member) return null;
        const workspace = workspaces.find((w) => w.id === member.workspaceId);
        const role = { ...(roles.find((r) => r.id === member.roleId) ?? { id: member.roleId, name: 'Owner' }), rolePermissions: [] };
        return {
          ...member,
          workspace: include?.workspace ? workspace : undefined,
          role: include?.role ? role : undefined,
        };
      }),
      findMany: vi.fn(async ({ where, include }: any) => workspaceMembers.filter((m) => m.userId === where.userId && (!where.status || m.status === where.status)).map((member) => ({
        ...member,
        workspace: include?.workspace ? workspaces.find((w) => w.id === member.workspaceId) : undefined,
        role: include?.role ? { ...(roles.find((r) => r.id === member.roleId) ?? { id: member.roleId, name: 'Owner' }), rolePermissions: [] } : undefined,
      }))),
    },
    role: {
      create: vi.fn(async ({ data }: any) => {
        const role = { id: nextId('role'), description: null, isSystem: false, ...data };
        roles.push(role);
        return role;
      }),
      findMany: vi.fn(async ({ where }: any) => roles.filter((role) => role.workspaceId === where.workspaceId).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, description, isSystem }) => ({ id, name, description, isSystem }))),
    },
    emailVerificationCode: {
      create: vi.fn(async () => ({ id: nextId('code') })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    subject: {
      findUnique: vi.fn(async ({ where }: any) => {
        const subject = where.id
          ? subjects.find((s) => s.id === where.id)
          : findSubjectByName(where.name);
        return subject ?? null;
      }),
      findMany: vi.fn(async ({ orderBy }: any) => {
        const list = [...subjects];
        if (orderBy?.name === 'asc') list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
      }),
      upsert: vi.fn(async ({ where, create }: any) => {
        const existing = findSubjectByName(where.name);
        if (existing) return existing;
        const subject = {
          id: nextId('subject'),
          name: create.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        subjects.push(subject);
        return subject;
      }),
    },
    topic: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return topics.find((t) => t.id === where.id) ?? null;
        const { subjectId, name } = where.subjectId_name ?? {};
        return topics.find((t) => t.subjectId === subjectId && t.name === name) ?? null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        const list = topics.filter((t) => !where?.subjectId || t.subjectId === where.subjectId);
        if (orderBy?.name === 'asc') list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
      }),
      upsert: vi.fn(async ({ where, create }: any) => {
        const { subjectId, name } = where.subjectId_name ?? {};
        const existing = topics.find((t) => t.subjectId === subjectId && t.name === name);
        if (existing) return existing;
        const topic = {
          id: nextId('topic'),
          subjectId: create.subjectId,
          name: create.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        topics.push(topic);
        return topic;
      }),
    },
    exam: {
      findUnique: vi.fn(async ({ where }: any) => exams.find((e) => e.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) =>
        exams.find(
          (e) =>
            e.name === where.name &&
            (where.year === undefined || where.year === null || e.year === where.year),
        ) ?? null,
      ),
      findMany: vi.fn(async ({ skip = 0, take = Infinity }: any) => {
        const list = [...exams].sort(
          (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name),
        );
        return list.slice(skip, skip + take);
      }),
      count: vi.fn(async () => exams.length),
      create: vi.fn(async ({ data }: any) => {
        const exam = {
          id: nextId('exam'),
          name: data.name,
          year: data.year ?? null,
          institution: data.institution ?? null,
          description: data.description ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        exams.push(exam);
        return exam;
      }),
    },
    question: {
      create: vi.fn(async ({ data, include }: any) => {
        const id = nextId('question');
        const now = new Date();
        const question = {
          id,
          workspaceId: data.workspaceId,
          sourceType: data.sourceType ?? 'OFFICIAL',
          sourceName: data.sourceName ?? 'Lumina',
          sourceId: data.sourceId ?? null,
          contentHash: data.contentHash ?? null,
          subject: data.subject,
          topic: data.topic,
          subjectId: data.subjectId ?? null,
          topicId: data.topicId ?? null,
          examId: data.examId ?? null,
          difficulty: data.difficulty,
          exam: data.exam,
          year: data.year ?? null,
          examNumber: data.examNumber ?? null,
          stem: data.stem,
          explanation: data.explanation ?? null,
          imageUrl: data.imageUrl ?? null,
          metadata: data.metadata ?? null,
          createdAt: now,
          updatedAt: now,
        };
        questions.push(question);
        (data.alternatives?.create ?? []).forEach((alternative: any) => {
          alternatives.push({
            id: nextId('alt'),
            questionId: id,
            text: alternative.text,
            position: alternative.position,
            isCorrect: alternative.isCorrect,
            explanation: alternative.explanation ?? null,
            createdAt: now,
          });
        });
        return include?.alternatives ? withAlternatives(question) : question;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const question = questions.find((q) => q.id === where.id);
        if (!question) return null;
        return include?.alternatives ? withAlternatives(question) : question;
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const question = questions.find((q) => questionMatches(q, where));
        if (!question) return null;
        return include?.alternatives ? withAlternatives(question) : question;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = Infinity, orderBy, include }: any) => {
        const list = questions
          .filter((q) => questionMatches(q, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take);
        void orderBy;
        return include?.alternatives ? list.map(withAlternatives) : list;
      }),
      count: vi.fn(async ({ where }: any) => questions.filter((q) => questionMatches(q, where)).length),
      update: vi.fn(async ({ where, data, include }: any) => {
        const question = questions.find((q) => q.id === where.id);
        const { alternatives, ...fields } = data;
        Object.assign(question, fields);
        void alternatives;
        question.updatedAt = new Date();
        return include?.alternatives ? withAlternatives(question) : question;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = questions.findIndex((q) => q.id === where.id);
        const [question] = questions.splice(index, 1);
        const altIndexes = alternatives
          .map((a, i) => (a.questionId === question.id ? i : -1))
          .filter((i) => i >= 0)
          .reverse();
        altIndexes.forEach((i) => alternatives.splice(i, 1));
        return question;
      }),
    },
    questionAlternative: {
      findMany: vi.fn(async ({ where }: any = {}) =>
        where?.questionId
          ? alternatives.filter((a) => a.questionId === where.questionId)
          : [...alternatives],
      ),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = alternatives.length;
        for (let i = alternatives.length - 1; i >= 0; i--) {
          if (alternatives[i].questionId === where.questionId) alternatives.splice(i, 1);
        }
        return { count: before - alternatives.length };
      }),
      createMany: vi.fn(async ({ data }: any) => {
        data.forEach((alternative: any) => {
          alternatives.push({
            id: nextId('alt'),
            questionId: alternative.questionId,
            text: alternative.text,
            position: alternative.position,
            isCorrect: alternative.isCorrect,
            // A explicação do distrator é opcional: só o autor a escreve e o
            // aluno só a vê depois de responder.
            explanation: alternative.explanation ?? null,
            createdAt: new Date(),
          });
        });
        return { count: data.length };
      }),
    },
    questionAttempt: {
      create: vi.fn(async ({ data }: any) => {
        const attempt = { id: nextId('attempt'), ...data, createdAt: new Date() };
        attempts.push(attempt);
        return attempt;
      }),
      findMany: vi.fn(async ({ where, take = Infinity }: any) => {
        const inWorkspaces = Array.isArray(where?.workspaceId?.in);
        const inQuestions = Array.isArray(where?.questionId?.in);
        return attempts
          .filter(
            (a) =>
              (!where?.userId || a.userId === where.userId) &&
              (!where?.workspaceId ||
                (inWorkspaces
                  ? where.workspaceId.in.includes(a.workspaceId)
                  : a.workspaceId === where.workspaceId)) &&
              (!where?.questionId ||
                (inQuestions
                  ? where.questionId.in.includes(a.questionId)
                  : a.questionId === where.questionId)),
          )
          .slice(0, take)
          .map((a) => ({
            ...a,
            question: questions.find((q) => q.id === a.questionId) ?? null,
          }));
      }),
    },
    userQuestionProgress: {
      findUnique: vi.fn(async ({ where }: any) => {
        const { userId, questionId } = where.userId_questionId ?? {};
        return progress.find((p) => p.userId === userId && p.questionId === questionId) ?? null;
      }),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const { userId, questionId } = where.userId_questionId ?? {};
        let record = progress.find((p) => p.userId === userId && p.questionId === questionId);
        const now = new Date();
        if (record) {
          for (const [key, value] of Object.entries(update ?? {})) {
            record[key] =
              value && typeof value === 'object' && 'increment' in value
                ? (record[key] ?? 0) + value.increment
                : value;
          }
          return record;
        }
        record = {
          id: nextId('progress'),
          userId: create.userId,
          questionId: create.questionId,
          attempts: create.attempts ?? 0,
          correctAttempts: create.correctAttempts ?? 0,
          incorrectAttempts: create.incorrectAttempts ?? 0,
          isFavorite: create.isFavorite ?? false,
          markedForReview: create.markedForReview ?? false,
          lastAttemptAt: create.lastAttemptAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        progress.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = Infinity, orderBy }: any) => {
        void orderBy;
        const rows = progress
          .filter(matchesProgressWhere(where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(skip, skip + take);
        return rows.map((p) => ({
          ...p,
          question: questions.find((q) => q.id === p.questionId) ?? null,
        }));
      }),
      count: vi.fn(async ({ where }: any) => progress.filter(matchesProgressWhere(where)).length),
    },
    $transaction: vi.fn(async (cb: any) => Array.isArray(cb) ? Promise.all(cb) : cb(fake)),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };

  /** Cria o banco central (Institution "Lumina" + Workspace INSTITUTION)
   * usado nos testes de acesso público do banco de questões. */
  fake.seedBankWorkspace = (name = 'Banco de Questões Lumina') => {
    const institutionId = nextId('institution');
    institutions.push({
      id: institutionId,
      name: 'Lumina',
      email: 'banco@lumina.app',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const workspace = {
      id: nextId('workspace'),
      name,
      type: 'INSTITUTION',
      institutionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    workspaces.push(workspace);
    return workspace;
  };

  return fake;
}
