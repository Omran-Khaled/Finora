export class Money {
  public constructor(
    public readonly amountMinor: bigint,
    public readonly currency: string,
  ) {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('INVALID_CURRENCY');
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  isPositive(): boolean {
    return this.amountMinor > 0n;
  }

  isZero(): boolean {
    return this.amountMinor === 0n;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED');
    }
  }
}
