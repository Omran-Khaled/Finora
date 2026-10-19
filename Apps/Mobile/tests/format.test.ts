import { describe, expect, it } from "@jest/globals";
import { formatMoney, minorPercentage, minorToDecimal, parseAmountToMinor, isValidISODate, todayISO, formatDate, currencySymbol } from "../lib/format";
import { parseTransactionAmount, sumMinorUnits } from "../lib/money";

describe("parseAmountToMinor (integer money boundary — Section 11)", () => {
  it("converts decimal strings to integer minor units without float math", () => {
    expect(parseAmountToMinor("12.99")).toBe("1299");
    expect(parseAmountToMinor("0.1")).toBe("10");
    expect(parseAmountToMinor("0.01")).toBe("1");
    expect(parseAmountToMinor("1234.5")).toBe("123450");
    expect(parseAmountToMinor("100")).toBe("10000");
    expect(parseAmountToMinor("0", "USD", { allowZero: true })).toBe("0");
    expect(parseAmountToMinor("1.234", "KWD")).toBe("1234");
    expect(parseAmountToMinor("1.2345", "KWD")).toBeNull();
    expect(parseAmountToMinor("100", "JPY")).toBe("100");
    expect(parseAmountToMinor("100.1", "JPY")).toBeNull();
  });

  describe("mobile financial input and aggregation regressions", () => {
    it("parses transaction input using the selected account currency precision", () => {
      expect(parseTransactionAmount("12.34", "USD")).toBe("1234");
      expect(parseTransactionAmount("12.34", "JPY")).toBeNull();
      expect(parseTransactionAmount("12", "JPY")).toBe("12");
      expect(parseTransactionAmount("1.234", "KWD")).toBe("1234");
    });

    it("adds API decimal-string account balances as exact minor units", () => {
      expect(sumMinorUnits(["9007199254740993", "7", "-2"])).toBe("9007199254740998");
      expect(sumMinorUnits([])).toBe("0");
    });
  });

  it("accepts thousands separators and rejects extra decimals", () => {
    expect(parseAmountToMinor("1,234.5")).toBe("123450");
    expect(parseAmountToMinor("12.345")).toBeNull();
  });

  it("calculates bounded percentages exactly for large minor values", () => {
    expect(minorPercentage(2000000000000000000n, 1000000000000000000n)).toBe(100);
    expect(minorPercentage(1n, 3n)).toBe(33.33);
  });

  it("rejects invalid money input", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor(".")).toBeNull();
    expect(parseAmountToMinor("-5")).toBeNull();
    expect(parseAmountToMinor("+5")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("1.2.3")).toBeNull();
    expect(parseAmountToMinor(null as never)).toBeNull();
  });
});

describe("formatMoney / minorToDecimal (display round-trip)", () => {
  it("formats minor units with currency symbol", () => {
    expect(formatMoney(1299)).toBe("$12.99");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-1299)).toBe("-$12.99");
    // The symbol is owned by `@finora/contracts` CURRENCY_SPECS (single source of
    // truth), which defines SAR as the code-style symbol `SAR` — not the legacy `SR `.
    expect(formatMoney(1299, "SAR")).toBe("SAR12.99");
  });

  it("produces pre-fill decimal strings", () => {
    expect(minorToDecimal(1299)).toBe("12.99");
    expect(minorToDecimal(-1299)).toBe("-12.99");
  });

  it("maps currency symbols with safe fallback", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("XYZ")).toBe("XYZ ");
  });
});

describe("date helpers (Hermes-safe formatting)", () => {
  it("validates real calendar dates only", () => {
    expect(isValidISODate("2026-09-04")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true); // leap year
    expect(isValidISODate("2026-02-30")).toBe(false); // impossible date
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-9-4")).toBe(false); // must be padded
    expect(isValidISODate("garbage")).toBe(false);
  });

  it("formats ISO dates for display", () => {
    expect(formatDate("2026-09-04")).toBe("Sep 4, 2026");
    expect(formatDate("")).toBe("");
  });

  it("produces today in YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
