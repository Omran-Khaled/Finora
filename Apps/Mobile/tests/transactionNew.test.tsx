/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AddTransactionScreen from "../app/transaction/new";
import { api } from "../lib/api/apiClient";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({ preference: "light", isDark: false, setPreference: jest.fn() }),
}));

jest.mock("../lib/api/apiClient", () => ({
  api: {
    getAccounts: jest.fn(),
    getCategories: jest.fn(),
    createTransaction: jest.fn(),
    createTransfer: jest.fn(),
  },
}));

const account = {
  id: "account-1",
  name: "Everyday",
  type: "CASH" as const,
  status: "ACTIVE" as const,
  currencyCode: "USD",
  balanceMinor: "10000",
  openingBalanceMinor: "10000",
  userId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const expenseCategory = {
  id: "category-expense",
  name: "Food",
  type: "EXPENSE" as const,
  status: "ACTIVE" as const,
  isSystem: false,
  userId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AddTransactionScreen transaction type changes", () => {
  beforeEach(() => {
    jest.mocked(api.getAccounts).mockResolvedValue([account]);
    jest.mocked(api.getCategories).mockResolvedValue([expenseCategory]);
    jest.mocked(api.createTransaction).mockResolvedValue({
      id: "transaction-1",
      userId: "user-1",
      accountId: account.id,
      categoryId: null,
      type: "INCOME",
      amountMinor: "100",
      currencyCode: "USD",
      description: null,
      transactionDate: "2026-01-01",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("clears the old category and sends no mismatched category after changing type", async () => {
    const screen = render(<AddTransactionScreen />);

    await waitFor(() => expect(screen.getByLabelText("Select category Food")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Select category Food"));
    fireEvent.press(screen.getByLabelText("Transaction type Income"));
    fireEvent.press(screen.getByLabelText("Digit 1"));
    fireEvent.press(screen.getByLabelText("Save Transaction"));

    await waitFor(() => {
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "INCOME",
          categoryId: null,
        }),
      );
    });
  }, 15000);

  it("does not issue a request when a type change leaves expense without a matching category", async () => {
    const screen = render(<AddTransactionScreen />);

    await waitFor(() => expect(screen.getByLabelText("Select category Food")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Select category Food"));
    fireEvent.press(screen.getByLabelText("Transaction type Income"));
    fireEvent.press(screen.getByLabelText("Transaction type Expense"));
    fireEvent.press(screen.getByLabelText("Digit 1"));
    fireEvent.press(screen.getByLabelText("Save Transaction"));

    await waitFor(() => {
      expect(screen.getByText("Expense requires a category (BR-003).")).toBeTruthy();
    });
    expect(api.createTransaction).not.toHaveBeenCalled();
  });
});
