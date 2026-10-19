import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaAccountRepository } from './repositories/prisma-account.repository';
import { PrismaTransactionRepository } from './repositories/transaction.repository';
import { PrismaCategoryRepository } from './repositories/category.repository';
import { PrismaBudgetRepository } from './repositories/budget.repository';
import { PrismaGoalRepository } from './repositories/goal.repository';
import { PrismaTransferRepository } from './repositories/transfer.repository';

@Global()
@Module({
  providers: [PrismaService, PrismaAccountRepository, PrismaTransactionRepository, PrismaCategoryRepository, PrismaBudgetRepository, PrismaGoalRepository, PrismaTransferRepository],
  exports: [PrismaService, PrismaAccountRepository, PrismaTransactionRepository, PrismaCategoryRepository, PrismaBudgetRepository, PrismaGoalRepository, PrismaTransferRepository],
})
export class DatabaseModule {}
