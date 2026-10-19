import { createHash } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";

export function fingerprint(payload: Record<string, string | number | bigint | null>): string {
  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((key) => [key, typeof payload[key] === "bigint" ? payload[key].toString() : payload[key]]),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Rows written before payload fingerprints were introduced cannot be safely
 * compared with a new request.  Treat them as an ambiguous duplicate rather
 * than accepting either a replay or a different payload.
 */
export function assertMatchingFingerprint(
  stored: string | undefined,
  requested: string,
): void {
  if (stored === undefined || stored !== requested) {
    throw new ConflictException({ code: "DUPLICATE_REQUEST" });
  }
}

export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (!key) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Idempotency-Key header is required for financial writes.' });
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.` });
  }
  return key;
}
