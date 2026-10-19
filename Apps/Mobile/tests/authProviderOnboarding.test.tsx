/// <reference types="jest" />

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "../providers/AuthProvider";
import { AuthService } from "../lib/auth/authService";
import { api } from "../lib/api/apiClient";
import type { User } from "../types/contract";

jest.mock("../lib/auth/authService", () => ({
  AuthService: {
    getCurrentUser: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock("../lib/api/apiClient", () => ({
  api: {
    getAccounts: jest.fn(),
  },
}));

const returningUser: User = {
  id: "user-returning",
  email: "returning@finora.test",
  baseCurrency: "USD",
};

function AuthProbe() {
  const { user, needsOnboarding, isInitializing } = useAuth();
  return (
    <Text testID="auth-probe">
      {`${isInitializing ? "initializing" : "ready"}:${user?.id ?? "signed-out"}:${needsOnboarding}`}
    </Text>
  );
}

describe("AuthProvider onboarding account check", () => {
  it("keeps a returning user signed in and does not infer onboarding from a transient list error", async () => {
    jest.mocked(AuthService.getCurrentUser).mockResolvedValue(returningUser);
    jest.mocked(api.getAccounts).mockRejectedValue(new Error("temporary network error"));

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-probe").props.children).toBe("ready:user-returning:false");
    });
    expect(AuthService.logout).not.toHaveBeenCalled();
  });

  it("requires onboarding only after a successful empty account response", async () => {
    jest.mocked(AuthService.getCurrentUser).mockResolvedValue(returningUser);
    jest.mocked(api.getAccounts).mockResolvedValue([]);

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-probe").props.children).toBe("ready:user-returning:true");
    });
    expect(AuthService.logout).not.toHaveBeenCalled();
  });

  it("clears the session on an unauthorized account check", async () => {
    jest.mocked(AuthService.getCurrentUser).mockResolvedValue(returningUser);
    jest.mocked(api.getAccounts).mockRejectedValue({
      error: { code: "UNAUTHORIZED", message: "Session expired.", requestId: "req_auth_1" },
    });

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-probe").props.children).toBe("ready:signed-out:false");
    });
    expect(AuthService.logout).toHaveBeenCalledTimes(1);
  });
});
