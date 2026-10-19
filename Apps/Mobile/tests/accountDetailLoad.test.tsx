/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AccountDetailRoute from "../app/accounts/[id]";
import { api } from "../lib/api/apiClient";
import { createApiError } from "../lib/api/errors";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  replace: jest.fn(),
};

jest.mock("expo-router", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactRuntime.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ id: "account-1" }),
    useRouter: () => mockRouter,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../lib/api/apiClient", () => ({
  api: {
    getAccounts: jest.fn(),
    updateAccount: jest.fn(),
    archiveAccount: jest.fn(),
  },
}));

jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({ preference: "light", isDark: false, setPreference: jest.fn() }),
}));

describe("account detail loading", () => {
  beforeEach(() => {
    jest.mocked(api.getAccounts).mockReset();
    jest.mocked(api.updateAccount).mockReset();
    jest.mocked(api.archiveAccount).mockReset();
    mockRouter.back.mockReset();
    mockRouter.canGoBack.mockReturnValue(true);
    mockRouter.replace.mockReset();
  });

  const activeAccount = {
    id: "account-1",
    name: "Everyday account",
    type: "CASH" as const,
    status: "ACTIVE" as const,
    currencyCode: "USD",
    balanceMinor: "2500",
    openingBalanceMinor: "2500",
  };

  it("shows a retryable service error and renders account details after recovery", async () => {
    const getAccounts = jest.mocked(api.getAccounts);
    getAccounts.mockRejectedValueOnce(new Error("temporary service failure"));
    getAccounts.mockResolvedValueOnce([activeAccount]);

    const screen = render(<AccountDetailRoute />);

    await waitFor(() => {
      expect(screen.getByLabelText("Retry")).toBeTruthy();
    });
    expect(screen.queryByText("Account not found.")).toBeNull();
    expect(screen.getByText("We couldn't connect to the service. Please try again.")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Everyday account")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Retry")).toBeNull();
    expect(getAccounts).toHaveBeenCalledTimes(2);
  });

  it("renames an account through the canonical API and refreshes the detail", async () => {
    jest.mocked(api.getAccounts).mockResolvedValue([activeAccount]);
    jest.mocked(api.updateAccount).mockResolvedValue({ ...activeAccount, name: "Travel account" });

    const screen = render(<AccountDetailRoute />);
    await waitFor(() => expect(screen.getByText("Everyday account")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Edit account"));
    fireEvent.changeText(screen.getByLabelText("Account name"), "  Travel account  ");
    fireEvent.press(screen.getByLabelText("Save changes"));

    await waitFor(() => expect(screen.getByText("Travel account")).toBeTruthy());
    expect(api.updateAccount).toHaveBeenCalledWith("account-1", { name: "Travel account" });
  });

  it("confirms archive, preserves the account on blockers, and shows the API error", async () => {
    jest.mocked(api.getAccounts).mockResolvedValue([activeAccount]);
    jest.mocked(api.archiveAccount).mockRejectedValue(
      createApiError("ACCOUNT_HAS_ACTIVE_GOAL", "An account with an active savings goal cannot be archived."),
    );

    const screen = render(<AccountDetailRoute />);
    await waitFor(() => expect(screen.getByText("Everyday account")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Archive account"));
    expect(screen.getByText("Archive this account?")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Archive"));

    await waitFor(() => {
      expect(screen.getByText("An account with an active savings goal cannot be archived.")).toBeTruthy();
    });
    expect(api.archiveAccount).toHaveBeenCalledWith("account-1");
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Everyday account")).toBeTruthy();
  });

  it("archives an account only after confirmation and returns to the accounts list", async () => {
    jest.mocked(api.getAccounts).mockResolvedValue([activeAccount]);
    jest.mocked(api.archiveAccount).mockResolvedValue({ ...activeAccount, status: "ARCHIVED" });

    const screen = render(<AccountDetailRoute />);
    await waitFor(() => expect(screen.getByText("Everyday account")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Archive account"));
    expect(api.archiveAccount).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Archive"));

    await waitFor(() => {
      expect(api.archiveAccount).toHaveBeenCalledWith("account-1");
      expect(mockRouter.replace).toHaveBeenCalledWith("/accounts");
    });
  });

  it("returns to the accounts list when opened without back history", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    jest.mocked(api.getAccounts).mockResolvedValue([activeAccount]);

    const screen = render(<AccountDetailRoute />);
    await waitFor(() => expect(screen.getByText("Everyday account")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/accounts");
  });
});
