import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CategoryRecord } from '../../core/store';
import { Page, PageRequest, prismaPageArgs, toPage } from '../../core/pagination';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string, page?: PageRequest): Promise<Page<CategoryRecord>> {
    const rows = await this.prisma.db.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...prismaPageArgs(page),
    });
    return toPage(rows.map((row) => ({ id: row.id, userId: row.userId, name: row.name, type: row.type, isSystem: row.isSystem, status: row.status })), page);
  }
  async create(category: CategoryRecord): Promise<CategoryRecord> {
    const row = await this.prisma.db.category.create({ data: { id: category.id, userId: category.userId, name: category.name, type: category.type, isSystem: category.isSystem, status: category.status } });
    return { id: row.id, userId: row.userId, name: row.name, type: row.type, isSystem: row.isSystem, status: row.status };
  }
  async findForUser(userId: string, id: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.db.category.findFirst({ where: { id, OR: [{ userId: null }, { userId }] } });
    return row ? { id: row.id, userId: row.userId, name: row.name, type: row.type, isSystem: row.isSystem, status: row.status } : null;
  }
  async updateName(userId: string, categoryId: string, name: string): Promise<CategoryRecord | null> {
    const result = await this.prisma.db.category.updateMany({
      where: { id: categoryId, userId, isSystem: false },
      data: { name },
    });
    if (result.count === 0) return null;
    return this.findForUser(userId, categoryId);
  }

  async archiveIfActive(userId: string, categoryId: string): Promise<CategoryRecord | null> {
    return this.prisma.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; userId: string | null; status: 'ACTIVE' | 'ARCHIVED'; isSystem: boolean }>>`
        SELECT id, user_id AS "userId", status, is_system AS "isSystem"
        FROM categories
        WHERE id = ${categoryId}::uuid AND user_id = ${userId}::uuid AND is_system = false
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return null;
      if (row.status === 'ARCHIVED') throw new UnprocessableEntityException({ code: 'CATEGORY_ARCHIVED' });
      const saved = await tx.category.update({ where: { id: categoryId }, data: { status: 'ARCHIVED' } });
      return { id: saved.id, userId: saved.userId, name: saved.name, type: saved.type, isSystem: saved.isSystem, status: saved.status };
    });
  }
}
