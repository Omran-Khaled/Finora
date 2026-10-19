import type { ErrorEnvelope } from './types';

// Extracts a user-facing message from an API failure (ErrorEnvelope-shaped
// objects, Error instances, or anything else) without leaking technical
// details such as stack traces or request internals.
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    typeof (err as { error?: { message?: unknown } }).error?.message === 'string'
  ) {
    return (err as { error: { message: string } }).error.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
