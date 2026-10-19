/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import CategoriesScreen from "../features/categories/CategoriesScreen";
import SavingsGoalsScreen from "../features/savings/SavingsGoalsScreen";
import TransactionsScreen from "../features/transactions/TransactionsScreen";
import TransactionDetailRoute from "../app/transactions/[id]";
import { api } from "../lib/api/apiClient";

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
    useLocalSearchParams: () => ({ id: "transaction-1" }),
    useRouter: () => mockRouter,
  };
});

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
    getSavingsGoals: jest.fn(),
    getTransactions: jest.fn(),
  },
}));

describe("Mobile secondary-screen back navigation", () => {
  beforeEach(() => {
    jest.mocked(api.getAccounts).mockResolvedValue([]);
    jest.mocked(api.getCategories).mockResolvedValue([]);
    jest.mocked(api.getSavingsGoals).mockResolvedValue([]);
    jest.mocked(api.getTransactions).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    mockRouter.back.mockReset();
    mockRouter.canGoBack.mockReturnValue(false);
    mockRouter.replace.mockReset();
  });

  it("returns Categories to More when there is no prior route", async () => {
    const screen = render(<CategoriesScreen />);

    await waitFor(() => expect(screen.getByText("No categories")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/more");
  });

  it("returns Savings Goals to More when there is no prior route", async () => {
    const screen = render(<SavingsGoalsScreen />);

    await waitFor(() => expect(screen.getByText("No savings goals yet")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/more");
  });

  it("returns standalone transactions to the Transactions tab without back history", async () => {
    const screen = render(<TransactionsScreen standalone />);

    await waitFor(() => expect(screen.getByText("No transactions found")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/transactions");
  });

  it("returns a directly opened transaction detail to the transaction list", async () => {
    const screen = render(<TransactionDetailRoute />);

    await waitFor(() => expect(screen.getByText("Transaction not found")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Go back"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/transactions");
  });
});
