import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { SUPPORTED_CURRENCIES } from '@finora/contracts';
import { AccountType } from '../core/store';
import { IsMoneyInput, MoneyInput } from '../core/money';

export class CreateAccountDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'Display name of the account.',
    example: 'Main Bank',
  })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({
    type: 'string',
    enum: ['CASH', 'BANK', 'SAVINGS'],
    description: 'Account type. SAVINGS accounts can be linked to a savings goal.',
    example: 'BANK',
  })
  @IsEnum(['CASH', 'BANK', 'SAVINGS'])
  type!: AccountType;

  @ApiProperty({
    type: 'string',
    minLength: 3,
    maxLength: 3,
    description: 'Supported ISO 4217 currency code. The account must match the user base currency.',
    example: 'USD',
  })
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  @Length(3, 3)
  @IsIn([...SUPPORTED_CURRENCIES])
  currencyCode!: string;

  @ApiProperty({
    type: 'string',
    format: 'int64',
    minimum: 0,
    description: 'Opening balance in minor units (e.g. cents): 100000 = 1000.00',
    example: '250000',
  })
  @IsMoneyInput()
  openingBalanceMinor!: MoneyInput;
}

export class UpdateAccountDto {
  @ApiPropertyOptional({
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'New display name for the account.',
    example: 'Main Bank (renamed)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;
}
