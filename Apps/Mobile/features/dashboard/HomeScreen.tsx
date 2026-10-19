import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { AppText } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api/apiClient";
import { DashboardSummaryResponse, Transaction } from "../../types/contract";
import { monthName } from "../../lib/format";
import { Telemetry } from "../../lib/telemetry";
import { BalanceCard } from "./components/BalanceCard";
import { MonthlySummaryCard } from "./components/MonthlySummaryCard";
import { BudgetOverviewList } from "./components/BudgetOverviewList";
import { GoalsOverviewList } from "./components/GoalsOverviewList";
import { RecentTransactionsList } from "./components/RecentTransactionsList";
import { useAuth } from "../../providers/AuthProvider";

export default function HomeScreen() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const currencyCode = user?.baseCurrency ?? "USD";
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const [sumRes, txRes] = await Promise.all([
        api.getDashboardSummary(),
        api.getTransactions({ limit: 5 }),
      ]);
      setSummary(sumRes);
      setRecentTx(txRes.data);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      Telemetry.track("screen_opened", { screenName: "Home" });
      void fetchData();
    }, [fetchData]),
  );

  const currentMonthName = summary ? monthName(summary.period.month) : "";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            Your money
          </AppText>
          <AppText variant="title" weight="extrabold">
            Financial overview
          </AppText>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh financial summary"
            onPress={() => fetchData(true)}
            disabled={isRefreshing}
            style={({ pressed }) => [styles.refresh, pressed ? styles.pressed : null]}
          >
            <Ionicons name="refresh" size={16} color={Tokens.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={Tokens.colors.brand} />}
      >
        <ErrorBanner error={error} onRetry={() => fetchData(false)} />

        {isLoading && !summary ? (
          <View style={styles.skeletons}>
            <Skeleton height={120} borderRadius={Tokens.radius.lg} />
            <Skeleton height={90} borderRadius={Tokens.radius.lg} />
            <Skeleton height={110} borderRadius={Tokens.radius.lg} />
          </View>
        ) : summary ? (
          <>
            <BalanceCard
              totalMinor={summary.balances.totalMinor}
              currencyCode={currencyCode}
              onViewAccounts={() => router.push("/accounts")}
            />
            <MonthlySummaryCard
              incomeMinor={summary.income.minor}
              expensesMinor={summary.expenses.minor}
              savingsMinor={summary.savings.minor}
              currencyCode={currencyCode}
              monthName={currentMonthName}
            />
            <BudgetOverviewList budgets={summary.budgets} currencyCode={currencyCode} onViewAll={() => router.push("/(tabs)/budgets")} />
            <GoalsOverviewList goals={summary.goals} currencyCode={currencyCode} onViewAll={() => router.push("/savings")} />
            <RecentTransactionsList
              transactions={recentTx}
              onViewAll={() => router.push("/(tabs)/transactions")}
              onSelectTransaction={(tx) => router.push("/transactions/" + tx.id)}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
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
  refresh: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  skeletons: {
    gap: Tokens.spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
}));