import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { GoalRecord } from '../../core/store';
import { Page, PageRequest, prismaPageArgs, toPage } from '../../core/pagination';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaGoalRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string, page?: PageRequest): Promise<Page<GoalRecord>> {
    const rows = await this.prisma.db.savingsGoal.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...prismaPageArgs(page),
    });
    return toPage(rows.map((r) => this.toRecord(r)), page);
  }
  async find(userId: string, id: string): Promise<GoalRecord | null> { const r = await this.prisma.db.savingsGoal.findFirst({ where: { id, userId } }); return r ? this.toRecord(r) : null; }
  async existsForAccount(userId: string, accountId: string): Promise<boolean> {
    const row = await this.prisma.db.savingsGoal.findFirst({
      where: { userId, accountId },
      select: { id: true },
    });
    return row !== null;
  }
  async create(g: GoalRecord): Promise<GoalRecord> {
    try {
      const row = await this.prisma.db.$transaction(async (tx) => {
        const accounts = await tx.$queryRaw<Array<{ id: string; userId: string; type: 'CASH' | 'BANK' | 'SAVINGS'; status: 'ACTIVE' | 'ARCHIVED' }>>`
          SELECT id, user_id AS "userId", type, status
          FROM accounts
          WHERE id = ${g.accountId}::uuid AND user_id = ${g.userId}::uuid
          FOR UPDATE
        `;
        const account = accounts[0];
        if (!account) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND' });
        if (account.status === 'ARCHIVED') throw new UnprocessableEntityException({ code: 'ACCOUNT_ARCHIVED' });
        if (account.type !== 'SAVINGS') throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', message: 'A goal requires an unused SAVINGS account.' });
        return tx.savingsGoal.create({ data: { id: g.id, userId: g.userId, accountId: g.accountId, name: g.name, targetAmountMinor: g.targetAmountMinor, targetDate: g.targetDate ? new Date(g.targetDate) : null, status: g.status } });
      });
      return this.toRecord(row);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'VALIDATION_ERROR', message: 'A goal already exists for this savings account.' });
      }
      throw error;
    }
  }
  async updateName(userId: string, goalId: string, name: string): Promise<GoalRecord | null> {
    const result = await this.prisma.db.savingsGoal.updateMany({
      where: { id: goalId, userId },
      data: { name },
    });
    if (result.count === 0) return null;
    const goal = await this.find(userId, goalId);
    return goal;
  }

  async archiveIfActive(userId: string, goalId: string): Promise<GoalRecord | null> {
    return this.prisma.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' }>>`
        SELECT id, status
        FROM savings_goals
        WHERE id = ${goalId}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return null;
      if (row.status === 'ARCHIVED') throw new UnprocessableEntityException({ code: 'GOAL_ALREADY_ARCHIVED' });
      const saved = await tx.savingsGoal.update({ where: { id: goalId }, data: { status: 'ARCHIVED' } });
      return this.toRecord(saved);
    });
  }

  async completeIfActive(userId: string, goalId: string): Promise<GoalRecord | null> {
    const updated = await this.prisma.db.savingsGoal.updateMany({
      where: { id: goalId, userId, status: 'ACTIVE' },
      data: { status: 'COMPLETED' },
    });
    if (updated.count === 0) return null;
    return this.find(userId, goalId);
  }
  private toRecord(r: { id: string; userId: string; accountId: string; name: string; targetAmountMinor: bigint; targetDate: Date | null; status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' }): GoalRecord {
    return { id: r.id, userId: r.userId, accountId: r.accountId, name: r.name, targetAmountMinor: r.targetAmountMinor, targetDate: r.targetDate?.toISOString().slice(0, 10) ?? null, status: r.status };
  }
}
