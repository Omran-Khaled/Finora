/// <reference types="jest" />

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MoreScreen from "../features/more/MoreScreen";
import { ThemeProvider } from "../providers/ThemeProvider";
import { Tokens } from "../tokens/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({ user: { email: "user@finora.test", baseCurrency: "USD" }, signOut: jest.fn() }),
}));

describe("More appearance settings", () => {
  it("exposes accessible Light, Dark, and System choices and applies the selected palette", async () => {
    const screen = render(
      <ThemeProvider>
        <MoreScreen />
      </ThemeProvider>,
    );

    const darkChoice = await screen.findByLabelText("Dark theme");
    expect(screen.getByLabelText("Light theme").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("System theme")).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.UNSAFE_getByType(SafeAreaView).props.style).backgroundColor,
    ).toBe("#F3F8FD");

    fireEvent.press(darkChoice);

    await waitFor(() => {
      expect(screen.getByLabelText("Dark theme").props.accessibilityState.selected).toBe(true);
      expect(Tokens.colors.background).toBe("#0C1724");
      expect(
        StyleSheet.flatten(screen.UNSAFE_getByType(SafeAreaView).props.style).backgroundColor,
      ).toBe("#0C1724");
    });
  });
});
