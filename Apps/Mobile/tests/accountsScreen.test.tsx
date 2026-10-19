/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { RefreshControl } from "react-native";
import AccountsScreen from "../features/accounts/AccountsScreen";
import { api } from "../lib/api/apiClient";
import { createApiError } from "../lib/api/errors";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock("expo-router", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactRuntime.useEffect(callback, [callback]),
    useRouter: () => mockRouter,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({ user: { baseCurrency: "USD" } }),
}));

jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({ preference: "light", isDark: false, setPreference: jest.fn() }),
}));

jest.mock("../lib/api/apiClient", () => ({
  api: {
    getAccounts: jest.fn(),
  },
}));

function activeAccount(name = "Everyday account") {
  return {
    id: "account-1",
    name,
    type: "CASH" as const,
    status: "ACTIVE" as const,
    currencyCode: "USD",
    balanceMinor: "2500",
    openingBalanceMinor: "2500",
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("AccountsScreen list states", () => {
  beforeEach(() => {
    jest.mocked(api.getAccounts).mockReset();
    mockRouter.back.mockReset();
    mockRouter.replace.mockReset();
    mockRouter.canGoBack.mockReturnValue(false);
  });

  it("provides a back button and returns to More when opened without navigation history", async () => {
    jest.mocked(api.getAccounts).mockResolvedValue([]);
    const screen = render(<AccountsScreen />);

    await waitFor(() => expect(screen.getByText("No active accounts")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.canGoBack).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/more");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("shows a retryable API error instead of an empty-state success, then recovers", async () => {
    const getAccounts = jest.mocked(api.getAccounts);
    getAccounts.mockRejectedValueOnce(createApiError("NETWORK_ERROR", "Service temporarily unavailable.", "req_accounts_1"));
    getAccounts.mockResolvedValueOnce([activeAccount()]);

    const screen = render(<AccountsScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Retry")).toBeTruthy();
    }, { timeout: 30000 });
    expect(screen.getByText("Service temporarily unavailable.")).toBeTruthy();
    expect(screen.getByText("Ref: req_accounts_1")).toBeTruthy();
    expect(screen.queryByText("No active accounts")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
    fireEvent.press(screen.getByLabelText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Everyday account")).toBeTruthy();
    }, { timeout: 30000 });
    expect(screen.queryByLabelText("Retry")).toBeNull();
    expect(screen.queryByText("No active accounts")).toBeNull();
  });

  it("shows the empty state only after a successful empty response", async () => {
    jest.mocked(api.getAccounts).mockResolvedValue([]);

    const screen = render(<AccountsScreen />);

    await waitFor(() => {
      expect(screen.getByText("No active accounts")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Retry")).toBeNull();
    expect(screen.queryByText("Service temporarily unavailable.")).toBeNull();
  });

  it("preserves the last successful account list if a pull-to-refresh fails", async () => {
    const getAccounts = jest.mocked(api.getAccounts);
    getAccounts
      .mockResolvedValueOnce([activeAccount()])
      .mockRejectedValueOnce(createApiError("NETWORK_ERROR", "Refresh failed.", "req_refresh_accounts"));

    const screen = render(<AccountsScreen />);
    await waitFor(() => expect(screen.getByText("Everyday account")).toBeTruthy());

    fireEvent(screen.UNSAFE_getByType(RefreshControl), "refresh");

    await waitFor(() => expect(screen.getByText("Refresh failed.")).toBeTruthy());
    expect(screen.getByText("Everyday account")).toBeTruthy();
    expect(screen.queryByText("No active accounts")).toBeNull();
    expect(screen.getByText("Ref: req_refresh_accounts")).toBeTruthy();
  }, 30000);
});
