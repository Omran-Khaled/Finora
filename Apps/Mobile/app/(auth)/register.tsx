import { View, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
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
import { CURRENCIES } from "../../lib/currencies";
import { WebForm } from "../../components/WebForm";

export default function RegisterScreen() {
  useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please provide a valid email and password.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const session = await AuthService.register({
        email: email.trim(),
        password: password.trim(),
        baseCurrency: currency,
      });
      await signUp(session.user);
      Telemetry.track("screen_opened", { screenName: "Register" });
      // Root layout redirects to onboarding (new users have no accounts).
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <WebForm onSubmit={() => void handleRegister()}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={[styles.logo, styles.logoRegister]}>
              <Ionicons name="person-add" size={26} color={Tokens.colors.textInverse} />
            </View>
            <AppText variant="large" weight="extrabold">
              Create Account
            </AppText>
            <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.tagline}>
              Build a clearer view of your money, one thoughtful step at a time.
            </AppText>
          </View>

          <ErrorBanner error={error} onDismiss={() => setError(null)} />

          <TextField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="alex@finora.app"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            label="Create Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
          />

          <View>
            <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary}>
              Base Currency (permanent)
            </AppText>
            <View style={styles.currencyGrid}>
              {CURRENCIES.map((item) => (
                <Pressable
                  key={item.code}
                  accessibilityRole="button"
                  accessibilityLabel={"Select " + item.code}
                  onPress={() => setCurrency(item.code)}
                  style={({ pressed }) => [
                    styles.currencyOption,
                    currency === item.code ? styles.currencyOptionActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText
                    variant="small"
                    weight="bold"
                    color={currency === item.code ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
                  >
                    {item.code}
                  </AppText>
                  <AppText
                    variant="tiny"
                    color={currency === item.code ? Tokens.colors.textInverse : Tokens.colors.textSecondary}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          <Button onPress={handleRegister} label="Continue to Onboarding" loading={isLoading} style={styles.submit} />

          <View style={styles.footer}>
            <AppText variant="small" color={Tokens.colors.textSecondary}>
              Already registered?
            </AppText>
            <Button onPress={() => router.push("/(auth)/login")} label="Sign in" variant="ghost" />
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
    paddingTop: Tokens.spacing.xl,
    paddingBottom: Tokens.spacing.md,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Tokens.spacing.md,
  },
  logoRegister: {
    backgroundColor: Tokens.colors.success,
  },
  tagline: {
    marginTop: Tokens.spacing.xs,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  submit: {
    marginTop: Tokens.spacing.sm,
  },
  currencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: Tokens.spacing.sm,
  },
  currencyOption: {
    width: "48%",
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    marginBottom: Tokens.spacing.sm,
  },
  currencyOptionActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  pressed: {
    opacity: 0.8,
  },
  footer: {
    alignItems: "center",
    marginTop: Tokens.spacing.lg,
  },
}));