import { View, ScrollView, Pressable, TextInput } from "react-native";
import { useEffect, useState } from "react";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Button } from "../../../components/Button";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ModalSheet } from "../../../components/ModalSheet";
import { api } from "../../../lib/api/apiClient";
import { Account } from "../../../types/contract";
import { isValidISODate, parseAmountToMinor } from "../../../lib/format";
import { Telemetry } from "../../../lib/telemetry";

interface CreateSavingsGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
}

export function CreateSavingsGoalModal({ isOpen, onClose, onSuccess, accounts }: CreateSavingsGoalModalProps) {
  const [name, setName] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Contract rule: a savings goal links 1:1 to a SAVINGS-type account.
  const savingsAccounts = accounts.filter((account) => account.type === "SAVINGS" && account.status === "ACTIVE");

  useEffect(() => {
    if (isOpen && !accountId && savingsAccounts.length > 0) {
      const first = savingsAccounts[0];
      if (first) setAccountId(first.id);
    }
  }, [isOpen, accountId, savingsAccounts]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please provide a goal name.");
      return;
    }
    const targetMinor = parseAmountToMinor(targetStr);
    if (targetMinor === null || BigInt(targetMinor) <= 0n) {
      setError("Target amount must be a positive number.");
      return;
    }
    if (targetDate.trim() && !isValidISODate(targetDate.trim())) {
      setError("Target date must be a valid date in YYYY-MM-DD format.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.createSavingsGoal({
        accountId,
        name: name.trim(),
        targetAmountMinor: targetMinor,
        targetDate: targetDate.trim() || null,
      });
      Telemetry.track("goal_created", {});
      setName("");
      setTargetStr("");
      setTargetDate("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModalSheet isOpen={isOpen} onClose={onClose} title="Create Savings Goal">
      <ScrollView keyboardShouldPersistTaps="handled">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Goal Name
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Emergency Fund, New Car"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
          />
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Linked Savings Account
        </AppText>
        {savingsAccounts.length === 0 ? (
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>
            No SAVINGS-type accounts available. Create one from the Accounts screen first.
          </AppText>
        ) : (
          <View style={styles.chipWrap}>
            {savingsAccounts.map((account) => (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityLabel={"Select account " + account.name}
                onPress={() => setAccountId(account.id)}
                style={({ pressed }) => [
                  styles.chip,
                  accountId === account.id ? styles.chipActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText
                  variant="small"
                  weight="semibold"
                  color={accountId === account.id ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
                >
                  {account.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Target Amount
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={targetStr}
            onChangeText={setTargetStr}
            placeholder="0.00"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Target Date (optional, YYYY-MM-DD)
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="2027-01-01"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <Button
          onPress={handleSubmit}
          label="Create Goal"
          loading={isLoading}
          disabled={savingsAccounts.length === 0}
          style={styles.submit}
        />
      </ScrollView>
    </ModalSheet>
  );
}

const styles = Tokens.createStyles(() => ({
  label: {
    marginBottom: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
  inputWrap: {
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
  },
  input: {
    color: Tokens.colors.textPrimary,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  chip: {
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.background,
  },
  chipActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  submit: {
    marginTop: Tokens.spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
}));