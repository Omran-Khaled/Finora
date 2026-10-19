import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { isPrismaPersistenceEnabled } from '../config/persistence';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient | undefined;

  constructor() {
    if (isPrismaPersistenceEnabled()) {
      const { PrismaClient: GeneratedPrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
      this.client = new GeneratedPrismaClient();
    }
  }

  get db(): PrismaClient {
    if (!this.client) {
      throw new Error('Prisma is disabled. Set ENABLE_PRISMA=true before using database repositories.');
    }
    return this.client;
  }

  async assertReady(): Promise<void> {
    try {
      await this.db.$connect();
      await this.db.$queryRaw`SELECT 1`;
      // Use a generated model query as well as the connectivity probe. This
      // verifies that the generated client and the initial schema agree.
      await this.db.user.findFirst({ select: { id: true } });
    } catch {
      // Do not propagate Prisma's connection error: it may contain deployment
      // details that must not be exposed in startup output.
      throw new Error('Production database readiness check failed.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}
