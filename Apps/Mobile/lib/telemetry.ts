/**
 * LIGHTWEIGHT PRODUCT TELEMETRY (Section 61).
 * STRICT PRIVACY RULES:
 * - Allowed events only: screen_opened, transaction_created, goal_created, budget_created.
 * - FORBIDDEN: monetary amounts, transaction notes, account names, user details, tokens, passwords..
 * Kept as an abstraction; no network sink is wired in the MVP client..
 */

export type TelemetryEventType =
  | 'screen_opened'
  | 'transaction_created'
  | 'goal_created'
  | 'budget_created';

export interface TelemetryEvent {
  id: string;
  eventType: TelemetryEventType;
  timestamp: string;
  metadata?: {
    screenName?: string;
    transactionType?: string;
    hasCategory?: boolean;
  };
}

export type TelemetryMetadata = {
  screenName?: string;
  transactionType?: string;
  hasCategory?: boolean;
};

type TelemetryListener = (event: TelemetryEvent) => void;

class TelemetryBus {
  private listeners: TelemetryListener[] = [];
  private history: TelemetryEvent[] = [];

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getHistory(): TelemetryEvent[] {
    return [...this.history];
  }

  track(eventType: TelemetryEventType, metadata?: TelemetryMetadata): void {
    // Sanitize metadata → zero financial / PII data leak
    const safeMetadata: Record<string, string | boolean> = {};
    if (metadata?.screenName) safeMetadata.screenName = String(metadata.screenName);
    if (metadata?.transactionType) safeMetadata.transactionType = String(metadata.transactionType);
    if (typeof metadata?.hasCategory === 'boolean') safeMetadata.hasCategory = metadata.hasCategory;

    const event: TelemetryEvent = {
      id: 'tel_' + Math.random().toString(36).substring(2, 9),
      eventType,
      timestamp: new Date().toISOString(),
      metadata: safeMetadata,
    };

    this.history.unshift(event);
    if (this.history.length > 50) this.history.pop();

    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch {
        // Telemetry must never break the product
      }
    });
  }
}

export const Telemetry = new TelemetryBus();