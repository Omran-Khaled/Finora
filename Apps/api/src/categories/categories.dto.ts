import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 80,
    description: 'Category name. User-defined categories are owned by the caller; system categories are read-only.',
    example: 'Groceries',
  })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({
    enum: ['INCOME', 'EXPENSE'],
    description: 'Whether this category is used for income or expense transactions.',
    example: 'EXPENSE',
  })
  @IsEnum(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';
}

/**
 * PATCH body for `PATCH /categories/:id`. The endpoint is rename-only:
 * `type` and `status` are immutable here (archive has its own route), so they
 * must not be accepted — the global ValidationPipe forbids non-whitelisted
 * properties.
 */
export class UpdateCategoryDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 80,
    description: 'New category name.',
    example: 'Groceries',
  })
  @IsString()
  @Length(1, 80)
  name!: string;
}
