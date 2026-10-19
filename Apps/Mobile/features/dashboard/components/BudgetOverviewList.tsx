import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { ProgressBar } from "../../../components/ProgressBar";
import { DashboardSummaryResponse } from "../../../types/contract";
import { formatMoney } from "../../../lib/format";

interface BudgetOverviewListProps {
  budgets: DashboardSummaryResponse["budgets"];
  currencyCode?: string;
  onViewAll: () => void;
}

export function BudgetOverviewList({ budgets, currencyCode = "USD", onViewAll }: BudgetOverviewListProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Ionicons name="pie-chart" size={14} color={Tokens.colors.brandLight} />
          <AppText variant="small" weight="bold" color={Tokens.colors.textPrimary}>
            Budget Overview
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.viewAll}>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.brandLight}>
            Manage
          </AppText>
          <Ionicons name="chevron-forward" size={12} color={Tokens.colors.brandLight} />
        </Pressable>
      </View>

      {budgets.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            No monthly budgets created yet.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {budgets.slice(0, 3).map((budget) => (
            <View key={budget.categoryId} style={styles.item}>
              <View style={styles.itemTop}>
                <AppText variant="small" weight="bold">
                  {budget.categoryName}
                </AppText>
                <AppText variant="tiny" style={styles.itemPercent}>
                  {budget.percentage}% of budget
                </AppText>
              </View>
              <ProgressBar progress={budget.percentage} color={budget.isExceeded ? Tokens.colors.warning : Tokens.colors.brand} />
              <View style={styles.itemMeta}>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  Spent: {formatMoney(budget.spentMinor, currencyCode)}
                </AppText>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  Limit: {formatMoney(budget.limitMinor, currencyCode)}
                </AppText>
              </View>
              {budget.isExceeded ? (
                <View style={styles.exceeded}>
                  <Ionicons name="alert-circle" size={10} color={Tokens.colors.warningText} />
                  <AppText variant="tiny" weight="semibold" color={Tokens.colors.warningText}>
                    Budget exceeded
                  </AppText>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  card: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.md,
  },
  headerLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
  },
  empty: {
    paddingVertical: Tokens.spacing.lg,
    alignItems: "center",
    backgroundColor: Tokens.colors.background,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
  },
  list: {
    gap: Tokens.spacing.sm,
  },
  item: {
    padding: Tokens.spacing.md,
    backgroundColor: Tokens.colors.background,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    gap: Tokens.spacing.xs,
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemPercent: {
    color: Tokens.colors.textSecondary,
  },
  itemMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  exceeded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
}));