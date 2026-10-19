import { describe, expect, it } from "@jest/globals";
import { resolveMobileApiConfig } from "../lib/api/apiConfig";

describe("Mobile API configuration", () => {
  it("selects the real adapter for an explicit valid real configuration", () => {
    expect(
      resolveMobileApiConfig("1", "https://api.finora.com", "production"),
    ).toEqual({
      useRealApi: true,
      baseUrl: "https://api.finora.com",
    });
  });

  it("allows explicit mock mode in development and test only", () => {
    expect(resolveMobileApiConfig("0", undefined, "development")).toEqual({
      useRealApi: false,
      baseUrl: null,
    });
    expect(resolveMobileApiConfig("0", undefined, "test").useRealApi).toBe(false);
  });

  it.each([undefined, "", "typo", "true", "2"])(
    "rejects missing or invalid mode: %s",
    (mode) => {
      expect(
        () => resolveMobileApiConfig(mode, "https://api.finora.test", "production"),
      ).toThrow("EXPO_PUBLIC_USE_REAL_API must be explicitly set");
    },
  );

  it("rejects explicit mock mode in production", () => {
    expect(() => resolveMobileApiConfig("0", undefined, "production")).toThrow(
      "EXPO_PUBLIC_USE_REAL_API must be \"1\" in production",
    );
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "/api/v1",
    "https:api.finora.test",
    "http://api.finora.test",
    "https://api.finora.test/api/v1",
    "https://user:pass@api.finora.test",
    "https://api.finora.test?debug=1",
    "https://api.finora.test",
    "https://[::1]",
  ])("rejects missing or malformed production API URL: %s", (apiUrl) => {
    expect(() => resolveMobileApiConfig("1", apiUrl, "production")).toThrow();
  });
});
