import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";

interface NumericKeypadProps {
  value: string; // e.g. "120.50" or "0"
  onChange: (val: string) => void;
  currencySymbol?: string;
  maxDecimals?: number;
}

/**
 * Tactile numeric keypad (Section 25).
 * - Safe numeric input: single decimal point, currency-aware decimal precision, bounded length.
 * - NEVER becomes a financial authority — output is a decimal string the client
 *   parses to integer minor units via parseAmountToMinor.
 */
export function NumericKeypad({ value, onChange, currencySymbol = "$", maxDecimals = 2 }: NumericKeypadProps) {
  const handleDigit = (digit: string) => {
    if (value === "0" && digit !== ".") {
      onChange(digit);
      return;
    }
    if (digit === ".") {
      if (maxDecimals === 0 || value.includes(".")) return;
      onChange((value || "0") + ".");
      return;
    }
    const parts = value.split(".");
    if (parts[1] && parts[1].length >= maxDecimals) return;
    if (value.length > 9) return; // bound the magnitude
    onChange((value || "") + digit);
  };

  const handleBackspace = () => {
    if (!value || value.length <= 1) {
      onChange("0");
      return;
    }
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange("0");
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ...(maxDecimals > 0 ? ["."] : []), "0"];

  return (
    <View style={styles.container}>
      {/* Hero amount display */}
      <View style={styles.display}>
        <AppText variant="tiny" weight="semibold" color={Tokens.colors.brandLight}>
          Amount
        </AppText>
        <View style={styles.amountRow}>
          <AppText variant="large" color={Tokens.colors.textSecondary}>
            {currencySymbol}
          </AppText>
          <AppText variant="hero" weight="extrabold" style={styles.amount}>
            {value || "0"}
          </AppText>
        </View>
      </View>

      {/* Key grid */}
      <View style={styles.grid}>
        {keys.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={"Digit " + key}
            onPress={() => handleDigit(key)}
            style={({ pressed }) => [styles.key, pressed ? styles.keyPressed : null]}
          >
            <AppText variant="large" weight="bold">
              {key}
            </AppText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete last digit"
          onPress={handleBackspace}
          onLongPress={handleClear}
          style={({ pressed }) => [styles.key, styles.backspace, pressed ? styles.keyPressed : null]}
        >
          <Ionicons name="backspace-outline" size={20} color={Tokens.colors.dangerText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    alignItems: "center",
    paddingVertical: Tokens.spacing.sm,
  },
  display: {
    width: "100%",
    paddingVertical: Tokens.spacing.md,
    paddingHorizontal: Tokens.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    marginBottom: Tokens.spacing.md,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  amount: {
    marginLeft: Tokens.spacing.xs,
  },
  grid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  key: {
    width: "31%",
    height: 52,
    margin: "1%",
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: {
    backgroundColor: Tokens.colors.brand,
  },
  backspace: {
    backgroundColor: Tokens.colors.dangerBg,
  },
}));