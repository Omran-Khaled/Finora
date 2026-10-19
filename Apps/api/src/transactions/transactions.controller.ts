import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateTransactionDto, ListTransactionsQuery, UpdateTransactionDto } from './transactions.dto';
import { TransactionsService } from './transactions.service';
import { normalizeIdempotencyKey } from '../core/idempotency';
import {
  apiError,
  TransactionListResponse,
  TransactionResponse,
  validationApiError,
} from '../swagger/schemas';

const transactionExample = {
  data: {
    id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
    userId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
    accountId: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
    categoryId: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
    type: 'EXPENSE',
    amountMinor: '1500',
    currencyCode: 'USD',
    description: 'Lunch at the bistro',
    transactionDate: '2026-08-30',
    status: 'ACTIVE',
    transferDirection: null,
  },
};

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(AuthGuard)
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @ApiOperation({
    summary: 'List transactions',
    description:
      'Returns the authenticated user transactions, newest first. All query filters are optional and can be combined.\n\n' +
      '`from`/`to` are inclusive `YYYY-MM-DD` bounds compared against `transactionDate`.',
    operationId: 'transactionsList',
  })
  @ApiQuery({ name: 'accountId', required: false, description: 'Only transactions for this account.', schema: { type: 'string', format: 'uuid', example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f' } })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Only transactions carrying this category.', schema: { type: 'string', format: 'uuid', example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f' } })
  @ApiQuery({ name: 'type', required: false, description: 'Only transactions of this type.', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] })
  @ApiQuery({ name: 'from', required: false, description: 'Inclusive lower bound for `transactionDate` (YYYY-MM-DD).', schema: { type: 'string', format: 'date', example: '2026-08-01' } })
  @ApiQuery({ name: 'to', required: false, description: 'Inclusive upper bound for `transactionDate` (YYYY-MM-DD).', schema: { type: 'string', format: 'date', example: '2026-08-31' } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor: the `id` returned as `meta.nextCursor` by the previous page.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of transactions to return (default 20, max 100).' })
  @ApiOkResponse({ description: 'The matching transactions.', type: TransactionListResponse, example: { data: [transactionExample.data], meta: { nextCursor: null } } })
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get() async list(@Req() request: AuthenticatedRequest, @Query() query: ListTransactionsQuery) { const result = await this.service.listPaged(request.userId, query, query); return { data: result.data, meta: { nextCursor: result.nextCursor } }; }

  @ApiOperation({
    summary: 'Create a transaction',
    description:
      'Records an income or expense against an account of the authenticated user.\n\n' +
      '**Idempotency:** sending the same payload with the same `Idempotency-Key` header returns the original transaction instead of creating a duplicate.\n\n' +
      'Reusing a key with a different amount, account, type, category, description, or date returns `409 DUPLICATE_REQUEST`.\n\n' +
      '**Balance rules:** an `EXPENSE` requires a `categoryId` and must not exceed the current account balance. The account cannot be archived.',
    operationId: 'transactionsCreate',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'Required client-generated key. Reusing the same key with the same payload returns the original transaction; reusing it with different financial data returns 409.',
    schema: { type: 'string', example: '8c7affd5-4a1c-42e0-9a63-3d9f7c1b5e20' },
  })
  @ApiCreatedResponse({
    description: 'Transaction created. The currency code is derived from the account.',
    type: TransactionResponse,
    example: transactionExample,
  })
  @ApiResponse(validationApiError("type: must be one of INCOME, EXPENSE; accountId: must be a valid UUID; categoryId: must be a valid UUID; amountMinor: must be an integer; transactionDate: must be a valid ISO 8601 date string"))
  @ApiResponse(apiError(404, 'A referenced resource does not exist or belongs to another user. Returns `ACCOUNT_NOT_FOUND` for a missing account, `CATEGORY_NOT_FOUND` for a missing category.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(422, 'The request violates a business rule. Returns `ACCOUNT_ARCHIVED`, `CATEGORY_ARCHIVED`, `VALIDATION_ERROR` (expense without category) or `INSUFFICIENT_FUNDS` (expense exceeds the available balance).', 'INSUFFICIENT_FUNDS', 'The account balance is insufficient for this transaction.'))
  @ApiResponse(apiError(409, 'The idempotency key is already bound to a different request payload.', 'DUPLICATE_REQUEST', 'The idempotency key cannot be reused with different financial data.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTransactionDto, @Headers('idempotency-key') key?: string) {
    const idempotencyKey = normalizeIdempotencyKey(key);
    return { data: await this.service.create(request.userId, dto, idempotencyKey) };
  }
  @ApiOperation({
    summary: 'Get a transaction',
    description:
      'Returns a single transaction owned by the authenticated user. Requesting another user’s transaction returns `404` to avoid resource disclosure.',
    operationId: 'transactionsGet',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transaction UUID.', schema: { type: 'string', format: 'uuid', example: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' } })
  @ApiOkResponse({ description: 'The requested transaction.', type: TransactionResponse, example: transactionExample })
  @ApiResponse(apiError(404, 'No transaction with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get(':id') async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.get(request.userId, id) }; }

  @ApiOperation({
    summary: 'Update a transaction',
    description: 'Updates the memo and/or the transaction date of an owned, non-voided transaction.',
    operationId: 'transactionsUpdate',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transaction UUID.', schema: { type: 'string', format: 'uuid', example: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' } })
  @ApiOkResponse({ description: 'The updated transaction.', type: TransactionResponse, example: transactionExample })
  @ApiResponse(validationApiError("description: must be a string; transactionDate: must be a valid ISO 8601 date string"))
  @ApiResponse(apiError(404, 'No transaction with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateTransactionDto) { return { data: await this.service.update(request.userId, id, dto) }; }

  @ApiOperation({
    summary: 'Void a transaction',
    description:
      'Voids an income or expense transaction, which removes its effect on the account balance. Transfer legs must be voided through the transfer resource. Voiding income is rejected if doing so would make the account balance negative.',
    operationId: 'transactionsVoid',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transaction UUID.', schema: { type: 'string', format: 'uuid', example: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' } })
  @ApiOkResponse({
    description: 'The transaction, now with `status: VOIDED`.',
    type: TransactionResponse,
    example: { data: { ...transactionExample.data, status: 'VOIDED' } },
  })
  @ApiResponse(apiError(404, 'No transaction with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(422, 'The transaction has already been voided.', 'TRANSACTION_ALREADY_VOIDED', 'The transaction is already voided.'))
  @ApiResponse(apiError(422, 'Voiding this income would make the account balance negative.', 'INSUFFICIENT_FUNDS', 'The account balance is insufficient.'))
  @ApiResponse(apiError(422, 'Transfer legs must be voided through the transfer resource.', 'INVALID_TRANSFER', 'Transfer legs can only be changed through the transfer resource.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post(':id/void') async void(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.void(request.userId, id) }; }
}
