import { describe, expect, it } from "@jest/globals";
import { mapHttpError, toUserMessage } from "../lib/api/errors";

describe("toUserMessage (Section 49 — no internals leak)", () => {
  it("maps a server failure to an actionable safe message", () => {
    const err = mapHttpError(500, null, "req_1");
    expect(toUserMessage(err)).toBe("The service could not complete the request. Please try again.");
  });

  it("surfaces the session message for UNAUTHORIZED", () => {
    const err = mapHttpError(401, null, "req_2");
    expect(toUserMessage(err)).toBe("Your session has expired. Please sign in again.");
  });

  it("shows actionable messages for insufficient funds and invalid category type", () => {
    const insufficientFunds = mapHttpError(
      422,
      { error: { code: "INSUFFICIENT_FUNDS", message: "Internal server error." } },
      "req_4",
    );
    const invalidCategoryType = mapHttpError(
      422,
      { error: { code: "INVALID_CATEGORY_TYPE", message: "Internal server error." } },
      "req_5",
    );

    expect(toUserMessage(insufficientFunds)).toBe(
      "Insufficient funds. Choose an account with enough available balance or reduce the amount.",
    );
    expect(toUserMessage(invalidCategoryType)).toBe(
      "Choose a category that matches the transaction type.",
    );
  });

  it("shows actionable account archive messages", () => {
    const archived = mapHttpError(
      422,
      { error: { code: "ACCOUNT_ARCHIVED", message: "Internal server error." } },
      "req_6",
    );
    const activeGoal = mapHttpError(
      422,
      { error: { code: "ACCOUNT_HAS_ACTIVE_GOAL", message: "Internal server error." } },
      "req_7",
    );

    expect(toUserMessage(archived)).toBe(
      "This account is already archived. Return to Accounts and choose an active account.",
    );
    expect(toUserMessage(activeGoal)).toBe(
      "This account cannot be archived while it has an active savings goal.",
    );
  });

  it("passes through server validation messages", () => {
    const err = mapHttpError(422, { error: { code: "VALIDATION_ERROR", message: "Amount too large." } }, "req_3");
    expect(toUserMessage(err)).toBe("Amount too large.");
  });

  it("falls back safely for unknown failure shapes", () => {
    expect(toUserMessage(undefined)).toBe("We couldn't connect to the service. Please try again.");
    expect(toUserMessage(42)).toBe("We couldn't connect to the service. Please try again.");
  });
});

describe("mapHttpError (HTTP → canonical envelope)", () => {
  it("maps status codes to contract error codes", () => {
    expect(mapHttpError(409, null, "r").error.code).toBe("DUPLICATE_REQUEST");
    expect(mapHttpError(403, null, "r").error.code).toBe("FORBIDDEN");
    expect(mapHttpError(404, null, "r").error.code).toBe("VALIDATION_ERROR");
  });

  it("honors a well-formed server error body and preserves requestId", () => {
    const err = mapHttpError(400, { error: { code: "INVALID_AMOUNT", message: "Bad amount", requestId: "srv_9" } }, "req_x");
    expect(err.error.code).toBe("INVALID_AMOUNT");
    expect(err.error.requestId).toBe("srv_9");
  });

  it("falls back for malformed bodies", () => {
    const err = mapHttpError(503, "not-an-object", "req_y");
    expect(err.error.code).toBe("NETWORK_ERROR");
    expect(err.error.requestId).toBe("req_y");
  });
});
