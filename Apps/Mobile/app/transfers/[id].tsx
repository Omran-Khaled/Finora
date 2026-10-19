import { View, ScrollView, Pressable } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { api } from "../../lib/api/apiClient";
import { Account, Transaction } from "../../types/contract";
import { formatDate, formatMoney } from "../../lib/format";
import { Telemetry } from "../../lib/telemetry";
import { useTheme } from "../../providers/ThemeProvider";

/**
 * TRANSFER DETAIL (BR-004 context).
 * A transfer is an atomic pair of TRANSFER transactions joined by a Transfer
 * record. The route receives one leg's transaction id; the counterpart leg is
 * resolved from the authoritative transaction list (same amount, same date,
 * opposite account) so both directions of the movement are displayed.
 */
export default function TransferDetailRoute() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [counterpart, setCounterpart] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [txRes, accountRes] = await Promise.all([api.getTransactions({ limit: 200, type: "TRANSFER" }), api.getAccounts()]);
      setAccounts(accountRes);
      const found = txRes.data.find((tx) => tx.id === id) || null;
      setTransaction(found);
      if (found) {
        const sibling =
          txRes.data.find(
            (tx) =>
              tx.id !== found.id &&
              tx.type === "TRANSFER" &&
              tx.amountMinor === found.amountMinor &&
              tx.transactionDate === found.transactionDate &&
              tx.accountId !== found.accountId,
          ) || null;
        setCounterpart(sibling);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    Telemetry.track("screen_opened", { screenName: "TransferDetail" });
    void load();
  }, [load]));

  const accountName = (accountId: string): string =>
    accounts.find((account) => account.id === accountId)?.name || "Unknown Account";

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <AppText variant="title" weight="bold">
          Transfer Details
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ErrorBanner error={error} onRetry={load} onDismiss={() => setError(null)} />

        {isLoading ? (
          <View style={styles.list}>
            <Skeleton height={120} borderRadius={Tokens.radius.lg} />
            <Skeleton height={140} borderRadius={Tokens.radius.lg} />
          </View>
        ) : !transaction ? (
          <EmptyState
            icon="swap-horizontal-outline"
            title="Transfer not found"
            description="This transfer may have been voided or belongs to another session."
            actionLabel="Go Back"
            onAction={() => router.back()}
          />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="swap-horizontal" size={20} color={Tokens.colors.brandLight} />
              </View>
              <AppText variant="hero" weight="extrabold" color={Tokens.colors.brandLight}>
                {formatMoney(transaction.amountMinor, transaction.currencyCode)}
              </AppText>
              <AppText variant="small" color={Tokens.colors.textSecondary}>
                {formatDate(transaction.transactionDate)}
              </AppText>
              <View style={styles.badgeRow}>
                <Badge label="TRANSFER" color={Tokens.colors.brandLight} backgroundColor={Tokens.colors.brandMuted} />
                <Badge
                  label={transaction.status}
                  color={transaction.status === "VOIDED" ? Tokens.colors.dangerText : Tokens.colors.successText}
                  backgroundColor={transaction.status === "VOIDED" ? Tokens.colors.dangerBg : Tokens.colors.successBg}
                />
              </View>
            </View>

            <View style={styles.details}>
              <Row label="From" value={accountName(transaction.accountId)} />
              <Row label="To" value={counterpart ? accountName(counterpart.accountId) : "Counterpart unavailable"} />
              <Row label="Amount" value={formatMoney(transaction.amountMinor, transaction.currencyCode)} />
              <Row label="Date" value={formatDate(transaction.transactionDate)} />
              <Row label="Status" value={transaction.status} />
            </View>

            {transaction.status === "VOIDED" ? (
              <AppText variant="tiny" color={Tokens.colors.dangerText} style={styles.voidNote}>
                This transfer was voided — both legs were reversed atomically and balances restored.
              </AppText>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="small" color={Tokens.colors.textSecondary}>
        {label}
      </AppText>
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
  list: {
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
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  voidNote: {
    textAlign: "center",
  },
}));