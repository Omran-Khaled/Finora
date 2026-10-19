import { parseAmountToMinor } from "./format";

/** Adds decimal-string minor-unit amounts without coercion or precision loss. */
export function sumMinorUnits(amounts: readonly string[]): string {
  return amounts.reduce((sum, amount) => sum + BigInt(amount), 0n).toString();
}

/** Parses a transaction amount at the selected account's currency precision. */
export function parseTransactionAmount(amount: string, currencyCode: string): string | null {
  return parseAmountToMinor(amount, currencyCode);
}
