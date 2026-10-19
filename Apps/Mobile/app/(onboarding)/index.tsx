import { View, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { api } from "../../lib/api/apiClient";
import { useAuth } from "../../providers/AuthProvider";
import { parseAmountToMinor } from "../../lib/format";
import { currencyLabel } from "../../lib/currencies";

const ACCOUNT_TYPES = ["BANK", "CASH", "SAVINGS"] as const;

type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export default function OnboardingScreen() {
  useTheme();
  const { user, completeOnboarding } = useAuth();
  const userCurrency = user?.baseCurrency || "USD";
  const [step, setStep] = useState<number>(1);
  const [accountName, setAccountName] = useState("Main Checking Account");
  const [accountType, setAccountType] = useState<AccountTypeValue>("BANK");
  const [openingBalanceStr, setOpeningBalanceStr] = useState("1000.00");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleCreateFirstAccount = async () => {
    if (!accountName.trim()) {
      setError("Please provide an account name.");
      return;
    }
    const openingBalanceMinor = parseAmountToMinor(openingBalanceStr, userCurrency, { allowZero: true });
    if (openingBalanceMinor === null) {
      setError("Opening balance must be a non-negative number.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.createAccount({
        name: accountName.trim(),
        type: accountType,
        currencyCode: userCurrency,
        openingBalanceMinor,
      });
      completeOnboarding();
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.stepRow}>
          <View style={styles.steps}>
            <View style={[styles.stepCircle, step === 1 ? styles.stepCircleActive : styles.stepCircleDone]}>
              {step === 1 ? (
                <AppText variant="small" weight="bold" color={Tokens.colors.textInverse}>1</AppText>
              ) : (
                <Ionicons name="checkmark" size={14} color={Tokens.colors.textInverse} />
              )}
            </View>
            <View style={styles.stepLine} />
            <View style={[styles.stepCircle, step === 2 ? styles.stepCircleActive : styles.stepCircleInactive]}>
              <AppText variant="small" weight="bold" color={step === 2 ? Tokens.colors.textInverse : Tokens.colors.textMuted}>2</AppText>
            </View>
          </View>
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>
            Step {step} of 2
          </AppText>
        </View>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {step === 1 ? (
          <View>
            <AppText variant="small" weight="semibold" color={Tokens.colors.brandLight}>
              Base Currency
            </AppText>
            <AppText variant="large" weight="extrabold" style={styles.title}>
              Your base currency is {userCurrency}
            </AppText>
            <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.subtitle}>
              It was set when you created your account and cannot be changed in MVP. All accounts will use {userCurrency}.
            </AppText>
            <View style={[styles.currencyOption, styles.currencyOptionActive, styles.lockedCurrency]}>
              <AppText variant="small" weight="bold" color={Tokens.colors.textInverse}>
                {userCurrency}
              </AppText>
              <AppText variant="tiny" color={Tokens.colors.textInverse}>
                {currencyLabel(userCurrency)}
              </AppText>
              <View style={styles.lockedRow}>
                <Ionicons name="lock-closed" size={12} color={Tokens.colors.textInverse} />
                <AppText variant="tiny" weight="semibold" color={Tokens.colors.textInverse}>
                  {" "}
                  Locked
                </AppText>
              </View>
            </View>
            <Button onPress={() => setStep(2)} label="Continue" style={styles.action} />
          </View>
        ) : (
          <View>
            <AppText variant="small" weight="semibold" color={Tokens.colors.brandLight}>
              First Account
            </AppText>
            <AppText variant="large" weight="extrabold" style={styles.title}>
              Create your first account
            </AppText>
            <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.subtitle}>
              Add your main bank account or cash wallet to begin tracking.

            </AppText>
            <TextField
              label="Account Name"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="e.g. Main Bank, Cash Wallet"
            />
            <View style={styles.typeRow}>
              {ACCOUNT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={"Account type " + type}
                  onPress={() => setAccountType(type)}
                  style={({ pressed }) => [
                    styles.typeOption,
                    accountType === type ? styles.typeOptionActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText variant="tiny" weight="bold" color={accountType === type ? Tokens.colors.textInverse : Tokens.colors.textPrimary}>
                    {type}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <TextField
              label={"Opening Balance (" + userCurrency + ")"}
              value={openingBalanceStr}
              onChangeText={setOpeningBalanceStr}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <Button onPress={handleCreateFirstAccount} label="Complete Setup & Enter Finora" loading={isLoading} style={styles.action} />
            <Button onPress={() => setStep(1)} label="Back" variant="ghost" style={styles.backAction} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    padding: Tokens.spacing.xl,
    paddingBottom: Tokens.spacing.xxl,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.lg,
  },
  steps: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: Tokens.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: Tokens.colors.brand,
  },
  stepCircleDone: {
    backgroundColor: Tokens.colors.success,
  },
  stepCircleInactive: {
    backgroundColor: Tokens.colors.surfaceSubtle,
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: Tokens.colors.borderSubtle,
    marginHorizontal: Tokens.spacing.sm,
  },
  title: {
    marginTop: Tokens.spacing.xs,
  },
  subtitle: {
    marginTop: Tokens.spacing.xs,
    marginBottom: Tokens.spacing.lg,
  },
  currencyOption: {
    width: "48%",
    padding: Tokens.spacing.md,
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
  lockedCurrency: {
    width: "100%",
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Tokens.spacing.xs,
  },
  typeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.md,
  },
  typeOption: {
    flex:  1,
    paddingVertical: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    alignItems: "center",
  },
  typeOptionActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  action: {
    marginTop: Tokens.spacing.md,
  },
  backAction: {
    marginTop: Tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
}));