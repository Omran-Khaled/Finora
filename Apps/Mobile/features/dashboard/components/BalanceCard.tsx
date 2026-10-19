import { View, Pressable } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { formatMoney } from "../../../lib/format";

interface BalanceCardProps {
  totalMinor: string;
  currencyCode?: string;
  onViewAccounts: () => void;
}

export function BalanceCard({ totalMinor, currencyCode = "USD", onViewAccounts }: BalanceCardProps) {
  const [isMasked, setIsMasked] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <Ionicons name="shield-checkmark" size={14} color={Tokens.colors.brandLight} />
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            Total Net Balance
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMasked ? "Show balance" : "Hide balance"}
          onPress={() => setIsMasked(!isMasked)}
          style={styles.eye}
        >
          <Ionicons name={isMasked ? "eye-off-outline" : "eye-outline"} size={14} color={Tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <AppText variant="hero" weight="extrabold" style={styles.balance}>
        {isMasked ? "••••••••" : formatMoney(totalMinor, currencyCode)}
      </AppText>

      <View style={styles.bottomRow}>
        <AppText variant="tiny" color={Tokens.colors.textSecondary}>
          Across your active accounts
        </AppText>
        <Pressable accessibilityRole="button" onPress={onViewAccounts} style={styles.viewAccounts}>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.brandLight}>
            View Accounts
          </AppText>
          <Ionicons name="chevron-forward" size={12} color={Tokens.colors.brandLight} />
        </Pressable>
      </View>
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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  eye: {
    padding: Tokens.spacing.xs,
  },
  balance: {
    marginVertical: Tokens.spacing.md,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.borderSubtle,
    paddingTop: Tokens.spacing.md,
  },
  viewAccounts: {
    flexDirection: "row",
    alignItems: "center",
  },
}));