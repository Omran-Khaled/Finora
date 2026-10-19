import { View, ScrollView, Pressable } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { api } from "../../lib/api/apiClient";
import { Account, Category, Transaction } from "../../types/contract";
import { formatDate, formatMoney } from "../../lib/format";
import { Telemetry } from "../../lib/telemetry";
import { useTheme } from "../../providers/ThemeProvider";

export default function TransactionDetailRoute() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoiding, setIsVoiding] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/transactions");
  };

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [txRes, accounts, categories] = await Promise.all([
        api.getTransactions({ limit: 200 }),
        api.getAccounts(),
        api.getCategories(),
      ]);
      const found = txRes.data.find((tx) => tx.id === id) || null;
      setTransaction(found);
      if (found) {
        setAccount(accounts.find((a) => a.id === found.accountId) || null);
        setCategory(categories.find((c) => c.id === found.categoryId) || null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    Telemetry.track("screen_opened", { screenName: "TransactionDetail" });
    void load();
  }, [load]));

  const handleVoid = async () => {
    if (!transaction) return;
    setIsVoiding(true);
    setError(null);
    try {
      const voided = await api.voidTransaction(transaction.id);
      setTransaction(voided);
      setShowVoidConfirm(false);
    } catch (err) {
      setError(err);
    } finally {
      setIsVoiding(false);
    }
  };

  const amountColor =
    transaction?.type === "INCOME"
      ? Tokens.colors.successText
      : transaction?.type === "TRANSFER"
        ? Tokens.colors.brandLight
        : Tokens.colors.textPrimary;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <AppText variant="title" weight="bold">
          Transaction
        </AppText>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ErrorBanner error={error} onRetry={load} onDismiss={() => setError(null)} />

        {isLoading ? (
          <View style={styles.skeletons}>
            <Skeleton height={110} borderRadius={Tokens.radius.lg} />
            <Skeleton height={160} borderRadius={Tokens.radius.lg} />
          </View>
        ) : !transaction ? (
          <EmptyState
            icon="receipt-outline"
            title="Transaction not found"
            description="This transaction may have been removed or belongs to another session."
            actionLabel="Go Back"
            onAction={goBack}
          />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name={
                    transaction.type === "INCOME"
                      ? "arrow-down"
                      : transaction.type === "TRANSFER"
                        ? "swap-horizontal"
                        : "arrow-up"
                  }
                  size={20}
                  color={amountColor}
                />
              </View>
              <AppText variant="hero" weight="extrabold" style={{ color: amountColor }}>
                {transaction.type === "INCOME" ? "+" : transaction.type === "EXPENSE" ? "-" : ""}
                {formatMoney(transaction.amountMinor, transaction.currencyCode)}
              </AppText>
              <AppText variant="small" color={Tokens.colors.textSecondary}>
                {transaction.description || transaction.type}
              </AppText>
              <View style={styles.badgeRow}>
                <Badge label={transaction.type} color={Tokens.colors.brandLight} backgroundColor={Tokens.colors.brandMuted} />
                <Badge
                  label={transaction.status}
                  color={transaction.status === "VOIDED" ? Tokens.colors.dangerText : Tokens.colors.successText}
                  backgroundColor={transaction.status === "VOIDED" ? Tokens.colors.dangerBg : Tokens.colors.successBg}
                />
              </View>
            </View>

            <View style={styles.details}>
              <DetailRow icon="wallet-outline" label="Account" value={account?.name || "Unknown account"} />
              {/* BR-004: transfers NEVER carry a category — row hidden, never rendered as "None" */}
              {transaction.categoryId ? (
                <DetailRow icon="pricetag-outline" label="Category" value={category?.name || "Unknown category"} />
              ) : null}
              <DetailRow icon="calendar-outline" label="Date" value={formatDate(transaction.transactionDate)} />
              <DetailRow icon="information-circle-outline" label="Status" value={transaction.status} />
            </View>

            {transaction.type === "TRANSFER" ? (
              <Button
                onPress={() => router.push("/transfers/" + transaction.id)}
                label="View Transfer Details"
                variant="secondary"
                style={styles.action}
              />
            ) : null}

            {transaction.status === "ACTIVE" ? (
              <Button
                onPress={() => setShowVoidConfirm(true)}
                label="Void Transaction"
                variant="destructive"
                style={styles.action}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmationDialog
        isOpen={showVoidConfirm}
        title="Void this transaction?"
        message="Voiding removes the transaction from all balances. Voided transfers are reversed on both accounts atomically. This cannot be undone."
        confirmLabel="Void Transaction"
        isDestructive
        isLoading={isVoiding}
        onConfirm={handleVoid}
        onCancel={() => setShowVoidConfirm(false)}
      />
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLabel}>
        <Ionicons name={icon} size={13} color={Tokens.colors.textSecondary} />
        <AppText variant="small" color={Tokens.colors.textSecondary}>
          {label}
        </AppText>
      </View>
      <AppText variant="small" weight="semibold" style={styles.detailValue} numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
  },
  headerSide: {
    width: 32,
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
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  skeletons: {
    gap: Tokens.spacing.md,
  },
  hero: {
    alignItems: "center",
    padding: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Tokens.spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
  details: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Tokens.spacing.sm,
    gap: Tokens.spacing.md,
  },
  detailLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  action: {
    marginTop: Tokens.spacing.xs,
  },
}));