/**
 * API ERROR ENVELOPE + USER-FACING MAPPING (Section 49, 64).
 * Never surface stack traces / engine internals to users.
 * Technical detail stays in dev logs only.
 */

import { ApiErrorCode, ApiErrorEnvelope } from "../../types/contract";

const FALLBACK_MESSAGE = "We couldn't connect to the service. Please try again.";
const GENERIC_SERVER_MESSAGES = new Set([
  "Internal server error.",
  "Something went wrong. Please try again.",
]);

// Local transport metadata; the shared API error envelope remains unchanged.
type HttpApiError = ApiErrorEnvelope & { readonly status?: number };

export function createApiError(
  code: ApiErrorCode,
  message: string,
  requestId: string = "req_" + Math.random().toString(36).substring(2, 9),
): ApiErrorEnvelope {
  return { error: { code, message, requestId } };
}

export function isApiError(err: unknown): err is ApiErrorEnvelope {
  if (!err || typeof err !== "object") return false;
  if (!("error" in err)) return false;
  const candidate = err as ApiErrorEnvelope;
  return typeof candidate.error?.code === "string";
}

/** User-facing phrase for any failure. Technical internals never leak. */
export function toUserMessage(err: ApiErrorEnvelope | string | unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (isApiError(err)) {
    switch (err.error.code) {
      case "NETWORK_ERROR":
        return err.error.message || FALLBACK_MESSAGE;
      case "UNAUTHORIZED":
        return err.error.message || "Your session has expired. Please sign in again.";
      case "FORBIDDEN":
        return err.error.message || "You do not have permission to perform this action.";
      case "DUPLICATE_REQUEST":
        return err.error.message || "This request was already processed. Please refresh and check again.";
      case "INSUFFICIENT_FUNDS":
        return "Insufficient funds. Choose an account with enough available balance or reduce the amount.";
      case "INVALID_CATEGORY_TYPE":
        return "Choose a category that matches the transaction type.";
      case "ACCOUNT_ARCHIVED":
        return isGenericServerMessage(err.error.message)
          ? "This account is already archived. Return to Accounts and choose an active account."
          : err.error.message;
      case "ACCOUNT_HAS_ACTIVE_GOAL":
        return isGenericServerMessage(err.error.message)
          ? "This account cannot be archived while it has an active savings goal."
          : err.error.message;
      case "VALIDATION_ERROR":
      case "INVALID_AMOUNT":
      case "INVALID_CURRENCY":
      case "INVALID_ACCOUNT_NAME":
      case "INVALID_OPENING_BALANCE":
        return err.error.message || "Please review the form and try again.";
      default:
        return err.error.message || FALLBACK_MESSAGE;
    }
  }
  return FALLBACK_MESSAGE;
}

function isGenericServerMessage(message: string | undefined): boolean {
  return !message || GENERIC_SERVER_MESSAGES.has(message);
}

/** Map an HTTP status + optional server body onto the canonical envelope. */
export function mapHttpError(status: number, body: unknown, requestId: string): HttpApiError {
  if (body && typeof body === "object" && "error" in body) {
    const serverError = (body as { error?: { code?: string; message?: string; requestId?: string } }).error;
    if (serverError?.code && typeof serverError.code === "string") {
      return {
        status,
        error: {
          code: serverError.code as ApiErrorCode,
          message: serverError.message || "Something went wrong. Please try again.",
          requestId: serverError.requestId || requestId,
        },
      };
    }
  }

  const byStatus: Partial<Record<number, { code: ApiErrorCode; message: string }>> = {
    400: { code: "VALIDATION_ERROR", message: "The request was invalid. Please review your input." },
    401: { code: "UNAUTHORIZED", message: "Your session has expired. Please sign in again." },
    403: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
    404: { code: "VALIDATION_ERROR", message: "The requested resource was not found." },
    409: { code: "DUPLICATE_REQUEST", message: "This request was already processed. Please refresh and check again." },
    422: { code: "VALIDATION_ERROR", message: "The request was invalid. Please review your input." },
    429: { code: "RATE_LIMITED", message: "Too many requests. Please try again in a moment." },
    500: { code: "NETWORK_ERROR", message: "The service could not complete the request. Please try again." },
    502: { code: "NETWORK_ERROR", message: "The service is temporarily unavailable. Please try again." },
    503: { code: "NETWORK_ERROR", message: "The service is temporarily unavailable. Please try again." },
  };
  const mapped = byStatus[status] || { code: "NETWORK_ERROR" as ApiErrorCode, message: FALLBACK_MESSAGE };
  return { status, error: { ...mapped, requestId } };
}