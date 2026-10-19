import { describe, expect, it, beforeEach } from "@jest/globals";
import { Telemetry } from "../lib/telemetry";

describe("Telemetry (Section 61 — privacy sanitizer)", () => {
  beforeEach(() => {
    // Drain history between tests via subscribe side-effect free reset
    (Telemetry as unknown as { history: unknown[] }).history = [];
  });

  it("records only allow-listed event types", () => {
    Telemetry.track("screen_opened", { screenName: "Home" });
    const history = Telemetry.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.eventType).toBe("screen_opened");
  });

  it("strips forbidden metadata (amounts, notes, identifiers)", () => {
    Telemetry.track("transaction_created", {
      transactionType: "EXPENSE",
      // @ts-expect-error deliberately probing the sanitizer with forbidden keys
      amountMinor: 129900,
      description: "Salary deposit",
      accountId: "acc_secret",
    });
    const event = Telemetry.getHistory()[0];
    expect(event?.metadata).toEqual({ transactionType: "EXPENSE" });
    expect(JSON.stringify(event)).not.toContain("129900");
    expect(JSON.stringify(event)).not.toContain("Salary");
    expect(JSON.stringify(event)).not.toContain("acc_secret");
  });

  it("caps history at 50 events", () => {
    for (let i = 0; i < 60; i++) {
      Telemetry.track("screen_opened", { screenName: "S" + i });
    }
    expect(Telemetry.getHistory().length).toBeLessThanOrEqual(50);
  });

  it("notifies subscribers and supports unsubscribe", () => {
    const seen: string[] = [];
    const unsub = Telemetry.subscribe((event) => seen.push(event.eventType));
    Telemetry.track("goal_created", {});
    unsub();
    Telemetry.track("budget_created", {});
    expect(seen).toEqual(["goal_created"]);
  });
});
