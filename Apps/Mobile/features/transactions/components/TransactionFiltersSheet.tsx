import { View, Pressable, ScrollView, TextInput } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { ModalSheet } from "../../../components/ModalSheet";
import { Button } from "../../../components/Button";
import { TransactionFilterParams, TransactionType } from "../../../types/contract";

interface TransactionFiltersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: TransactionFilterParams;
  onApplyFilters: (filters: TransactionFilterParams) => void;
}

const TYPE_OPTIONS: readonly { label: string; value: TransactionType | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Expense", value: "EXPENSE" },
  { label: "Income", value: "INCOME" },
  { label: "Transfer", value: "TRANSFER" },
];

export function TransactionFiltersSheet({ isOpen, onClose, currentFilters, onApplyFilters }: TransactionFiltersSheetProps) {
  const [type, setType] = useState<TransactionType | undefined>(currentFilters.type);
  const [from, setFrom] = useState<string>(currentFilters.from || "");
  const [to, setTo] = useState<string>(currentFilters.to || "");

  const handleReset = () => {
    setType(undefined);
    setFrom("");
    setTo("");
    onApplyFilters({});
    onClose();
  };

  const handleApply = () => {
    const filters: TransactionFilterParams = {};
    if (type) filters.type = type;
    if (from) filters.from = from;
    if (to) filters.to = to;
    onApplyFilters(filters);
    onClose();
  };

  return (
    <ModalSheet isOpen={isOpen} onClose={onClose} title="Filter Transactions">
      <ScrollView>
        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Transaction Type
        </AppText>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityLabel={"Filter by " + option.label}
              onPress={() => setType(option.value)}
              style={({ pressed }) => [
                styles.typeOption,
                type === option.value ? styles.typeOptionActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText variant="small" weight="semibold" color={type === option.value ? Tokens.colors.textInverse : Tokens.colors.textPrimary}>
                {option.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          From Date (YYYY-MM-DD)
        </AppText>
        <DateInput value={from} onChangeText={setFrom} placeholder="2026-01-01" />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          To Date (YYYY-MM-DD)
        </AppText>
        <DateInput value={to} onChangeText={setTo} placeholder="2026-12-31" />

        <View style={styles.actions}>
          <Button onPress={handleReset} label="Reset" variant="secondary" style={styles.resetButton} />
          <Button onPress={handleApply} label="Apply Filters" variant="primary" style={styles.applyButton} />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

function DateInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={styles.dateInputWrap}>
      <Ionicons name="calendar-outline" size={14} color={Tokens.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Tokens.colors.textMuted}
        style={styles.dateInput}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  label: {
    marginBottom: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
  typeRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  typeOption: {
    flex: 1,
    paddingVertical: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surfaceSubtle,
    alignItems: "center",
  },
  typeOptionActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  dateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
  },
dateInput: {
    flex: 1,
    color: Tokens.colors.textPrimary,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.lg,
  },
  resetButton: {
    flex: 1,
  },
  applyButton: {
    flex: 2,
  },
  pressed: {
    opacity: 0.7,
  },
}));