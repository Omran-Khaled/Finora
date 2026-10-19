import { View, ScrollView, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ProgressBar } from "../../components/ProgressBar";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { api } from "../../lib/api/apiClient";
import { Budget, Category, DashboardSummaryResponse } from "../../types/contract";
import { formatMoney, minorPercentage, monthName } from "../../lib/format";
import { CreateBudgetModal } from "./components/CreateBudgetModal";

export default function BudgetsScreen() {
  useTheme();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const [budgetRes, categoryRes, summaryRes] = await Promise.all([
        api.getBudgets(),
        api.getCategories(),
        api.getDashboardSummary(),
      ]);
      setBudgets(budgetRes);
      setCategories(categoryRes);
      setSummary(summaryRes);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  const handleDelete = async () => {
    if (!budgetToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteBudget(budgetToDelete.id);
      setBudgetToDelete(null);
      await fetchData(true);
    } catch (err) {
      setError(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const categoryName = (categoryId: string): string =>
    categories.find((category) => category.id === categoryId)?.name || "Unknown Category";

  // Spent amounts come from the Backend authority (dashboard summary) — never computed client-side.
  const spentByCategory = new Map<string, string>();
  summary?.budgets.forEach((entry) => spentByCategory.set(entry.categoryId, entry.spentMinor));

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            Monthly Spending Limits
          </AppText>
          <AppText variant="title" weight="extrabold">
            Budgets
          </AppText>
        </View>
        <Button onPress={() => setShowCreateModal(true)} label="New Budget" style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={Tokens.colors.brand} />}
      >
        <ErrorBanner error={error} onRetry={() => fetchData(false)} />

        {isLoading ? (
          <View style={styles.list}>
            <Skeleton height={96} borderRadius={Tokens.radius.lg} />
            <Skeleton height={96} borderRadius={Tokens.radius.lg} />
          </View>
        ) : budgets.length === 0 ? (
          <EmptyState
            icon="pie-chart-outline"
            title="No budgets yet"
            description="Set a monthly spending limit per category to keep your expenses on track."
            actionLabel="Create First Budget"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <View style={styles.list}>
            {budgets.map((budget) => {
              const spent = spentByCategory.get(budget.categoryId) ?? "0";
              const spentMinor = BigInt(spent);
              const limitMinor = BigInt(budget.limitMinor);
              const percentage = minorPercentage(spentMinor, limitMinor);
              const isExceeded = spentMinor > limitMinor;
              return (
                <View key={budget.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardTitle}>
                      <Ionicons name="pie-chart" size={14} color={isExceeded ? Tokens.colors.warningText : Tokens.colors.brandLight} />
                      <AppText variant="small" weight="bold" numberOfLines={1}>
                        {categoryName(budget.categoryId)}
                      </AppText>
                    </View>
                    <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                      {monthName(budget.month)} {budget.year}
                    </AppText>
                  </View>
                  <View style={styles.amountRow}>
                    <AppText variant="small" weight="bold" color={isExceeded ? Tokens.colors.warningText : Tokens.colors.textPrimary}>
                      {formatMoney(spent)}
                    </AppText>
                    <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                      {" "}of {formatMoney(budget.limitMinor)}
                    </AppText>
                  </View>
                  <View style={styles.progress}>
                    <ProgressBar
                      progress={percentage}
                      color={isExceeded ? Tokens.colors.warning : Tokens.colors.brand}
                    />
                  </View>
                  {isExceeded ? (
                    <AppText variant="tiny" weight="bold" color={Tokens.colors.warningText}>
                      Limit exceeded — review your spending in this category.
                    </AppText>
                  ) : (
                    <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                      {formatMoney((limitMinor - spentMinor).toString())} remaining
                    </AppText>
                  )}
                  <Button
                    onPress={() => setBudgetToDelete(budget)}
                    label="Remove Budget"
                    variant="ghost"
                    style={styles.deleteButton}
                    accessibilityLabel={"Remove budget for " + categoryName(budget.categoryId)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CreateBudgetModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchData(true)}
        categories={categories}
      />

      <ConfirmationDialog
        isOpen={budgetToDelete !== null}
        title="Remove this budget?"
        message="Removing the budget stops limit tracking for this category and month. Your transactions and balances are never affected."
        confirmLabel="Remove Budget"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setBudgetToDelete(null)}
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
  },
  headerButton: {
    minHeight: 40,
    paddingVertical: Tokens.spacing.sm,
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  list: {
    gap: Tokens.spacing.md,
  },
  card: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.sm,
  },
  cardTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Tokens.spacing.xs,
  },
  progress: {
    marginBottom: Tokens.spacing.xs,
  },
  deleteButton: {
    marginTop: Tokens.spacing.xs,
    alignSelf: "flex-end",
    minHeight: 32,
    paddingVertical: Tokens.spacing.xs,
  },
}));