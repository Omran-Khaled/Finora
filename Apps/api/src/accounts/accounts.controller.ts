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
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';
import { AccountsService } from './accounts.service';
import { PaginationQuery } from '../core/pagination';
import {
  AccountListResponse,
  AccountResponse,
  apiError,
  validationApiError,
} from '../swagger/schemas';

const accountExample = {
  data: {
    id: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
    name: 'Main Bank',
    type: 'BANK',
    currencyCode: 'USD',
    status: 'ACTIVE',
    openingBalanceMinor: '250000',
    balanceMinor: '428000',
  },
};

const accountListExample = {
  data: [accountExample.data],
  meta: { nextCursor: null },
};

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @ApiOperation({
    summary: 'List accounts',
    description: 'Returns all accounts owned by the authenticated user, including archived ones.',
    operationId: 'accountsList',
  })
  @ApiOkResponse({
    description: 'The user accounts.',
    type: AccountListResponse,
    example: accountListExample,
  })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of accounts to return (default 20, max 100).' })
  @Get() async list(@Req() request: AuthenticatedRequest, @Query() page: PaginationQuery) { const result = await this.service.listPaged(request.userId, page); return { data: result.data, meta: { nextCursor: result.nextCursor } }; }

  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates an account for the authenticated user.\n\n' +
        'The `currencyCode` must match the authenticated user base currency. The opening balance is expressed in minor units (e.g. cents).',
    operationId: 'accountsCreate',
  })
  @ApiCreatedResponse({
    description: 'Account created with its initial balance.',
    type: AccountResponse,
    example: accountExample,
  })
  @ApiResponse(validationApiError("name: name must be between 1 and 120 characters; type: must be one of CASH, BANK, SAVINGS; currencyCode: must be 3 characters; openingBalanceMinor: must be an integer"))
  @ApiResponse(apiError(422, 'The payload is semantically invalid. Returns `INVALID_CURRENCY` when the currency code is not exactly three uppercase letters, `BASE_CURRENCY_MISMATCH` when it differs from the user base currency, or `INVALID_OPENING_BALANCE` when the opening balance is negative.', 'BASE_CURRENCY_MISMATCH', 'The account currency must match the user base currency.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateAccountDto) { return { data: await this.service.create(request.userId, dto) }; }
  @ApiOperation({
    summary: 'Get an account',
    description:
      'Returns a single account owned by the authenticated user.\n\n' +
      'Ownership is enforced: requesting another user’s account returns `404` (not `403`) to avoid resource disclosure.',
    operationId: 'accountsGet',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Account UUID.',
    schema: { type: 'string', format: 'uuid', example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f' },
  })
  @ApiOkResponse({ description: 'The requested account.', type: AccountResponse, example: accountExample })
  @ApiResponse(apiError(404, 'No account with this id exists for the user.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get(':id') async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.get(request.userId, id) }; }

  @ApiOperation({
    summary: 'Rename an account',
    description: 'Updates the display name of an account owned by the authenticated user.',
    operationId: 'accountsUpdate',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Account UUID.',
    schema: { type: 'string', format: 'uuid', example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f' },
  })
  @ApiOkResponse({ description: 'The updated account.', type: AccountResponse, example: accountExample })
  @ApiResponse(validationApiError("name: name must be between 1 and 120 characters"))
  @ApiResponse(apiError(404, 'No account with this id exists for the user.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateAccountDto) { return { data: await this.service.update(request.userId, id, dto.name) }; }

  @ApiOperation({
    summary: 'Archive an account',
    description:
      'Archives an account owned by the authenticated user. An archived account can no longer be used for new transactions or transfers; its existing transactions remain unchanged. Accounts linked to an active savings goal cannot be archived until the goal is completed or archived.',
    operationId: 'accountsArchive',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'Account UUID.',
    schema: { type: 'string', format: 'uuid', example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f' },
  })
  @ApiOkResponse({
    description: 'The account, now with `status: ARCHIVED`.',
    type: AccountResponse,
    example: { data: { ...accountExample.data, status: 'ARCHIVED' } },
  })
  @ApiResponse(apiError(404, 'No account with this id exists for the user.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(422, 'The account is linked to an active savings goal and cannot be archived yet.', 'ACCOUNT_HAS_ACTIVE_GOAL', 'Close the savings goal before archiving its linked account.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post(':id/archive') async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.archive(request.userId, id) }; }
}
