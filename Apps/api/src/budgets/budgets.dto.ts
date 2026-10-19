import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsMoneyInput, MoneyInput } from '../core/money';

export class CreateBudgetDto {
  @ApiProperty({
    type: 'string',
    format: 'uuid',
    description: 'Category this budget limits (system or user category).',
    example: '3c2d1e0f-5a6b-4c7d-9e8f-0a1b2c3d4e5f',
  })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ type: 'integer', description: 'Budget year.', example: 2026 })
  @IsInt()
  year!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12, description: 'Budget month (1-12).', example: 8 })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 0,
    description: 'Spending limit in minor units for the period.',
    example: '300000',
  })
  @IsMoneyInput({ minimum: 1n })
  limitMinor!: MoneyInput;
}

export class UpdateBudgetDto {
  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 0,
    description: 'New spending limit in minor units for the period.',
    example: '500',
  })
  @IsMoneyInput({ minimum: 1n })
  limitMinor!: MoneyInput;
}
