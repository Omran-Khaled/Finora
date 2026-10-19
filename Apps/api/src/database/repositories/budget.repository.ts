import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { BudgetRecord } from '../../core/store';
import { Page, PageRequest, prismaPageArgs, toPage } from '../../core/pagination';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaBudgetRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string, page?: PageRequest): Promise<Page<BudgetRecord>> {
    const rows = await this.prisma.db.budget.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...prismaPageArgs(page),
    });
    return toPage(rows.map((r: { id: string; userId: string; categoryId: string; year: number; month: number; limitMinor: bigint }) => ({ ...r })), page);
  }
  async find(userId: string, id: string): Promise<BudgetRecord | null> { const r = await this.prisma.db.budget.findFirst({ where: { id, userId } }); return r ? { id: r.id, userId: r.userId, categoryId: r.categoryId, year: r.year, month: r.month, limitMinor: r.limitMinor } : null; }
  async existsForPeriod(userId: string, categoryId: string, year: number, month: number): Promise<boolean> {
    const row = await this.prisma.db.budget.findFirst({
      where: { userId, categoryId, year, month },
      select: { id: true },
    });
    return row !== null;
  }
  async create(b: BudgetRecord): Promise<BudgetRecord> {
    try {
      const row = await this.prisma.db.$transaction(async (tx) => {
        const categories = await tx.$queryRaw<Array<{ id: string; userId: string | null; type: 'INCOME' | 'EXPENSE'; status: 'ACTIVE' | 'ARCHIVED' }>>`
          SELECT id, user_id AS "userId", type, status
          FROM categories
          WHERE id = ${b.categoryId}::uuid
          FOR UPDATE
        `;
        const category = categories[0];
        if (!category || (category.userId !== null && category.userId !== b.userId)) {
          throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
        }
        if (category.status !== 'ACTIVE' || category.type !== 'EXPENSE') {
          throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', message: 'A budget requires an active EXPENSE category.' });
        }
        return tx.budget.create({ data: { id: b.id, userId: b.userId, categoryId: b.categoryId, year: b.year, month: b.month, limitMinor: b.limitMinor } });
      });
      return { id: row.id, userId: row.userId, categoryId: row.categoryId, year: row.year, month: row.month, limitMinor: row.limitMinor };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'BUDGET_ALREADY_EXISTS' });
      }
      throw error;
    }
  }
  async save(b: BudgetRecord): Promise<BudgetRecord> { const r = await this.prisma.db.budget.update({ where: { id: b.id }, data: { limitMinor: b.limitMinor } }); return { id: r.id, userId: r.userId, categoryId: r.categoryId, year: r.year, month: r.month, limitMinor: r.limitMinor }; }
  async remove(b: BudgetRecord): Promise<void> { await this.prisma.db.budget.delete({ where: { id: b.id } }); }
}
