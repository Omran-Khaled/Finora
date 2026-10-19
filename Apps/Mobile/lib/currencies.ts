import { CURRENCY_SPECS, type SupportedCurrency } from "@finora/contracts";

/** Canonical supported currency metadata shared by API, Web and Mobile. */
export type CurrencyOption = (typeof CURRENCY_SPECS)[number];
export const CURRENCIES = CURRENCY_SPECS;

export function currencyLabel(code: string): string {
  return CURRENCIES.find((currency) => currency.code === code.toUpperCase() as SupportedCurrency)?.label ?? code.toUpperCase();
}
