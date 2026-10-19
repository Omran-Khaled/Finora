import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { ProgressBar } from "../../../components/ProgressBar";
import { DashboardSummaryResponse } from "../../../types/contract";
import { formatMoney } from "../../../lib/format";

interface GoalsOverviewListProps {
  goals: DashboardSummaryResponse["goals"];
  currencyCode?: string;
  onViewAll: () => void;
}

export function GoalsOverviewList({ goals, currencyCode = "USD", onViewAll }: GoalsOverviewListProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Ionicons name="save-outline" size={14} color={Tokens.colors.successText} />
          <AppText variant="small" weight="bold" color={Tokens.colors.textPrimary}>
            Savings Goals
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.viewAll}>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.brandLight}>
            All Goals
          </AppText>
          <Ionicons name="chevron-forward" size={12} color={Tokens.colors.brandLight} />
        </Pressable>
      </View>

      {goals.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            No savings goals linked.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {goals.slice(0, 2).map((goal) => (
            <View key={goal.id} style={styles.item}>
              <View style={styles.itemTop}>
                <View style={styles.itemTitles}>
                  <AppText variant="small" weight="bold" numberOfLines={1}>
                    {goal.name}
                  </AppText>
                  <AppText variant="tiny" color={Tokens.colors.textSecondary} numberOfLines={1}>
                    1:1 Linked: {goal.accountName}
                  </AppText>
                </View>
                <AppText variant="small" weight="bold" color={Tokens.colors.successText}>
                  {goal.progressPercentage}%
                </AppText>
              </View>
              <ProgressBar progress={goal.progressPercentage} color={Tokens.colors.success} />
              <View style={styles.itemMeta}>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  Current: {formatMoney(goal.currentAmountMinor, currencyCode)}
                </AppText>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  Target: {formatMoney(goal.targetAmountMinor, currencyCode)}
                </AppText>
              </View>
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
    gap: Tokens.spacing.sm,
  },
  itemTitles: {
    flex: 1,
  },
  itemMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
}));