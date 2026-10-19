import { View, ScrollView, Pressable, TextInput } from "react-native";
import { useState } from "react";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Button } from "../../../components/Button";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ModalSheet } from "../../../components/ModalSheet";
import { api } from "../../../lib/api/apiClient";
import { useAuth } from "../../../providers/AuthProvider";
import { AccountType } from "../../../types/contract";
import { parseAmountToMinor } from "../../../lib/format";

const ACCOUNT_TYPES: readonly AccountType[] = ["BANK", "CASH", "SAVINGS"];

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CreateAccountModal({ isOpen, onClose, onSuccess }: CreateAccountModalProps) {
  const { user } = useAuth();
  const baseCurrency = user?.baseCurrency || "USD";
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("BANK");
  const [openingBalanceStr, setOpeningBalanceStr] = useState("0.00");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const handleSubmit = async () => {
    if (accountCreated) {
      setError(null);
      setIsLoading(true);
      try {
        await onSuccess();
        setAccountCreated(false);
        onClose();
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!name.trim()) {
      setError("Please provide an account name.");
      return;
    }
    const openingBalanceMinor = parseAmountToMinor(openingBalanceStr, baseCurrency, { allowZero: true });
    if (openingBalanceMinor === null) {
      setError("Opening balance must be a non-negative amount.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.createAccount({
        name: name.trim(),
        type,
        currencyCode: baseCurrency,
        openingBalanceMinor,
      });
      setName("");
      setOpeningBalanceStr("0.00");
      setAccountCreated(true);
      await onSuccess();
      setAccountCreated(false);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModalSheet isOpen={isOpen} onClose={onClose} title="Create Account">
      <ScrollView>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Account Name
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Daily Checking, Vault Savings"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
          />
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Account Type
        </AppText>
        <View style={styles.typeRow}>
          {ACCOUNT_TYPES.map((accountType) => (
            <Pressable
              key={accountType}
              accessibilityRole="button"
              accessibilityLabel={"Account type " + accountType}
              onPress={() => setType(accountType)}
              style={({ pressed }) => [
                styles.typeOption,
                type === accountType ? styles.typeOptionActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText variant="small" weight="bold" color={type === accountType ? Tokens.colors.textInverse : Tokens.colors.textPrimary}>
                {accountType}
              </AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Opening Balance ({baseCurrency})
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={openingBalanceStr}
            onChangeText={setOpeningBalanceStr}
            placeholder="0.00"
            placeholderTextColor={Tokens.colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>

        <Button
          onPress={handleSubmit}
          label={accountCreated ? "Retry Accounts Refresh" : "Create Account"}
          loading={isLoading}
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
  typeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  typeOption: {
    flex: 1,
    paddingVertical: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.background,
    alignItems: "center",
  },
  typeOptionActive: {
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