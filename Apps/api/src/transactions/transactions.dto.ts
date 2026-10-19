import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TransactionType } from '../core/store';
import { IsMoneyInput, MoneyInput } from '../core/money';

export class CreateTransactionDto {
  @ApiProperty({
    type: 'string',
    enum: ['INCOME', 'EXPENSE'],
    description: 'Transaction type. Use POST /transfers to create TRANSFER transactions.',
    example: 'EXPENSE',
  })
  @IsEnum(['INCOME', 'EXPENSE'])
  type!: Exclude<TransactionType, 'TRANSFER'>;

  @ApiProperty({
    type: 'string',
    format: 'uuid',
    description: 'Account the transaction is recorded against.',
    example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
  })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'uuid',
    description: 'Category for the transaction. Required when `type` is EXPENSE.',
    example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 1,
    description: 'Amount in minor units. Must be positive and, for EXPENSE, not exceed the account balance.',
    example: '1500',
  })
  @IsMoneyInput({ minimum: 1n })
  amountMinor!: MoneyInput;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Free-form memo.',
    example: 'Lunch at the bistro',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: 'string',
    format: 'date',
    description: 'Transaction date (YYYY-MM-DD, UTC).',
    example: '2026-08-30',
  })
  @IsDateString()
  transactionDate!: string;
}

export class ListTransactionsQuery {
  @ApiPropertyOptional({
    type: 'string',
    format: 'uuid',
    description: 'Only transactions recorded against this account.',
    example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'uuid',
    description: 'Only transactions carrying this category.',
    example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['INCOME', 'EXPENSE', 'TRANSFER'],
    description: 'Only transactions of this type.',
    example: 'EXPENSE',
  })
  @IsOptional()
  @IsEnum(['INCOME', 'EXPENSE', 'TRANSFER'])
  type?: TransactionType;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    description: 'Inclusive lower bound for `transactionDate` (YYYY-MM-DD).',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    description: 'Inclusive upper bound for `transactionDate` (YYYY-MM-DD).',
    example: '2026-08-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Opaque cursor returned as `meta.nextCursor` by the previous page.',
    example: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    description: 'Maximum number of transactions to return (default 20, max 100).',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({
    type: 'string',
    description: 'Updated free-form memo.',
    example: 'Lunch at the bistro (expensed)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    description: 'Updated transaction date (YYYY-MM-DD).',
    example: '2026-08-31',
  })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
