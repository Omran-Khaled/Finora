import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { CreateGoalDto, UpdateGoalDto } from './goals.dto';
import { GoalsService } from './goals.service';
import { PaginationQuery } from '../core/pagination';
import {
  apiError,
  GoalListResponse,
  GoalResponse,
  validationApiError,
} from '../swagger/schemas';

const goalExample = {
  data: {
    id: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a',
    userId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
    accountId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    name: 'Emergency Fund',
    targetAmountMinor: '1200000',
    targetDate: '2027-12-31',
    status: 'ACTIVE',
    currentBalanceMinor: '540000',
    progressPercentage: 45,
  },
};

@ApiTags('Savings Goals')
@ApiBearerAuth()
@Controller('savings-goals')
@UseGuards(AuthGuard)
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @ApiOperation({
    summary: 'List savings goals',
    description: 'Returns all savings goals of the authenticated user, each with its current progress derived from the linked SAVINGS account balance.',
    operationId: 'goalsList',
  })
  @ApiOkResponse({ description: 'The user savings goals.', type: GoalListResponse, example: { data: [goalExample.data], meta: { nextCursor: null } } })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of savings goals to return (default 20, max 100).' })
  @Get() async list(@Req() request: AuthenticatedRequest, @Query() page: PaginationQuery) { const result = await this.service.listPaged(request.userId, page); return { data: result.data, meta: { nextCursor: result.nextCursor } }; }

  @ApiOperation({
    summary: 'Create a savings goal',
    description:
      'Creates a savings goal backed by a SAVINGS account of the authenticated user. The account must be of type `SAVINGS` and must not already back another goal. Progress is read from the account’s live balance.',
    operationId: 'goalsCreate',
  })
  @ApiCreatedResponse({ description: 'Goal created with its initial progress.', type: GoalResponse, example: goalExample })
  @ApiResponse(validationApiError("accountId: must be a valid UUID; name: name must be between 1 and 120 characters; targetAmountMinor: must be an integer; targetDate: must be a valid ISO 8601 date string"))
  @ApiResponse(apiError(404, 'The referenced account does not exist or belongs to another user.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(422, 'The account is not an unused SAVINGS account.', 'VALIDATION_ERROR', 'A goal requires an unused SAVINGS account.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGoalDto) { return { data: await this.service.create(request.userId, dto) }; }

  @ApiOperation({
    summary: 'Get a savings goal',
    description:
      'Returns a single savings goal owned by the authenticated user. Requesting another user’s goal returns `404` to avoid resource disclosure.',
    operationId: 'goalsGet',
  })
  @ApiParam({ name: 'id', required: true, description: 'Goal UUID.', schema: { type: 'string', format: 'uuid', example: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a' } })
  @ApiOkResponse({ description: 'The requested goal.', type: GoalResponse, example: goalExample })
  @ApiResponse(apiError(404, 'No goal with this id exists for the user.', 'GOAL_NOT_FOUND', 'Goal not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get(':id') async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.get(request.userId, id) }; }

  @ApiOperation({
    summary: 'Rename a savings goal',
    description: 'Updates the name of an owned savings goal.',
    operationId: 'goalsUpdate',
  })
  @ApiParam({ name: 'id', required: true, description: 'Goal UUID.', schema: { type: 'string', format: 'uuid', example: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a' } })
  @ApiOkResponse({ description: 'The updated goal.', type: GoalResponse, example: goalExample })
  @ApiResponse(validationApiError("name: name must be between 1 and 120 characters"))
  @ApiResponse(apiError(404, 'No goal with this id exists for the user.', 'GOAL_NOT_FOUND', 'Goal not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateGoalDto) { return { data: await this.service.update(request.userId, id, dto.name) }; }

  @ApiOperation({
    summary: 'Archive a savings goal',
    description: 'Archives an owned savings goal. Archiving an already archived goal returns `422`.',
    operationId: 'goalsArchive',
  })
  @ApiParam({ name: 'id', required: true, description: 'Goal UUID.', schema: { type: 'string', format: 'uuid', example: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a' } })
  @ApiOkResponse({
    description: 'The goal, now with `status: ARCHIVED`.',
    type: GoalResponse,
    example: { data: { ...goalExample.data, status: 'ARCHIVED' } },
  })
  @ApiResponse(apiError(404, 'No goal with this id exists for the user.', 'GOAL_NOT_FOUND', 'Goal not found.'))
  @ApiResponse(apiError(422, 'The goal has already been archived.', 'GOAL_ALREADY_ARCHIVED', 'The goal is already archived.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post(':id/archive') async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.archive(request.userId, id) }; }
}
