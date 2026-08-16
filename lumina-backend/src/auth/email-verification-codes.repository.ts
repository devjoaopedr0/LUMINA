import { Injectable } from '@nestjs/common';
import { EmailVerificationCode, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Acesso via Prisma à tabela email_verification_codes — guarda apenas o
 * SHA-256 do código cru (ver AuthService), nunca o código em si. */
@Injectable()
export class EmailVerificationCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { userId: string; codeHash: string; expiresAt: Date },
    db: Db = this.prisma,
  ): Promise<EmailVerificationCode> {
    return db.emailVerificationCode.create({
      data: {
        userId: data.userId,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Código não usado e ainda dentro da validade. */
  findValidByCodeHash(codeHash: string, db: Db = this.prisma): Promise<EmailVerificationCode | null> {
    return db.emailVerificationCode.findFirst({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  /** Invalida todos os códigos do usuário (novo envio substitui o anterior). */
  invalidateForUser(userId: string, db: Db = this.prisma): Promise<Prisma.BatchPayload> {
    return db.emailVerificationCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  markUsed(id: string, db: Db = this.prisma): Promise<EmailVerificationCode> {
    return db.emailVerificationCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
