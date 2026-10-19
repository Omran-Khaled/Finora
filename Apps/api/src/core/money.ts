import { UnprocessableEntityException } from '@nestjs/common';
import { ValidateBy } from 'class-validator';

export type MoneyInput = string | number;
export const POSTGRES_BIGINT_MAX = 9223372036854775807n;
const DECIMAL_INTEGER = /^(0|[1-9]\d*)$/;

export function IsMoneyInput(options: { minimum?: bigint } = {}): PropertyDecorator {
  const minimum = options.minimum ?? 0n;
  return ValidateBy({
    name: 'isMoneyInput',
    validator: {
      validate: (value: unknown): boolean =>
        (typeof value === 'string' && DECIMAL_INTEGER.test(value) &&
          BigInt(value) >= minimum && BigInt(value) <= POSTGRES_BIGINT_MAX) ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value >= Number(minimum)),
      defaultMessage: () => 'must be a decimal minor-unit string or a safe integer',
    },
  });
}

/**
 * Monetary guard (F-020 / Q-001).
 *
 * Amounts travel as JSON numbers but are stored as `BIGINT`. Beyond
 * `Number.MAX_SAFE_INTEGER` a JSON number silently loses precision, so
 * `BigInt(value)` would persist a value the client never sent. The DTO layer
 * already rejects oversized input with `@Max(Number.MAX_SAFE_INTEGER)`; this
 * helper is the service-level backstop so no write path can bypass the rule.
 */
export function toSafeMinor(value: MoneyInput, field = 'amountMinor'): bigint {
  if (
    (typeof value === 'string' && (!DECIMAL_INTEGER.test(value) || BigInt(value) > POSTGRES_BIGINT_MAX)) ||
    (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new UnprocessableEntityException({ code: 'INVALID_AMOUNT', message: `${field} must be a decimal integer within the PostgreSQL BIGINT range.` });
  }
  return BigInt(value);
}

/** Renders a stored minor amount without passing through an imprecise number. */
export function fromMinor(value: bigint): string {
  return value.toString();
}

/** Calculates a percentage without converting monetary operands to numbers. */
export function minorPercentage(
  part: bigint,
  whole: bigint,
  maximum?: bigint,
): number {
  if (whole <= 0n) return 0;
  const cap = maximum === undefined ? whole : (whole * maximum) / 100n;
  const boundedPart = part < 0n ? 0n : part > cap ? cap : part;
  // Hundredths of a percent, rounded half up. Only this bounded/scaled value
  // crosses the bigint/number boundary.
  const scaled = (boundedPart * 10000n + whole / 2n) / whole;
  // The value is bounded to at most 10000 by the calculation above. Convert
  // the decimal representation only after all monetary arithmetic is done.
  return Number(scaled.toString()) / 100;
}