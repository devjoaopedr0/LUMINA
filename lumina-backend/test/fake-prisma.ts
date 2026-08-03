import { vi } from 'vitest';

/**
 * Substituto em memória do PrismaService para os testes e2e — sobe a
 * aplicação NestJS real (guards, pipes, filtros, controllers) sem depender
 * de um Postgres de verdade. Implementa só a fatia da API do Prisma que o
 * UsersRepository/AuthService realmente usa.
 */
export function createFakePrisma() {
  const users: any[] = [];
  const profiles: any[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const withProfile = (user: any) => ({
    ...user,
    profile: profiles.find((p) => p.userId === user.id) ?? null,
  });

  const fake: any = {
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

        return include?.profile ? withProfile(user) : user;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id);
        Object.assign(user, data);
        return user;
      }),
    },
    userProfile: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const profile = profiles.find((p) => p.username === where.username);
        if (!profile) return null;
        return include?.user ? { ...profile, user: users.find((u) => u.id === profile.userId) } : profile;
      }),
    },
    workspace: { create: vi.fn(async () => ({ id: nextId('workspace') })) },
    role: { create: vi.fn(async () => ({ id: nextId('role') })) },
    workspaceMember: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (cb: any) => cb(fake)),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };

  return fake;
}
