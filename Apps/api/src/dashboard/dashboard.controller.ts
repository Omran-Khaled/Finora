import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryQuery } from './dashboard.dto';
import { apiError, DashboardResponse } from '../swagger/schemas';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @ApiOperation({
    summary: 'Get the monthly summary',
    description:
      'Returns the financial summary for a given month: total balance across all accounts, income, expenses, savings (`income - expenses`), the budgets defined for that period and the savings goals with their progress.\n\n' +
      'When `year` or `month` are omitted, the current UTC period is used. All monetary values are in minor units.',
    operationId: 'dashboardSummary',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Reporting year. Defaults to the current UTC year.', schema: { type: 'integer', example: 2026 } })
  @ApiQuery({ name: 'month', required: false, description: 'Reporting month (1-12). Defaults to the current UTC month.', schema: { type: 'integer', minimum: 1, maximum: 12, example: 8 } })
  @ApiOkResponse({
    description: 'The monthly financial summary.',
    type: DashboardResponse,
    example: {
      data: {
        period: { year: 2026, month: 8 },
        balances: { totalMinor: '428000' },
        income: { minor: '240000' },
        expenses: { minor: '167000' },
        savings: { minor: '73000' },
        budgets: [],
        goals: [],
      },
    },
  })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest, @Query() query: DashboardSummaryQuery) {
    const now = new Date();
    const year = query.year ?? now.getUTCFullYear();
    const month = query.month ?? now.getUTCMonth() + 1;
    return { data: await this.service.summary(request.userId, year, month) };
  }
}
