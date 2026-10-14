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
  const notebookEntries: any[] = [];
  const topicMasteries: any[] = [];
  const topicMasteryHistory: any[] = [];
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

  /** Projeção de `select` do Prisma (inclusive aninhado), como o banco faria. */
  const project = (row: any, select: any): any => {
    if (row === null || row === undefined) return row;
    if (!select) return row;
    const out: any = {};
    for (const [key, value] of Object.entries(select)) {
      if (value === true) out[key] = row[key];
      else if (value && typeof value === 'object' && 'select' in value) {
        out[key] = project(row[key], value.select);
      }
    }
    return out;
  };

  /** Entrada do caderno + resumo da questão, como `include`/`select` pedem.
   *  A questão entra por `include` numa busca e por `select` na listagem — as
   *  duas formas precisam devolver o mesmo conteúdo. */
  const withNotebookQuestion = (entry: any, include: any, select: any) => {
    const question = questions.find((q) => q.id === entry.questionId) ?? null;
    const questionSelect = include?.question?.select ?? select?.question?.select;
    const wantsQuestion = Boolean(include?.question) || Boolean(select?.question);
    const base = wantsQuestion ? { ...entry, question: project(question, questionSelect) } : entry;
    return project(base, select);
  };

  const applyNotebookData = (entry: any, data: any) => {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value === undefined) continue;
      entry[key] =
        value && typeof value === 'object' && 'increment' in value
          ? (entry[key] ?? 0) + value.increment
          : value;
    }
  };

  /** Filtro de `error_notebook_entries`: usuário, situação, motivo, revisão
   *  vencida e os campos da questão (matéria, assunto, dificuldade). */
  const matchesNotebookWhere = (where: any, entry: any): boolean => {
    if (!where) return true;
    if (where.userId && entry.userId !== where.userId) return false;
    if (where.status && entry.status !== where.status) return false;
    if (where.reason !== undefined && entry.reason !== where.reason) return false;
    if (where.reviewScheduledAt) {
      const filtro = where.reviewScheduledAt;
      // `not: null` no Prisma significa "a coluna não é nula".
      if (filtro.not === null && entry.reviewScheduledAt === null) return false;
      if (filtro.lte && !(entry.reviewScheduledAt && entry.reviewScheduledAt <= filtro.lte)) {
        return false;
      }
    }
    if (where.question) {
      const question = questions.find((q) => q.id === entry.questionId);
      if (!question) return false;
      for (const field of ['subject', 'topic', 'difficulty'] as const) {
        const filtro = where.question[field];
        if (filtro === undefined) continue;
        // O Prisma aceita igualdade direta (`difficulty: 'DIFICIL'`) ou
        // explícita (`{ equals, mode }`); o fake aceita as duas formas.
        const pedido =
          filtro && typeof filtro === 'object' ? filtro.equals : filtro;
        if (pedido === undefined) continue;
        const atual = String(question[field] ?? '').toLowerCase();
        if (atual !== String(pedido).toLowerCase()) return false;
      }
    }
    return true;
  };

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
        // ON DELETE CASCADE: questão apagada não deixa pendência no caderno de
        // quem errou.
        for (let i = notebookEntries.length - 1; i >= 0; i--) {
          if (notebookEntries[i].questionId === question.id) notebookEntries.splice(i, 1);
        }
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
    errorNotebookEntry: {
      findUnique: vi.fn(async ({ where, include, select }: any) => {
        const { userId, questionId } = where.userId_questionId ?? {};
        const entry = notebookEntries.find(
          (e) => e.userId === userId && e.questionId === questionId,
        );
        if (!entry) return null;
        return withNotebookQuestion(entry, include, select);
      }),
      create: vi.fn(async ({ data, include, select }: any) => {
        const now = new Date();
        const entry = {
          id: nextId('notebook'),
          userId: data.userId,
          questionId: data.questionId,
          reason: data.reason ?? null,
          notes: data.notes ?? null,
          status: data.status ?? 'ABERTA',
          wrongAttempts: data.wrongAttempts ?? 1,
          correctStreak: data.correctStreak ?? 0,
          evolution: data.evolution ?? '',
          reviewScheduledAt: data.reviewScheduledAt ?? null,
          firstWrongAt: data.firstWrongAt ?? now,
          lastWrongAt: data.lastWrongAt ?? now,
          resolvedAt: data.resolvedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        notebookEntries.push(entry);
        return withNotebookQuestion(entry, include, select);
      }),
      update: vi.fn(async ({ where, data, include, select }: any) => {
        const entry = notebookEntries.find((e) => e.id === where.id);
        applyNotebookData(entry, data);
        entry.updatedAt = new Date();
        return withNotebookQuestion(entry, include, select);
      }),
      upsert: vi.fn(async ({ where, create, update, include, select }: any) => {
        const { userId, questionId } = where.userId_questionId ?? {};
        let entry = notebookEntries.find(
          (e) => e.userId === userId && e.questionId === questionId,
        );
        if (entry) {
          applyNotebookData(entry, update ?? {});
          return withNotebookQuestion(entry, include, select);
        }
        entry = {
          id: nextId('notebook'),
          userId: create.userId,
          questionId: create.questionId,
          reason: create.reason ?? null,
          notes: create.notes ?? null,
          status: create.status ?? 'ABERTA',
          wrongAttempts: create.wrongAttempts ?? 1,
          correctStreak: create.correctStreak ?? 0,
          evolution: create.evolution ?? '',
          reviewScheduledAt: create.reviewScheduledAt ?? null,
          firstWrongAt: create.firstWrongAt ?? new Date(),
          lastWrongAt: create.lastWrongAt ?? new Date(),
          resolvedAt: create.resolvedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        notebookEntries.push(entry);
        return withNotebookQuestion(entry, include, select);
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = Infinity, orderBy, include, select }: any) => {
        const list = notebookEntries
          .filter((e) => matchesNotebookWhere(where, e))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        // Abertas antes das dominadas (ordem alfabética do enum: ABERTA < DOMINADA)
        // e, dentro do grupo, o erro mais recente primeiro.
        for (const clause of orderBy ?? []) {
          if (clause.status) {
            list.sort((a, b) => String(a.status).localeCompare(String(b.status)));
          }
          if (clause.lastWrongAt) {
            list.sort((a, b) => b.lastWrongAt.getTime() - a.lastWrongAt.getTime());
          }
        }
        return list.slice(skip, skip + take).map((e) => withNotebookQuestion(e, include, select));
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = notebookEntries.length;
        for (let i = notebookEntries.length - 1; i >= 0; i--) {
          const entry = notebookEntries[i];
          const matches =
            (!where?.userId || entry.userId === where.userId) &&
            (!where?.questionId || entry.questionId === where.questionId);
          if (matches) notebookEntries.splice(i, 1);
        }
        return { count: before - notebookEntries.length };
      }),
      count: vi.fn(async ({ where }: any) =>
        notebookEntries.filter((e) => matchesNotebookWhere(where, e)).length,
      ),
    },
    topicMastery: {
      findUnique: vi.fn(async ({ where }: any) => {
        const { userId, topicId } = where.userId_topicId ?? {};
        return topicMasteries.find((m) => m.userId === userId && m.topicId === topicId) ?? null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const { userId, topicId } = where.userId_topicId ?? {};
        let entry = topicMasteries.find((m) => m.userId === userId && m.topicId === topicId);
        if (entry) {
          Object.assign(entry, update);
          entry.updatedAt = new Date();
          return entry;
        }
        entry = {
          id: nextId('topic-mastery'),
          userId: create.userId,
          subjectId: create.subjectId,
          topicId: create.topicId,
          masteryScore: create.masteryScore ?? 0,
          attempts: create.attempts ?? 0,
          correctAttempts: create.correctAttempts ?? 0,
          correctStreak: create.correctStreak ?? 0,
          status: create.status ?? 'NAO_ESTUDADO',
          lastStudiedAt: create.lastStudiedAt ?? null,
          nextReviewAt: create.nextReviewAt ?? null,
          reviewIntervalDays: create.reviewIntervalDays ?? 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        topicMasteries.push(entry);
        return entry;
      }),
      findMany: vi.fn(async ({ where, include }: any) => {
        const list = topicMasteries.filter((m) => !where?.userId || m.userId === where.userId);
        if (!include) return list;
        return list.map((m) => ({
          ...m,
          subject: include.subject ? (subjects.find((s) => s.id === m.subjectId) ?? null) : undefined,
          topic: include.topic ? (topics.find((t) => t.id === m.topicId) ?? null) : undefined,
        }));
      }),
    },
    // Histórico do domínio: uma linha por (aluno, tópico, dia).
    topicMasteryHistory: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const { userId, topicId, day } = where.userId_topicId_day;
        const sameDay = (row: any) =>
          row.userId === userId && row.topicId === topicId && row.day.getTime() === day.getTime();
        let entry = topicMasteryHistory.find(sameDay);
        if (entry) Object.assign(entry, update);
        else {
          entry = { id: nextId('topic-mastery-history'), ...create };
          topicMasteryHistory.push(entry);
        }
        return entry;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        topicMasteryHistory.filter((row) => !where?.userId || row.userId === where.userId)),
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
