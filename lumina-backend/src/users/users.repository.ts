import { Injectable } from '@nestjs/common';
import { Prisma, User, UserProfile } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type UserWithProfile = User & { profile: UserProfile | null };

/** Aceita o client "normal" (PrismaService) ou um client de transação
 * (Prisma.TransactionClient), para que a criação do usuário possa
 * participar da transação maior que também cria o Workspace pessoal
 * (ver AuthService.register). */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * Repository Pattern: isola todo acesso via Prisma às tabelas users/
 * user_profiles. Services dependem desta classe, nunca do PrismaService
 * diretamente para consultas de usuário.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    return db.user.findUnique({ where: { email }, include: { profile: true } });
  }

  async findByUsername(username: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    const profile = await db.userProfile.findUnique({
      where: { username },
      include: { user: true },
    });
    if (!profile) return null;
    const { user, ...profileFields } = profile;
    return { ...user, profile: profileFields as UserProfile };
  }

  findById(id: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    return db.user.findUnique({ where: { id }, include: { profile: true } });
  }

  findByGoogleId(googleId: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    return db.user.findUnique({ where: { googleId }, include: { profile: true } });
  }

  createWithProfile(
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
      username: string;
    },
    db: Db = this.prisma,
  ): Promise<UserWithProfile> {
    return db.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            username: data.username,
          },
        },
      },
      include: { profile: true },
    });
  }

  updateLastLogin(id: string, db: Db = this.prisma): Promise<User> {
    return db.user.update({ where: { id }, data: { lastLogin: new Date() } });
  }

  /** Cria um usuário a partir de um login social (Google). Sem senha local
   * (passwordHash null) — e-mail já vem verificado pelo provedor. */
  createFromGoogle(
    data: {
      email: string;
      googleId: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    },
    db: Db = this.prisma,
  ): Promise<UserWithProfile> {
    return db.user.create({
      data: {
        email: data.email,
        googleId: data.googleId,
        emailVerified: true,
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            avatarUrl: data.avatarUrl,
          },
        },
      },
      include: { profile: true },
    });
  }

  /** Vincula uma conta local já existente a um Google ID (primeiro login via
   * Google usando o mesmo e-mail de uma conta criada por senha). */
  linkGoogleId(userId: string, googleId: string, db: Db = this.prisma): Promise<User> {
    return db.user.update({ where: { id: userId }, data: { googleId } });
  }

  updatePasswordHash(userId: string, passwordHash: string, db: Db = this.prisma): Promise<User> {
    return db.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  markEmailVerified(userId: string, db: Db = this.prisma): Promise<User> {
    return db.user.update({ where: { id: userId }, data: { emailVerified: true } });
  }
}
