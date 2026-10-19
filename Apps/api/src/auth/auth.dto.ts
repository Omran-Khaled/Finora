import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Length, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SUPPORTED_CURRENCIES } from '@finora/contracts';

export class RegisterDto {
  @ApiProperty({
    type: 'string',
    format: 'email',
    description: 'Email address. Stored normalized (trimmed and lowercased).',
    example: 'sarah@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: 'string',
    format: 'password',
    minLength: 8,
    description: 'Plain-text password (never returned by the API). Must be at least 8 characters.',
    example: 'hunter2-secure',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    type: 'string',
    minLength: 3,
    maxLength: 3,
    description: 'ISO 4217 currency code. The user account is opened with this base currency.',
    example: 'USD',
  })
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  @Length(3, 3)
  @IsIn([...SUPPORTED_CURRENCIES])
  baseCurrency!: string;
}

export class LoginDto {
  @ApiProperty({
    type: 'string',
    format: 'email',
    description: 'Registered email address.',
    example: 'sarah@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: 'string',
    format: 'password',
    description: 'Account password.',
    example: 'hunter2-secure',
  })
  @IsString()
  password!: string;
}

export class UpdateProfileDto {
  @ApiProperty({
    type: 'string',
    minLength: 3,
    maxLength: 3,
    description: 'ISO 4217 currency code to update the authenticated user profile.',
    example: 'SAR',
  })
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  @Length(3, 3)
  @IsIn([...SUPPORTED_CURRENCIES])
  baseCurrency!: string;
}
