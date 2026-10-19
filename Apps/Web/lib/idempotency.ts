export function generateIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `idem_${cryptoApi.randomUUID()}`;
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Retains a key for each unresolved financial intent, scoped by user. The
 * serialized fingerprints exist in memory only; request data is never
 * persisted. A successful operation clears only that intent.
 */
export class FinancialIntentKeyManager {
  private readonly pending = new Map<
    string,
    Map<string, { fingerprint: string; key: string }>
  >();

  async execute<T>(
    scope: string,
    payload: object,
    submit: (key: string) => Promise<T>,
  ): Promise<T> {
    const fields = payload as Record<string, unknown>;
    const fingerprint =
      JSON.stringify(
        Object.keys(fields)
          .sort()
          .map((key) => [key, fields[key]]),
      ) ?? '[]';

    let scopedIntents = this.pending.get(scope);
    if (!scopedIntents) {
      scopedIntents = new Map();
      this.pending.set(scope, scopedIntents);
    }
    const intent =
      scopedIntents.get(fingerprint) ??
      { fingerprint, key: generateIdempotencyKey() };
    scopedIntents.set(fingerprint, intent);

    const result = await submit(intent.key);
    if (scopedIntents.get(fingerprint) === intent) {
      scopedIntents.delete(fingerprint);
      if (scopedIntents.size === 0) this.pending.delete(scope);
    }
    return result;
  }
}
