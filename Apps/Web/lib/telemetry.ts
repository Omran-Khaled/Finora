'use client';

// Lightweight product telemetry — interaction measurement only.
// NEVER includes financial amounts, descriptions, account names, or any sensitive data.
// Section 31: only screen_opened, transaction_created, goal_created, budget_created.

type TelemetryEvent =
  | { name: 'screen_opened'; properties: { screen: string } }
  | { name: 'transaction_created'; properties: { type: string } }
  | { name: 'goal_created'; properties: {} }
  | { name: 'budget_created'; properties: {} };

export function track(event: TelemetryEvent): void {
  // In production this would send to an analytics provider.
  // For now, log to console in development only.
  if (process.env.NODE_ENV === 'development') {
    console.debug('[telemetry]', event.name, event.properties);
  }
}

export function trackScreenOpened(screen: string): void {
  track({ name: 'screen_opened', properties: { screen } });
}

export function trackTransactionCreated(type: string): void {
  track({ name: 'transaction_created', properties: { type } });
}

export function trackGoalCreated(): void {
  track({ name: 'goal_created', properties: {} });
}

export function trackBudgetCreated(): void {
  track({ name: 'budget_created', properties: {} });
}
