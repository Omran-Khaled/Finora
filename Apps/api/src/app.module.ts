import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    DatabaseModule,
    CoreModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    TransfersModule,
    BudgetsModule,
    GoalsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
