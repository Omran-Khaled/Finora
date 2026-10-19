import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsMoneyInput, MoneyInput } from '../core/money';

export class CreateTransferDto {
  @ApiProperty({
    type: 'string',
    format: 'uuid',
    description: 'Account debited by the transfer. Must differ from `toAccountId`.',
    example: '9e4e3c2a-1b2c-4d5e-8f90-1a2b3c4d5e6f',
  })
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty({
    type: 'string',
    format: 'uuid',
    description: 'Account credited by the transfer. Must differ from `fromAccountId`.',
    example: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  })
  @IsUUID()
  toAccountId!: string;

  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 1,
    description: 'Amount to move in minor units. Must not exceed the source account balance.',
    example: '30000',
  })
  @IsMoneyInput({ minimum: 1n })
  amountMinor!: MoneyInput;

  @ApiProperty({
    type: 'string',
    format: 'date',
    description: 'Transfer date (YYYY-MM-DD, UTC). Applied to both generated transactions.',
    example: '2026-08-30',
  })
  @IsDateString()
  transactionDate!: string;
}

export class UpdateTransferDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    description: 'Updated transfer date (YYYY-MM-DD). Applied to both generated transactions.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
