import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Validated `GET /dashboard/summary` query boundary (P-002).
 *
 * Both fields are optional. When omitted the controller falls back to the
 * current UTC period. The transform coerces raw query strings to numbers, so
 * `?year=abc` / `?month=1.5` fail with a clean 400 `VALIDATION_ERROR` instead
 * of leaking `NaN` into `monthWindow()`. An empty `?year=` / `?month=` is
 * treated as omitted (defaults preserved) rather than as `0`.
 */
export class DashboardSummaryQuery {
  @ApiPropertyOptional({
    type: 'integer',
    description: 'Reporting year. Defaults to the current UTC year when omitted.',
    example: 2026,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  year?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 12,
    description: 'Reporting month (1-12). Defaults to the current UTC month when omitted.',
    example: 8,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
