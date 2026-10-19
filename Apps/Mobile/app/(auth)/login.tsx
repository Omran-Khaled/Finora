import { View, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { AuthService } from "../../lib/auth/authService";
import { useAuth } from "../../providers/AuthProvider";
import { Telemetry } from "../../lib/telemetry";
import { WebForm } from "../../components/WebForm";

export default function LoginScreen() {
  useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please provide your email and password.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const session = await AuthService.login({ email: email.trim(), password });
      await signIn(session.user);
      Telemetry.track("screen_opened", { screenName: "Login" });
      // The root layout gate redirects based on auth/onboarding state
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <WebForm onSubmit={() => void handleLogin()}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Ionicons name="shield-checkmark" size={28} color={Tokens.colors.textInverse} />
            </View>
            <AppText variant="tiny" weight="bold" color={Tokens.colors.brand} style={styles.eyebrow}>
              PERSONAL FINANCE, WITH CLARITY
            </AppText>
            <AppText variant="large" weight="extrabold">
              Finora
            </AppText>
            <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.tagline}>
              Personal financial clarity with calm precision and speed.
            </AppText>
          </View>

          <ErrorBanner error={error} onDismiss={() => setError(null)} />

          <TextField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
          />

          <Button onPress={handleLogin} label="Sign In" loading={isLoading} style={styles.submit} />

          <View style={styles.footer}>
            <AppText variant="small" color={Tokens.colors.textSecondary}>
              Don&apos;t have an account?
            </AppText>
            <Button onPress={() => router.push("/(auth)/register")} label="Create one" variant="ghost" />
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </WebForm>
    </Screen>
  );
}

const styles = Tokens.createStyles(() => ({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: Tokens.spacing.xl,
    justifyContent: "space-between",
  },
  brand: {
    alignItems: "center",
    paddingTop: Tokens.spacing.xxl,
    paddingBottom: Tokens.spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Tokens.spacing.md,
  },
  tagline: {
    marginTop: Tokens.spacing.xs,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  eyebrow: {
    marginBottom: Tokens.spacing.xs,
    letterSpacing: 1.1,
  },
  submit: {
    marginTop: Tokens.spacing.sm,
  },
  footer: {
    alignItems: "center",
    marginTop: Tokens.spacing.lg,
  },
}));