import { Injectable } from '@nestjs/common';
import { PasswordResetToken, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Acesso via Prisma à tabela password_reset_tokens — guarda apenas o
 * SHA-256 do token cru (ver AuthService), nunca o token em si. */
@Injectable()
export class PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    db: Db = this.prisma,
  ): Promise<PasswordResetToken> {
    return db.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Token não usado e ainda dentro da validade. */
  findValidByTokenHash(tokenHash: string, db: Db = this.prisma): Promise<PasswordResetToken | null> {
    return db.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  /** Invalida todos os tokens do usuário (novo pedido de reset substitui o anterior). */
  invalidateForUser(userId: string, db: Db = this.prisma): Promise<Prisma.BatchPayload> {
    return db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  markUsed(id: string, db: Db = this.prisma): Promise<PasswordResetToken> {
    return db.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
