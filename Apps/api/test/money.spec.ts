import { Money } from '@finora/domain';
import { fromMinor, POSTGRES_BIGINT_MAX, toSafeMinor } from '../src/core/money';

describe('Money', () => {
  it('adds minor units without floating point arithmetic', () => {
    expect(new Money(1299n, 'USD').add(new Money(1n, 'USD')).amountMinor).toBe(1300n);
  });

  it('rejects arithmetic across currencies', () => {
    expect(() => new Money(1n, 'USD').add(new Money(1n, 'EUR'))).toThrow(
      'CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED',
    );
  });

  it.each(['0', Number.MAX_SAFE_INTEGER.toString(), (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(), POSTGRES_BIGINT_MAX.toString()])(
    'round-trips boundary minor unit %s exactly',
    (value) => {
      expect(fromMinor(toSafeMinor(value))).toBe(value);
    },
  );

  it('rejects malformed values and values above PostgreSQL BIGINT max', () => {
    expect(() => toSafeMinor('01')).toThrow();
    expect(() => toSafeMinor('9223372036854775808')).toThrow();
    expect(() => toSafeMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
