import { Injectable } from '@nestjs/common';
import { AccountType, Prisma, User, UserProfile } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type UserWithProfile = User & { profile: UserProfile | null; teacherProfile?: { subject: string } | null };

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

  acceptTerms(userId: string, version: string): Promise<UserWithProfile> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: new Date(), termsVersion: version },
      include: { profile: true, teacherProfile: true },
    });
  }

  /** O objetivo do cronograma acompanha o perfil (curso e universidade). */
  syncScheduleGoal(userId: string, goal: { objective: string | null; targetCourse: string | null }) {
    return this.prisma.studySchedule.updateMany({ where: { userId }, data: goal });
  }

  findByEmail(email: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    return db.user.findUnique({ where: { email }, include: { profile: true, teacherProfile: true } });
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
    return db.user.findUnique({ where: { id }, include: { profile: true, teacherProfile: true } });
  }

  findByGoogleId(googleId: string, db: Db = this.prisma): Promise<UserWithProfile | null> {
    return db.user.findUnique({ where: { googleId }, include: { profile: true, teacherProfile: true } });
  }

  createWithProfile(
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
      username: string;
      teacherSubject?: string;
      accountType: AccountType;
      termsVersion?: string;
    },
    db: Db = this.prisma,
  ): Promise<UserWithProfile> {
    return db.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        accountType: data.accountType,
        ...(data.termsVersion ? { termsAcceptedAt: new Date(), termsVersion: data.termsVersion } : {}),
        ...(data.teacherSubject ? { teacherProfile: { create: { subject: data.teacherSubject } } } : {}),
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            username: data.username,
          },
        },
      },
      include: { profile: true, teacherProfile: true },
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

  updateProfile(
    userId: string,
    data: Prisma.UserProfileUpdateInput,
    db: Db = this.prisma,
  ): Promise<UserWithProfile> {
    return db.user.update({
      where: { id: userId },
      data: { profile: { update: data } },
      include: { profile: true },
    });
  }
}
