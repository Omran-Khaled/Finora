import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { api } from "../../lib/api/apiClient";
import { Account } from "../../types/contract";
import { formatMoney } from "../../lib/format";
import { useAuth } from "../../providers/AuthProvider";
import { Telemetry } from "../../lib/telemetry";
import { CreateAccountModal } from "./components/CreateAccountModal";
import { sumMinorUnits } from "../../lib/money";
import { useTheme } from "../../providers/ThemeProvider";

function accountIcon(type: Account["type"]): keyof typeof Ionicons.glyphMap {
  if (type === "CASH") return "cash-outline";
  if (type === "SAVINGS") return "save-outline";
  return "business-outline";
}

export default function AccountsScreen() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await api.getAccounts();
      setAccounts(res.filter((account) => account.status === "ACTIVE"));
      setError(null);
      return;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      Telemetry.track("screen_opened", { screenName: "Accounts" });
      void fetchData().catch(() => undefined);
    }, [fetchData]),
  );

  const totalMinor = sumMinorUnits(accounts.map((account) => account.balanceMinor));
  const currency = accounts[0]?.currencyCode || user?.baseCurrency || "USD";

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/more");
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <View>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            Balances & Wallets
          </AppText>
          <AppText variant="title" weight="extrabold">
            Accounts
          </AppText>
        </View>
        <Button onPress={() => setShowCreateModal(true)} label="Add" style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void fetchData(true).catch(() => undefined);
            }}
            tintColor={Tokens.colors.brand}
          />
        }
      >
        <ErrorBanner
          error={error}
          onRetry={() => {
            void fetchData(true).catch(() => undefined);
          }}
        />

        {isLoading ? (
          <View style={styles.list}>
            <Skeleton height={110} borderRadius={Tokens.radius.lg} />
            <Skeleton height={72} borderRadius={Tokens.radius.md} />
            <Skeleton height={72} borderRadius={Tokens.radius.md} />
          </View>
        ) : (
          <>
            {accounts.length > 0 || !error ? (
              <View style={styles.totalCard}>
                <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
                  Total Balance (Active Accounts)
                </AppText>
                <AppText variant="hero" weight="extrabold">
                  {formatMoney(totalMinor, currency)}
                </AppText>
              </View>
            ) : null}

            {accounts.length === 0 && !error ? (
              <EmptyState
                icon="wallet-outline"
                title="No active accounts"
                description="Create your first account to start tracking income, expenses and transfers."
                actionLabel="Create Account"
                onAction={() => setShowCreateModal(true)}
              />
            ) : accounts.length > 0 ? (
              <View style={styles.list}>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    accessibilityRole="button"
                    accessibilityLabel={"Open account " + account.name}
                    onPress={() => router.push("/accounts/" + account.id)}
                    style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={accountIcon(account.type)} size={16} color={Tokens.colors.brandLight} />
                    </View>
                    <View style={styles.rowText}>
                      <AppText variant="small" weight="bold" numberOfLines={1}>
                        {account.name}
                      </AppText>
                      <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                        {account.type}
                      </AppText>
                    </View>
                    <View style={styles.rowAmount}>
                      <AppText variant="small" weight="bold">
                        {formatMoney(account.balanceMinor, account.currencyCode)}
                      </AppText>
                      <Ionicons name="chevron-forward" size={12} color={Tokens.colors.textMuted} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <CreateAccountModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={async () => {
          await fetchData(true);
        }}
      />
    </Screen>
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
    gap: Tokens.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButton: {
    minHeight: 40,
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.lg,
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  list: {
    gap: Tokens.spacing.sm,
  },
  totalCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
}));