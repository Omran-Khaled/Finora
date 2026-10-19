import { View, ScrollView, Pressable, TextInput } from "react-native";
import { useEffect, useState } from "react";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Button } from "../../../components/Button";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ModalSheet } from "../../../components/ModalSheet";
import { api } from "../../../lib/api/apiClient";
import { Category } from "../../../types/contract";
import { parseAmountToMinor } from "../../../lib/format";
import { Telemetry } from "../../../lib/telemetry";

interface CreateBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
}

export function CreateBudgetModal({ isOpen, onClose, onSuccess, categories }: CreateBudgetModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [limitStr, setLimitStr] = useState("500.00");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const expenseCats = categories.filter((c) => c.status === "ACTIVE" && c.type === "EXPENSE");

  useEffect(() => {
    if (isOpen && !categoryId && expenseCats.length > 0) {
      const first = expenseCats[0];
      if (first) setCategoryId(first.id);
    }
  }, [isOpen, categoryId, expenseCats]);

  const handleSubmit = async () => {
    if (!categoryId) {
      setError("Please select a category for this budget.");
      return;
    }
    const limitMinor = parseAmountToMinor(limitStr);
    if (limitMinor === null || BigInt(limitMinor) <= 0n) {
      setError("Budget limit must be a positive number.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.createBudget({ categoryId, year, month, limitMinor });
      Telemetry.track("budget_created", { hasCategory: true });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModalSheet isOpen={isOpen} onClose={onClose} title="Set Category Budget">
      <ScrollView>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Category
        </AppText>
        <View style={styles.chipWrap}>
          {expenseCats.length === 0 ? (
            <AppText variant="tiny" color={Tokens.colors.textSecondary}>
              No expense categories available.
            </AppText>
          ) : (
            expenseCats.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityLabel={"Select category " + category.name}
                onPress={() => setCategoryId(category.id)}
                style={({ pressed }) => [
                  styles.chip,
                  categoryId === category.id ? styles.chipActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="small" weight="semibold" color={categoryId === category.id ? Tokens.colors.textInverse : Tokens.colors.textPrimary}>
                  {category.name}
                </AppText>
              </Pressable>
            ))
          )}
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Monthly Limit
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={limitStr}
            onChangeText={setLimitStr}
            placeholder="0.00"
            placeholderTextColor={Tokens.colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>

        <Button onPress={handleSubmit} label="Save Budget" loading={isLoading} style={styles.submit} />
      </ScrollView>
    </ModalSheet>
  );
}

const styles = Tokens.createStyles(() => ({
  label: {
    marginBottom: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  chip: {
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.background,
  },
  chipActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  inputWrap: {
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
  },
  input: {
    color: Tokens.colors.textPrimary,
    fontSize: 14,
  },
  submit: {
    marginTop: Tokens.spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
}));