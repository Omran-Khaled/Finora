import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { NumericKeypad } from "../../components/NumericKeypad";
import { api } from "../../lib/api/apiClient";
import { Account, Category, TransactionType } from "../../types/contract";
import { todayISO, currencySymbol, CURRENCY_EXPONENTS } from "../../lib/format";
import { parseTransactionAmount } from "../../lib/money";
import { Telemetry } from "../../lib/telemetry";

const TYPE_OPTIONS: ReadonlyArray<{ label: string; value: TransactionType; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: "Expense", value: "EXPENSE", icon: "arrow-up" },
  { label: "Income", value: "INCOME", icon: "arrow-down" },
  { label: "Transfer", value: "TRANSFER", icon: "swap-horizontal" },
];

export default function AddTransactionScreen() {
  useTheme();
  const router = useRouter();
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [amountStr, setAmountStr] = useState("0");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Telemetry.track("screen_opened", { screenName: "AddTransaction" });
    let mounted = true;
    async function loadMeta() {
      try {
        const [accs, cats] = await Promise.all([api.getAccounts(), api.getCategories()]);
        if (!mounted) return;
        const activeAccs = accs.filter((a) => a.status === "ACTIVE");
        setAccounts(activeAccs);
        setCategories(cats.filter((c) => c.status === "ACTIVE"));
        if (activeAccs.length > 0) {
          const first = activeAccs[0];
          if (first) setSelectedAccountId(first.id);
          const second = activeAccs[1];
          if (activeAccs.length > 1 && second) setToAccountId(second.id);
        }
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setIsLoadingMeta(false);
      }
    }
    loadMeta();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredCategories = categories.filter((c) => {
    if (type === "EXPENSE") return c.type === "EXPENSE";
    if (type === "INCOME") return c.type === "INCOME";
    return false;
  });
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId && category.type === type,
  );

  const currency = accounts.find((account) => account.id === selectedAccountId)?.currencyCode
    ?? accounts[0]?.currencyCode
    ?? "USD";

  const handleSave = async () => {
    setError(null);
    const amountMinor = parseTransactionAmount(amountStr, currency);
    if (amountMinor === null || BigInt(amountMinor) <= 0n) {
      setError("Please enter a valid positive amount.");
      return;
    }
    if (!selectedAccountId) {
      setError("Please select an account.");
      return;
    }
    if (type === "EXPENSE" && !selectedCategory) {
      setError("Expense requires a category (BR-003).");
      return;
    }
    if (type === "TRANSFER") {
      if (!toAccountId) {
        setError("Please select a destination account.");
        return;
      }
      if (selectedAccountId === toAccountId) {
        setError("Cannot transfer funds within the same account (BR-005).");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (type === "TRANSFER") {
        await api.createTransfer({
          fromAccountId: selectedAccountId,
          toAccountId,
          amountMinor,
          transactionDate,
        });
      } else {
        await api.createTransaction({
          type,
          accountId: selectedAccountId,
          categoryId: selectedCategory?.id ?? null,
          amountMinor,
          description: description.trim() || null,
          transactionDate,
        });
      }
      Telemetry.track("transaction_created", {
        transactionType: type,
        hasCategory: Boolean(selectedCategory),
      });
      router.back();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTypeChange = (nextType: TransactionType) => {
    if (type === nextType) return;
    setType(nextType);
    setSelectedCategoryId("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
        >
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <AppText variant="title" weight="bold">
          New Transaction
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <View style={styles.typeRow}>
        {TYPE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={"Transaction type " + option.label}
            onPress={() => handleTypeChange(option.value)}
            style={({ pressed }) => [
              styles.typeChip,
              type === option.value ? styles.typeChipActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons
              name={option.icon}
              size={14}
              color={type === option.value ? Tokens.colors.textInverse : Tokens.colors.textSecondary}
            />
            <AppText
              variant="small"
              weight="bold"
              color={type === option.value ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
            >
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <NumericKeypad
          value={amountStr}
          onChange={setAmountStr}
          currencySymbol={currencySymbol(currency)}
          maxDecimals={CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2}
        />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          {type === "TRANSFER" ? "From Account" : "Account"}
        </AppText>
        <View style={styles.chipWrap}>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={"Select account " + account.name}
              onPress={() => setSelectedAccountId(account.id)}
              style={({ pressed }) => [
                styles.chip,
                selectedAccountId === account.id ? styles.chipActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText
                variant="small"
                weight="semibold"
                color={selectedAccountId === account.id ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
              >
                {account.name}
              </AppText>
            </Pressable>
          ))}
        </View>
        {accounts.length === 0 && !isLoadingMeta ? (
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>
            No active accounts available. Create an account first.
          </AppText>
        ) : null}

        {type === "TRANSFER" ? (
          <>
            <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
              To Account
            </AppText>
            <View style={styles.chipWrap}>
              {accounts
                .filter((account) => account.id !== selectedAccountId)
                .map((account) => (
                  <Pressable
                    key={account.id}
                    accessibilityRole="button"
                    accessibilityLabel={"Select destination account " + account.name}
                    onPress={() => setToAccountId(account.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      toAccountId === account.id ? styles.chipActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <AppText
                      variant="small"
                      weight="semibold"
                      color={toAccountId === account.id ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
                    >
                      {account.name}
                    </AppText>
                  </Pressable>
                ))}
            </View>
          </>
        ) : null}

        {type !== "TRANSFER" ? (
          <>
            <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
              Category {type === "EXPENSE" ? "(required)" : "(optional)"}
            </AppText>
            <View style={styles.chipWrap}>
              {filteredCategories.length === 0 ? (
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  No {type.toLowerCase()} categories available.
                </AppText>
              ) : (
                filteredCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityLabel={"Select category " + category.name}
                    onPress={() => setSelectedCategoryId(category.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      selectedCategoryId === category.id ? styles.chipActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <AppText
                      variant="small"
                      weight="semibold"
                      color={selectedCategoryId === category.id ? Tokens.colors.textInverse : Tokens.colors.textPrimary}
                    >
                      {category.name}
                    </AppText>
                  </Pressable>
                ))
              )}
            </View>
          </>
        ) : null}

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Date (YYYY-MM-DD)
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={transactionDate}
            onChangeText={setTransactionDate}
            placeholder="2026-01-01"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Note (optional)
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Weekly groceries"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
          />
        </View>

        <Button
          onPress={handleSave}
          label={type === "TRANSFER" ? "Send Transfer" : "Save Transaction"}
          loading={isSubmitting}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: Tokens.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.xs,
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
  },
  typeChipActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  content: {
    padding: Tokens.spacing.lg,
    paddingBottom: Tokens.spacing.xxl,
  },
  label: {
    marginBottom: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
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
    backgroundColor: Tokens.colors.surface,
  },
  chipActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  inputWrap: {
    backgroundColor: Tokens.colors.surface,
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
  submit: {
    marginTop: Tokens.spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
}));

// __STYLES__