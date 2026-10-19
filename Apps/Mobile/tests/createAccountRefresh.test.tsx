/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { CreateAccountModal } from "../features/accounts/components/CreateAccountModal";
import { api } from "../lib/api/apiClient";
import { createApiError } from "../lib/api/errors";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({ user: { baseCurrency: "USD" } }),
}));

jest.mock("../lib/api/apiClient", () => ({
  api: {
    createAccount: jest.fn(),
  },
}));

describe("CreateAccountModal refresh handoff", () => {
  it("awaits list refresh, preserves its request id on failure, and retries refresh without creating twice", async () => {
    const onClose = jest.fn();
    const onSuccess = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(createApiError("NETWORK_ERROR", "Account list is temporarily unavailable.", "req_refresh_1"))
      .mockResolvedValueOnce(undefined);
    jest.mocked(api.createAccount).mockResolvedValue({
      id: "account-created",
      userId: "user-1",
      name: "Primary",
      type: "BANK",
      status: "ACTIVE",
      currencyCode: "USD",
      balanceMinor: "0",
      openingBalanceMinor: "0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const screen = render(
      <CreateAccountModal isOpen onClose={onClose} onSuccess={onSuccess} />,
    );

    fireEvent.changeText(screen.getByPlaceholderText("e.g. Daily Checking, Vault Savings"), "Primary");
    fireEvent.press(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Ref: req_refresh_1")).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Retry Accounts Refresh")).toBeTruthy();
    expect(api.createAccount).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText("Retry Accounts Refresh"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(api.createAccount).toHaveBeenCalledTimes(1);
  });
});
