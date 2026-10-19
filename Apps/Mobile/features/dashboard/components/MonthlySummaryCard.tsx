import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { formatMoney } from "../../../lib/format";

interface MonthlySummaryCardProps {
  incomeMinor: string;
  expensesMinor: string;
  savingsMinor: string;
  currencyCode?: string;
  monthName: string;
}

export function MonthlySummaryCard({
  incomeMinor,
  expensesMinor,
  savingsMinor,
  currencyCode = "USD",
  monthName,
}: MonthlySummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="small" weight="bold" color={Tokens.colors.textPrimary}>
          Monthly Summary
        </AppText>
        <View style={styles.monthBadge}>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            {monthName}
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        <SummaryCell
          icon="arrow-down"
          iconColor={Tokens.colors.successText}
          label="Income"
          value={formatMoney(incomeMinor, currencyCode)}
        />
        <SummaryCell
          icon="arrow-up"
          iconColor={Tokens.colors.textSecondary}
          label="Expenses"
          value={formatMoney(expensesMinor, currencyCode)}
        />
        <SummaryCell
          icon="save-outline"
          iconColor={Tokens.colors.brandLight}
          label="Savings"
          value={formatMoney(savingsMinor, currencyCode)}
        />
      </View>

      <CashFlowVisual incomeMinor={incomeMinor} expensesMinor={expensesMinor} />
    </View>
  );
}

function CashFlowVisual({ incomeMinor, expensesMinor }: { incomeMinor: string; expensesMinor: string }) {
  const income = BigInt(incomeMinor);
  const expenses = BigInt(expensesMinor);
  const max = income > expenses ? income : expenses;
  const incomeWidth = max === 0n ? 0 : Number((income * 100n) / max);
  const expenseWidth = max === 0n ? 0 : Number((expenses * 100n) / max);

  return (
    <View style={styles.flow} accessibilityLabel="Monthly income versus expenses">
      <View style={styles.flowHeader}>
        <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
          Cash flow
        </AppText>
        <AppText variant="tiny" color={Tokens.colors.textMuted}>
          Income vs. expenses
        </AppText>
      </View>
      <View style={styles.flowRow}>
        <View style={styles.flowLabel}>
          <View style={[styles.dot, { backgroundColor: Tokens.colors.successText }]} />
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>Income</AppText>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, styles.incomeBar, { width: `${incomeWidth}%` }]} />
        </View>
      </View>
      <View style={styles.flowRow}>
        <View style={styles.flowLabel}>
          <View style={[styles.dot, { backgroundColor: Tokens.colors.textSecondary }]} />
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>Expenses</AppText>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, styles.expenseBar, { width: `${expenseWidth}%` }]} />
        </View>
      </View>
    </View>
  );
}

function SummaryCell({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.cell}>
      <View style={styles.cellLabel}>
        <Ionicons name={icon} size={13} color={iconColor} />
        <AppText variant="tiny" weight="semibold" color={iconColor}>
          {label}
        </AppText>
      </View>
      <AppText variant="small" weight="bold" style={styles.cellValue}>
        {value}
      </AppText>
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
  monthBadge: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    backgroundColor: Tokens.colors.surfaceSubtle,
    borderRadius: Tokens.radius.xs,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  grid: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  cell: {
    flex: 1,
    padding: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.background,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
  },
  cellLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Tokens.spacing.xs,
  },
  cellValue: {
    color: Tokens.colors.textPrimary,
  },

  flow: {
    marginTop: Tokens.spacing.md,
    paddingTop: Tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.borderSubtle,
    gap: Tokens.spacing.xs,
  },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.xs,
  },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  flowLabel: {
    width: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  track: {
    flex: 1,
    height: 7,
    overflow: "hidden",
    backgroundColor: Tokens.colors.surfaceSubtle,
    borderRadius: Tokens.radius.full,
  },
  bar: {
    height: "100%",
    borderRadius: Tokens.radius.full,
  },
  incomeBar: {
    backgroundColor: Tokens.colors.successText,
  },
  expenseBar: {
    backgroundColor: Tokens.colors.textSecondary,
  },
}));