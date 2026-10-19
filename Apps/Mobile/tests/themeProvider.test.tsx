/// <reference types="jest" />

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Appearance, Platform, Text, View } from "react-native";
import { ThemeProvider, useTheme } from "../providers/ThemeProvider";
import { setTokenColorScheme, Tokens } from "../tokens/theme";
import { SecureStorage } from "../lib/storage/secureStorage";

jest.mock("../lib/storage/secureStorage", () => ({
  SecureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

function ThemeProbe({ onPreferenceResult }: { onPreferenceResult?: (error?: unknown) => void }) {
  const { preference, isDark, setPreference } = useTheme();
  return (
    <>
      <Text testID="theme-state">{`${preference}:${isDark}`}</Text>
      <View testID="themed-surface" style={themeStyles.surface} />
      <Text
        accessibilityRole="button"
        onPress={() => {
          void setPreference("dark").then(
            () => onPreferenceResult?.(),
            (error: unknown) => onPreferenceResult?.(error),
          );
        }}
      >
        Choose dark
      </Text>
    </>
  );
}

const themeStyles = Tokens.createStyles(() => ({
  surface: { backgroundColor: Tokens.colors.surface },
}));

function overrideAppearanceRuntime(
  platformOS: typeof Platform.OS,
  setColorScheme: typeof Appearance.setColorScheme | undefined,
): () => void {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
  const originalAppearanceDescriptor = Object.getOwnPropertyDescriptor(Appearance, "setColorScheme");

  Object.defineProperty(Platform, "OS", { configurable: true, value: platformOS });
  Object.defineProperty(Appearance, "setColorScheme", {
    configurable: true,
    value: setColorScheme,
  });

  return () => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(Platform, "OS", originalPlatformDescriptor);
    } else {
      Reflect.deleteProperty(Platform, "OS");
    }
    if (originalAppearanceDescriptor) {
      Object.defineProperty(Appearance, "setColorScheme", originalAppearanceDescriptor);
    } else {
      Reflect.deleteProperty(Appearance, "setColorScheme");
    }
  };
}

describe("ThemeProvider preference", () => {
  afterEach(() => {
    act(() => setTokenColorScheme("light"));
    jest.mocked(SecureStorage.getItem).mockResolvedValue(null);
  });

  it("persists a user-selected dark palette and updates subscribers", async () => {
    const screen = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-state").props.children).toBe("light:false");
    });
    expect(screen.getByTestId("themed-surface").props.style).toMatchObject({
      backgroundColor: "#FFFFFF",
    });

    fireEvent.press(screen.getByText("Choose dark"));

    await waitFor(() => {
      expect(screen.getByTestId("theme-state").props.children).toBe("dark:true");
      expect(Tokens.colors.background).toBe("#0C1724");
      expect(screen.getByTestId("themed-surface").props.style).toMatchObject({
        backgroundColor: "#142437",
      });
    });
    expect(SecureStorage.setItem).toHaveBeenCalledWith("theme_preference", "dark");
  });

  it("restores the persisted dark palette when the provider mounts", async () => {
    jest.mocked(SecureStorage.getItem).mockResolvedValueOnce("dark");

    const screen = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-state").props.children).toBe("dark:true");
      expect(Tokens.colors.background).toBe("#0C1724");
    });
  });

  it("updates web theme tokens without calling an unavailable native Appearance method", async () => {
    const restoreAppearanceRuntime = overrideAppearanceRuntime("web", undefined);

    try {
      const preferenceResult = jest.fn();
      const screen = render(
        <ThemeProvider>
          <ThemeProbe onPreferenceResult={preferenceResult} />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("theme-state").props.children).toBe("light:false");
      });

      fireEvent.press(screen.getByText("Choose dark"));

      await waitFor(() => {
        expect(preferenceResult).toHaveBeenCalledWith();
        expect(screen.getByTestId("theme-state").props.children).toBe("dark:true");
        expect(Tokens.colors.background).toBe("#0C1724");
      });
    } finally {
      restoreAppearanceRuntime();
    }
  });

  it("updates native Appearance when its color-scheme method is available", async () => {
    const setColorScheme = jest.fn(
      (_scheme: Parameters<typeof Appearance.setColorScheme>[0]) => undefined,
    );
    const restoreAppearanceRuntime = overrideAppearanceRuntime("ios", setColorScheme);

    try {
      const preferenceResult = jest.fn();
      const screen = render(
        <ThemeProvider>
          <ThemeProbe onPreferenceResult={preferenceResult} />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("theme-state").props.children).toBe("light:false");
      });

      fireEvent.press(screen.getByText("Choose dark"));

      await waitFor(() => {
        expect(preferenceResult).toHaveBeenCalledWith();
        expect(setColorScheme).toHaveBeenCalledWith("dark");
        expect(screen.getByTestId("theme-state").props.children).toBe("dark:true");
      });
    } finally {
      restoreAppearanceRuntime();
    }
  });
});
