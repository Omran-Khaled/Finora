# @finora/domain

Framework-independent financial primitives for the Finora personal-finance platform. Zero dependencies on NestJS, Prisma, HTTP, or any client.

Part of the [Finora monorepo](../../README.md). Product owner: Omran Khaled — عمران Khalid.

---

## Responsibility

Provides the `Money` class — the canonical representation of monetary values as **integer minor units** with same-currency arithmetic. Used by the API layer and referenced by the shared contracts.

---

## What's in the package

| Export | Description |
|--------|-------------|
| `Money` class | `amountMinor: bigint`, `currency: string` (validated as `^[A-Z]{3}$`) |
| `Money.add(other)` | Add same-currency money |
| `Money.subtract(other)` | Subtract same-currency money |
| `Money.equals(other)` | Equality check (currency + amount) |
| `Money.isPositive()` | `amountMinor > 0` |
| `Money.isZero()` | `amountMinor === 0` |

All arithmetic asserts same currency (`CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED` otherwise). No `format()`, no currency conversion, no dependence on `bigint` serialization concerns — those are handled at the API/contract layer.

---

## Project structure

```
packages/domain/
├── src/
│   ├── index.ts   # re-exports money.ts
│   └── money.ts   # Money class implementation
├── package.json   # @finora/domain (private, version 0.1.0)
└── README.md      # this file
```

**No build step** — `main` and `types` point directly at `src/index.ts`.

---

## Commands

Typecheck runs through the consuming workspace:

```bash
# From repository root
pnpm typecheck:api      # includes domain via API imports
pnpm test:api           # includes money.spec.ts
```

---

## Money algorithms (pseudocode)

The `Money` class (`packages/domain/src/money.ts`) implements exact integer arithmetic — no floating point anywhere:

```
constructor(amountMinor: bigint, currency: string):
    if currency does not match /^[A-Z]{3}$/:
        throw Error("INVALID_CURRENCY")
    amountMinor, currency ← immutable fields

add(other: Money) → Money:
    assertSameCurrency(other)          // throws CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED
    return Money(this.amountMinor + other.amountMinor, this.currency)

subtract(other: Money) → Money:
    assertSameCurrency(other)
    return Money(this.amountMinor - other.amountMinor, this.currency)

equals(other: Money) → boolean:
    return this.currency == other.currency
       and this.amountMinor == other.amountMinor

isPositive() → boolean:  return this.amountMinor > 0n
isZero()     → boolean:  return this.amountMinor == 0n

assertSameCurrency(other):
    if this.currency != other.currency:
        throw Error("CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED")
```

**Invariants (FI-001):**
- Addition is exact: `(a + b) - b == a` for all representable values (bigint has no precision loss)
- Subtraction is the inverse of addition; negative intermediates are allowed at the domain layer
- Currency is fixed at construction and always uppercase ISO-4217-shaped
- No `format()`, no conversion, no `number` coercion — serialization (`bigint → decimal string`) happens at the API/contract boundary via `toSafeMinor` / `fromMinor`

---

## Related documentation

- [API money guards](../../Apps/api/src/core/money.ts) — service-level `toSafeMinor`, `fromMinor`, `minorPercentage`
- [Contracts package](../contracts/README.md) — `MoneyMinor = string` serialization type