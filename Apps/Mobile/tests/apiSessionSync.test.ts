import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { HttpAdapter } from "../lib/api/httpAdapter";

const API_URL = "https://api.test.local";
const originalApiMode = process.env.EXPO_PUBLIC_USE_REAL_API;
const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const originalFetch = global.fetch;

type FetchArgs = [string, { method?: string; headers?: Record<string, string> }];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("mobile API facade session synchronization", () => {
  let api: typeof import("../lib/api/apiClient").api;
  let adapter: HttpAdapter;
  let secureStorage: typeof import("../lib/storage/secureStorage").SecureStorage;
  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_USE_REAL_API = "1";
    process.env.EXPO_PUBLIC_API_URL = API_URL;

    // Resolve the real HTTP adapter only after setting its import-time config.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const clientModule = require("../lib/api/apiClient") as typeof import("../lib/api/apiClient");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const adapterModule = require("../lib/api/httpAdapter") as typeof import("../lib/api/httpAdapter");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const storageModule = require("../lib/storage/secureStorage") as typeof import("../lib/storage/secureStorage");
    api = clientModule.api;
    adapter = adapterModule.httpAdapter as HttpAdapter;
    secureStorage = storageModule.SecureStorage;
    fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await secureStorage.clearSession();
    process.env.EXPO_PUBLIC_USE_REAL_API = originalApiMode;
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const calls = () => fetchMock.mock.calls as unknown as FetchArgs[];

  it("activates the login token for the request immediately following login", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: { token: "login-token", user: { id: "user-login", email: "login@finora.test" } },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.login({ email: "login@finora.test", password: "password-123" });
    await api.getAdapter().getAccounts("user-login");

    expect(calls()[1]?.[1]?.headers?.Authorization).toBe("Bearer login-token");
  });

  it("activates the register token for the request immediately following registration", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: { token: "register-token", user: { id: "user-register", email: "register@finora.test" } },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.register({
      email: "register@finora.test",
      password: "password-123",
      baseCurrency: "USD",
    });
    await api.getAdapter().getAccounts("user-register");

    expect(calls()[1]?.[1]?.headers?.Authorization).toBe("Bearer register-token");
  });

  it("synchronizes the persisted token before issuing logout", async () => {
    await secureStorage.setItem("auth_token", "stored-login-token");
    await secureStorage.setItem("session_user", JSON.stringify({
      id: "user-logout",
      email: "logout@finora.test",
    }));
    adapter.setToken("stale-in-memory-token");
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));

    await api.logout();

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.[0]).toContain("/auth/logout");
    expect(calls()[0]?.[1]?.headers?.Authorization).toBe("Bearer stored-login-token");
    expect(await secureStorage.getItem("auth_token")).toBeNull();
  });
});
