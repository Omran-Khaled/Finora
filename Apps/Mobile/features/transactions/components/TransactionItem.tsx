import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Transaction } from "../../../types/contract";
import { formatDate, formatMoney } from "../../../lib/format";

interface TransactionItemProps {
  transaction: Transaction;
  onPress: () => void;
}

export function TransactionItem({ transaction, onPress }: TransactionItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"View transaction " + (transaction.description || transaction.type)}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
    >
      <View style={styles.iconBox}>
        <TxIcon type={transaction.type} />
      </View>
      <View style={styles.titles}>
        <View style={styles.titleRow}>
          <AppText variant="small" weight="bold" numberOfLines={1}>
            {transaction.description || transaction.type}
          </AppText>
          {transaction.status === "VOIDED" ? (
            <View style={styles.voidBadge}>
              <AppText variant="tiny" weight="bold" color={Tokens.colors.dangerText}>
                VOIDED
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="tiny" color={Tokens.colors.textSecondary}>
          {formatDate(transaction.transactionDate)}
        </AppText>
      </View>
      <View style={styles.amountWrap}>
        <AppText
          variant="small"
          weight="bold"
          style={transaction.status === "VOIDED" ? styles.voidedAmount : { color: amountColor(transaction.type) }}
        >
          {amountPrefix(transaction.type)}
          {formatMoney(transaction.amountMinor, transaction.currencyCode)}
        </AppText>
        <AppText variant="tiny" color={Tokens.colors.textSecondary}>
          {transaction.type.toLowerCase()}
        </AppText>
      </View>
    </Pressable>
  );
}

function TxIcon({ type }: { type: Transaction["type"] }) {
  if (type === "INCOME") return <Ionicons name="arrow-down" size={16} color={Tokens.colors.successText} />;
  if (type === "TRANSFER") return <Ionicons name="swap-horizontal" size={16} color={Tokens.colors.brandLight} />;
  return <Ionicons name="arrow-up" size={16} color={Tokens.colors.textSecondary} />;
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
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: Tokens.spacing.md,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    gap: Tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: {
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
  voidedAmount: {
    color: Tokens.colors.textMuted,
    textDecorationLine: "line-through",
  },
}));