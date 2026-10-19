// Money handling: UI decimal input → validated representation → minor units.
import { describe, it, expect } from 'vitest';
import {
  parseAmountToMinor,
  minorToDisplay,
  isValidAmountInput,
  formatMoney,
  formatAccountType,
} from '@/lib/format';

describe('money handling', () => {
  it('round-trips decimal input through minor units', () => {
    expect(parseAmountToMinor('12.34', 'USD')).toBe('1234');
    expect(minorToDisplay('1234', 'USD')).toBe('12.34');
    expect(parseAmountToMinor(minorToDisplay('999', 'USD'), 'USD')).toBe('999');
  });

  describe('account type formatting', () => {
    it('formats known account types and safely handles invalid runtime values', () => {
      expect(formatAccountType('CASH')).toBe('Cash');
      expect(formatAccountType('BANK')).toBe('Bank');
      expect(formatAccountType('SAVINGS')).toBe('Savings');
      expect(formatAccountType(undefined)).toBe('Unknown type');
      expect(formatAccountType(null)).toBe('Unknown type');
      expect(formatAccountType('UNKNOWN')).toBe('Unknown type');
    });
  });

  it('handles zero-decimal currencies', () => {
    expect(parseAmountToMinor('1000', 'JPY')).toBe('1000');
    expect(minorToDisplay('1000', 'JPY')).toBe('1000');
  });

  it('rejects invalid or non-positive input explicitly', () => {
    expect(parseAmountToMinor('abc', 'USD')).toBeNull();
    expect(parseAmountToMinor('-5', 'USD')).toBeNull();
    expect(parseAmountToMinor('0', 'USD')).toBeNull();
    expect(parseAmountToMinor('0', 'USD', { allowZero: true })).toBe('0');
    expect(parseAmountToMinor('', 'USD')).toBeNull();
    expect(parseAmountToMinor('12.345', 'USD')).toBeNull();
  });

  it('validates decimal places per currency', () => {
    expect(isValidAmountInput('12.34', 'USD')).toBe(true);
    expect(isValidAmountInput('12.345', 'USD')).toBe(false);
    expect(isValidAmountInput('12', 'USD')).toBe(true);
    expect(isValidAmountInput('', 'USD')).toBe(true); // empty is a valid in-progress state
    expect(isValidAmountInput('12.34', 'JPY')).toBe(false);
    expect(isValidAmountInput('12', 'JPY')).toBe(true);
  });

  it('formats minor units for presentation only', () => {
    expect(formatMoney('123456', 'USD')).toBe('$1,234.56');
    expect(formatMoney('-500', 'USD')).toBe('-$5.00');
    expect(formatMoney('123456', 'USD', { showCode: true })).toBe('1,234.56 USD');
  });
});
