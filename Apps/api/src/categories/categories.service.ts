import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CategoryRecord, InMemoryStore } from '../core/store';
import { PageRequest, toPageInMemory } from '../core/pagination';
import { PrismaCategoryRepository } from '../database/repositories/category.repository';
import { isPrismaPersistenceEnabled } from '../config/persistence';

@Injectable()
export class CategoriesService {
  constructor(private readonly store: InMemoryStore, private readonly persistent: PrismaCategoryRepository) {}
  async list(userId: string) { return isPrismaPersistenceEnabled() ? (await this.persistent.list(userId, undefined)).data : [...this.store.categories.values()].filter((item) => item.userId === null || item.userId === userId); }
  /** Paginated public listing for GET /categories (F-018 keyset contract). */
  async listPaged(userId: string, page?: PageRequest) {
    const request = page ?? {};
    if (isPrismaPersistenceEnabled()) {
      const result = await this.persistent.list(userId, request);
      return { data: result.data, nextCursor: result.nextCursor };
    }
    const rows = [...this.store.categories.values()].filter((item) => item.userId === null || item.userId === userId);
    const paged = toPageInMemory(rows, request);
    return { data: paged.data, nextCursor: paged.nextCursor };
  }
  async create(userId: string, name: string, type: CategoryRecord['type']) {
    const category: CategoryRecord = { id: this.store.id(), userId, name: name.trim(), type, isSystem: false, status: 'ACTIVE' };
    if (isPrismaPersistenceEnabled()) return this.persistent.create(category);
    this.store.categories.set(category.id, category);
    return category;
  }
  async update(userId: string, id: string, name: string) {
    if (isPrismaPersistenceEnabled()) {
      const category = await this.persistent.findForUser(userId, id);
      if (!category || category.userId !== userId || category.isSystem) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      if (category.status === 'ARCHIVED') throw new UnprocessableEntityException({ code: 'CATEGORY_ARCHIVED' });
      const updated = await this.persistent.updateName(userId, id, name.trim());
      if (!updated) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      return updated;
    }
    const category = this.owned(userId, id);
    category.name = name.trim();
    return category;
  }
  async archive(userId: string, id: string) {
    if (isPrismaPersistenceEnabled()) {
      const archived = await this.persistent.archiveIfActive(userId, id);
      if (!archived) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      return archived;
    }
    const category = this.owned(userId, id);
    category.status = 'ARCHIVED';
    return category;
  }
  owned(userId: string, id: string): CategoryRecord {
    const category = this.store.categories.get(id);
    if (!category || category.userId !== userId || category.isSystem) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    if (category.status === 'ARCHIVED') throw new UnprocessableEntityException({ code: 'CATEGORY_ARCHIVED' });
    return category;
  }
}
