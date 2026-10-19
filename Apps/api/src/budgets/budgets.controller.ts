import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateBudgetDto, UpdateBudgetDto } from './budgets.dto';
import { BudgetsService } from './budgets.service';
import { PaginationQuery } from '../core/pagination';
import {
  apiError,
  BudgetListResponse,
  BudgetResponse,
  EmptyResponse,
  validationApiError,
} from '../swagger/schemas';

const budgetExample = {
  data: {
    id: '8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d',
    categoryId: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
    year: 2026,
    month: 8,
    limitMinor: '300000',
    spentMinor: '230000',
    remainingMinor: '70000',
    usagePercentage: 76.67,
  },
};

@ApiTags('Budgets')
@ApiBearerAuth()
@Controller('budgets')
@UseGuards(AuthGuard)
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @ApiOperation({
    summary: 'List budgets',
    description: 'Returns all budgets of the authenticated user. Each budget includes the spent amount, the remaining amount and the usage percentage for its period.',
    operationId: 'budgetsList',
  })
  @ApiOkResponse({ description: 'The user budgets.', type: BudgetListResponse, example: { data: [budgetExample.data], meta: { nextCursor: null } } })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of budgets to return (default 20, max 100).' })
  @Get() async list(@Req() request: AuthenticatedRequest, @Query() page: PaginationQuery) { const result = await this.service.listPaged(request.userId, page); return { data: result.data, meta: { nextCursor: result.nextCursor } }; }

  @ApiOperation({
    summary: 'Create a budget',
    description:
      'Creates a monthly budget limit for a category. Only one budget is allowed per `(categoryId, year, month)` combination.\n\n' +
      'The budget does not affect account balances; it only tracks the spending against the limit.',
    operationId: 'budgetsCreate',
  })
  @ApiCreatedResponse({ description: 'Budget created with its usage statistics.', type: BudgetResponse, example: budgetExample })
  @ApiResponse(validationApiError("categoryId: must be a valid UUID; year: must be an integer; month: must be between 1 and 12; limitMinor: must be an integer"))
  @ApiResponse(apiError(404, 'The referenced category does not exist or belongs to another user.', 'CATEGORY_NOT_FOUND', 'Category not found.'))
  @ApiResponse(apiError(409, 'A budget already exists for this category and period.', 'BUDGET_ALREADY_EXISTS', 'A budget for this category and month already exists.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateBudgetDto) { return { data: await this.service.create(request.userId, dto) }; }

  @ApiOperation({
    summary: 'Update a budget limit',
    description: 'Changes the monthly spending limit of an owned budget.',
    operationId: 'budgetsUpdate',
  })
  @ApiParam({ name: 'id', required: true, description: 'Budget UUID.', schema: { type: 'string', format: 'uuid', example: '8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d' } })
  @ApiOkResponse({ description: 'The updated budget with recomputed usage statistics.', type: BudgetResponse, example: budgetExample })
  @ApiResponse(validationApiError("limitMinor: must be an integer"))
  @ApiResponse(apiError(404, 'No budget with this id exists for the user.', 'BUDGET_NOT_FOUND', 'Budget not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateBudgetDto) { return { data: await this.service.update(request.userId, id, dto.limitMinor) }; }

  @ApiOperation({
    summary: 'Delete a budget',
    description: 'Permanently removes an owned budget.',
    operationId: 'budgetsDelete',
  })
  @ApiParam({ name: 'id', required: true, description: 'Budget UUID.', schema: { type: 'string', format: 'uuid', example: '8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d' } })
  @ApiOkResponse({ description: 'Budget deleted.', type: EmptyResponse, example: { data: {} } })
  @ApiResponse(apiError(404, 'No budget with this id exists for the user.', 'BUDGET_NOT_FOUND', 'Budget not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Delete(':id') async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) { await this.service.remove(request.userId, id); return { data: {} }; }
}
