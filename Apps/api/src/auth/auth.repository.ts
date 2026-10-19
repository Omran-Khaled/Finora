import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { UserRecord } from '../core/store';

@Injectable()
export class PrismaAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hasAccounts(userId: string): Promise<boolean> {
    return (await this.prisma.db.account.count({ where: { userId } })) > 0;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.db.user.findUnique({ where: { email } });
    return user ? { id: user.id, email: user.email, passwordHash: user.passwordHash, baseCurrency: user.baseCurrency } : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.db.user.findUnique({ where: { id } });
    return user ? { id: user.id, email: user.email, passwordHash: user.passwordHash, baseCurrency: user.baseCurrency } : null;
  }

  async createUser(user: UserRecord): Promise<UserRecord> {
    try {
      const created = await this.prisma.db.user.create({
        data: {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          baseCurrency: user.baseCurrency,
        },
      });
      return { id: created.id, email: created.email, passwordHash: created.passwordHash, baseCurrency: created.baseCurrency };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'DUPLICATE_REQUEST', message: 'An account with this email already exists.' });
      }
      throw error;
    }
  }

  async createSession(token: string, userId: string, expiresAt: Date): Promise<void> {
    await this.prisma.db.session.create({
      data: { userId, tokenHash: this.hash(token), expiresAt },
    });
  }

  async findSession(token: string): Promise<{ userId: string; expiresAt: Date } | null> {
    const session = await this.prisma.db.session.findFirst({ where: { tokenHash: this.hash(token), revokedAt: null } });
    return session ? { userId: session.userId, expiresAt: session.expiresAt } : null;
  }

  async rotateSessionAndCreate(
    token: string,
    newToken: string,
    newExpiresAt: Date,
  ): Promise<{ userId: string; expiresAt: Date } | null> {
    return this.prisma.db.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { tokenHash: this.hash(token), revokedAt: null },
      });
      if (!session || session.expiresAt <= new Date()) return null;

      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) return null;

      await tx.session.create({
        data: { userId: session.userId, tokenHash: this.hash(newToken), expiresAt: newExpiresAt },
      });
      return { userId: session.userId, expiresAt: session.expiresAt };
    });
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.db.session.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async updateBaseCurrency(userId: string, baseCurrency: string): Promise<UserRecord | null> {
    return this.prisma.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Share the authoritative user-row lock with account creation.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const account = await tx.account.findFirst({ where: { userId }, select: { id: true } });
      if (account) throw new ConflictException({ code: 'BASE_CURRENCY_LOCKED' });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { baseCurrency },
      });
      return { id: updated.id, email: updated.email, passwordHash: updated.passwordHash, baseCurrency: updated.baseCurrency };
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
