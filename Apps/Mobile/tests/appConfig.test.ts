/// <reference types="jest" />

import appConfig from "../app.config";

describe("Expo configuration", () => {
  const originalEnvironment = {
    FINORA_RELEASE: process.env.FINORA_RELEASE,
    FINORA_IOS_BUNDLE_ID: process.env.FINORA_IOS_BUNDLE_ID,
    FINORA_ANDROID_PACKAGE: process.env.FINORA_ANDROID_PACKAGE,
    EXPO_PUBLIC_USE_REAL_API: process.env.EXPO_PUBLIC_USE_REAL_API,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("allows the native appearance to follow the selected app theme", () => {
    process.env.FINORA_RELEASE = "preview";
    const config = appConfig({ config: {} } as Parameters<typeof appConfig>[0]);

    expect(config.userInterfaceStyle).toBe("automatic");
    expect(config.backgroundColor).toBe("#F3F8FD");
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe("#F3F8FD");
    expect(config.plugins).toContainEqual([
      "expo-splash-screen",
      expect.objectContaining({ backgroundColor: "#F3F8FD" }),
    ]);
  });

  it("rejects mock mode while resolving production Expo config", () => {
    process.env.FINORA_RELEASE = "production";
    process.env.FINORA_IOS_BUNDLE_ID = "com.finora.test.ios";
    process.env.FINORA_ANDROID_PACKAGE = "com.finora.test.android";
    process.env.EXPO_PUBLIC_USE_REAL_API = "0";

    expect(
      () => appConfig({ config: {} } as Parameters<typeof appConfig>[0]),
    ).toThrow("EXPO_PUBLIC_USE_REAL_API must be \"1\" in production");
  });
});
