import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Transaction } from "../../../types/contract";
import { formatDate, formatMoney } from "../../../lib/format";

interface RecentTransactionsListProps {
  transactions: Transaction[];
  onViewAll: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export function RecentTransactionsList({ transactions, onViewAll, onSelectTransaction }: RecentTransactionsListProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="small" weight="bold" color={Tokens.colors.textPrimary}>
          Recent Transactions
        </AppText>
        <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.viewAll}>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.brandLight}>
            View All
          </AppText>
          <Ionicons name="chevron-forward" size={12} color={Tokens.colors.brandLight} />
        </Pressable>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            No recorded transactions.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {transactions.slice(0, 4).map((tx) => (
            <Pressable
              key={tx.id}
              accessibilityRole="button"
              accessibilityLabel={"View transaction " + (tx.description || tx.type)}
              onPress={() => onSelectTransaction(tx)}
              style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
            >
              <View style={styles.iconBox}>
                <TxIcon type={tx.type} />
              </View>
              <View style={styles.itemTitles}>
                <View style={styles.titleRow}>
                  <AppText variant="small" weight="bold" numberOfLines={1}>
                    {tx.description || tx.type}
                  </AppText>
                  {tx.status === "VOIDED" ? (
                    <View style={styles.voidBadge}>
                      <AppText variant="tiny" weight="bold" color={Tokens.colors.dangerText}>
                        VOIDED
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  {formatDate(tx.transactionDate)}
                </AppText>
              </View>
              <View style={styles.amountWrap}>
                <AppText variant="small" weight="bold" style={tx.status === "VOIDED" ? styles.voidedAmount : [styles.amount, { color: amountColor(tx.type) }]}>
                  {amountPrefix(tx.type)}
                  {formatMoney(tx.amountMinor, tx.currencyCode)}
                </AppText>
                <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                  {tx.type.toLowerCase()}
                </AppText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function TxIcon({ type }: { type: Transaction["type"] }) {
  if (type === "INCOME") return <Ionicons name="arrow-down" size={14} color={Tokens.colors.successText} />;
  if (type === "TRANSFER") return <Ionicons name="swap-horizontal" size={14} color={Tokens.colors.brandLight} />;
  return <Ionicons name="arrow-up" size={14} color={Tokens.colors.textSecondary} />;
}

function amountPrefix(type: Transaction["type"]): string {
  if (type === "INCOME") return "+";
  if (type === "EXPENSE") return "-";
  return "";
}

function amountColor(type: Transaction["type"]): string {
  if (type === "INCOME") return Tokens.colors.successText;
  if (type === "TRANSFER") return Tokens.colors.brandLight;
  return Tokens.colors.textPrimary;
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Tokens.spacing.sm,
    gap: Tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitles: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  voidBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Tokens.colors.dangerBg,
  },
  amountWrap: {
    alignItems: "flex-end",
  },
  amount: {},
  voidedAmount: {
    color: Tokens.colors.textMuted,
    textDecorationLine: "line-through",
  },
}));