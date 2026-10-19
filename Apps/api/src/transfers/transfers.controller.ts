import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateTransferDto, UpdateTransferDto } from './transfers.dto';
import { TransfersService } from './transfers.service';
import { normalizeIdempotencyKey } from '../core/idempotency';
import {
  apiError,
  TransferResponseEnvelope,
  validationApiError,
} from '../swagger/schemas';

const transferExample = {
  data: {
    transfer: {
      id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      sourceTransactionId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      destinationTransactionId: '6f5e4d3c-2b1a-4c3d-8e5f-0a1b2c3d4e5f',
      createdAt: '2026-08-30T14:32:05.000Z',
    },
    sourceTx: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', userId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', accountId: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f', categoryId: null, amountMinor: '100', currencyCode: 'USD', type: 'TRANSFER', description: 'Transfer to Savings', transactionDate: '2026-08-30', status: 'ACTIVE', transferDirection: 'SOURCE', createdAt: '2026-08-30T14:32:05.000Z', updatedAt: '2026-08-30T14:32:05.000Z' },
    destinationTx: { id: '6f5e4d3c-2b1a-4c3d-8e5f-0a1b2c3d4e5f', userId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', accountId: '7f5e4d3c-2b1a-4c3d-8e5f-0a1b2c3d4e5f', categoryId: null, amountMinor: '100', currencyCode: 'USD', type: 'TRANSFER', description: 'Transfer from Main Bank', transactionDate: '2026-08-30', status: 'ACTIVE', transferDirection: 'DESTINATION', createdAt: '2026-08-30T14:32:05.000Z', updatedAt: '2026-08-30T14:32:05.000Z' },
  },
};

const voidedTransferExample = {
  data: {
    ...transferExample.data,
    sourceTx: { ...transferExample.data.sourceTx, status: 'VOIDED' },
    destinationTx: { ...transferExample.data.destinationTx, status: 'VOIDED' },
  },
};

@ApiTags('Transfers')
@ApiBearerAuth()
@Controller('transfers')
@UseGuards(AuthGuard)
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  @ApiOperation({
    summary: 'Create a transfer',
    description:
      'Moves money between two accounts of the authenticated user. Atomically creates a debit transaction on the source account and a credit transaction on the destination account; the total balance is unchanged.\n\n' +
      '**Idempotency:** sending the same payload with the same `Idempotency-Key` header returns the original transfer instead of creating a duplicate.\n\n' +
      'Reusing a key with a different amount, account, or date returns `409 DUPLICATE_REQUEST`.\n\n' +
      '**Rules:** the two accounts must differ, be active, share the same currency, and the source account must have sufficient balance.',
    operationId: 'transfersCreate',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'Required client-generated key. Reusing the same key with the same payload returns the original transfer; reusing it with different financial data returns 409.',
    schema: { type: 'string', example: '8c7affd5-4a1c-42e0-9a63-3d9f7c1b5e20' },
  })
  @ApiCreatedResponse({ description: 'Transfer created with its two underlying transactions.', type: TransferResponseEnvelope, example: transferExample })
  @ApiResponse(validationApiError("fromAccountId: must be a valid UUID; toAccountId: must be a valid UUID; amountMinor: must be an integer; transactionDate: must be a valid ISO 8601 date string"))
  @ApiResponse(apiError(404, 'One of the referenced accounts does not exist or belongs to another user.', 'ACCOUNT_NOT_FOUND', 'Account not found.'))
  @ApiResponse(apiError(422, 'The request violates a business rule. Returns `SAME_ACCOUNT_TRANSFER`, `ACCOUNT_ARCHIVED`, `CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED` or `INSUFFICIENT_FUNDS`.', 'INSUFFICIENT_FUNDS', 'The account balance is insufficient for this transfer.'))
  @ApiResponse(apiError(409, 'The idempotency key is already bound to a different request payload.', 'DUPLICATE_REQUEST', 'The idempotency key cannot be reused with different financial data.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @ApiResponse(apiError(500, 'Unexpected server error.', 'INTERNAL_ERROR', 'Internal server error.'))
  @Post() async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTransferDto, @Headers('idempotency-key') key?: string) {
    const idempotencyKey = normalizeIdempotencyKey(key);
    return { data: await this.service.create(request.userId, dto, idempotencyKey) };
  }
  @ApiOperation({
    summary: 'Get a transfer',
    description:
      'Returns a single transfer owned by the authenticated user. Requesting another user’s transfer returns `404` to avoid resource disclosure.',
    operationId: 'transfersGet',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transfer UUID.', schema: { type: 'string', format: 'uuid', example: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' } })
  @ApiOkResponse({ description: 'The requested transfer.', type: TransferResponseEnvelope, example: transferExample })
  @ApiResponse(apiError(404, 'No transfer with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Get(':id') async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.get(request.userId, id) }; }

  @ApiOperation({
    summary: 'Update a transfer date',
    description: 'Moves the transfer date. Both the source and destination transactions are re-dated to the same value.',
    operationId: 'transfersUpdate',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transfer UUID.', schema: { type: 'string', format: 'uuid', example: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' } })
  @ApiOkResponse({ description: 'The updated transfer.', type: TransferResponseEnvelope, example: transferExample })
  @ApiResponse(validationApiError("transactionDate: must be a valid ISO 8601 date string"))
  @ApiResponse(apiError(404, 'No transfer with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Patch(':id') async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateTransferDto) { return { data: await this.service.update(request.userId, id, dto.transactionDate) }; }

  @ApiOperation({
    summary: 'Void a transfer',
    description:
      'Voids the transfer atomically: both underlying transactions are marked `VOIDED` and stop affecting their account balances. The operation is rejected if removing its destination credit would make that account balance negative.',
    operationId: 'transfersVoid',
  })
  @ApiParam({ name: 'id', required: true, description: 'Transfer UUID.', schema: { type: 'string', format: 'uuid', example: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' } })
  @ApiOkResponse({ description: 'The voided transfer.', type: TransferResponseEnvelope, example: voidedTransferExample })
  @ApiResponse(apiError(404, 'No transfer with this id exists for the user.', 'TRANSACTION_NOT_FOUND', 'Transaction not found.'))
  @ApiResponse(apiError(422, 'The transfer has already been voided.', 'TRANSACTION_ALREADY_VOIDED', 'The transaction is already voided.'))
  @ApiResponse(apiError(422, 'Voiding this transfer would make the destination account balance negative.', 'INSUFFICIENT_FUNDS', 'The account balance is insufficient.'))
  @ApiResponse(apiError(401, 'Missing, invalid or expired session token.', 'UNAUTHORIZED', 'Authentication required.'))
  @Post(':id/void') async void(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return { data: await this.service.void(request.userId, id) }; }
}
