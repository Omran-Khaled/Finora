/**
 * ROOT LAYOUT — providers + splash + auth-gated navigation.
 * Auth flows live in the (auth) group; the authenticated shell in (tabs);
 * modal + stack screens are exposed only when authenticated via the anchor guards.
 */

import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "../providers/AppProviders";
import { useAuth } from "../providers/AuthProvider";
import { Tokens } from "../tokens/theme";
import { useTheme } from "../providers/ThemeProvider";

function RootNavigator() {
  const { user, needsOnboarding, isInitializing } = useAuth();
  const { isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isInitializing) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "(onboarding)";

    if (!user) {
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
      return;
    }

    if (needsOnboarding) {
      if (!inOnboarding) {
        router.replace("/(onboarding)");
      }
      return;
    }

    if (inAuthGroup || inOnboarding) {
      router.replace("/(tabs)");
    }
  }, [user, needsOnboarding, isInitializing, segments, router]);

  if (isInitializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={Tokens.colors.brand} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="accounts/index" />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="categories/index" />
        <Stack.Screen name="savings/index" />
        <Stack.Screen name="transaction/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="transactions/index" />
        <Stack.Screen name="transactions/[id]" />
        <Stack.Screen name="transfers/[id]" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = Tokens.createStyles(() => ({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Tokens.colors.background,
  },
}));