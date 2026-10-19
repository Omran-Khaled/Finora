import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { IsMoneyInput, MoneyInput } from '../core/money';

export class CreateGoalDto {
  @ApiProperty({
    type: 'string',
    format: 'uuid',
    description: 'SAVINGS account linked to the goal. An account can back at most one goal.',
    example: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  })
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'Goal name.',
    example: 'Emergency Fund',
  })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 1,
    description: 'Target amount in minor units.',
    example: '1200000',
  })
  @IsMoneyInput({ minimum: 1n })
  targetAmountMinor!: MoneyInput;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    nullable: true,
    description: 'Optional target date (YYYY-MM-DD).',
    example: '2027-12-31',
  })
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class UpdateGoalDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'New goal name.',
    example: 'Emergency Fund (renamed)',
  })
  @IsString()
  @Length(1, 120)
  name!: string;
}
