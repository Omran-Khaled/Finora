import { View, ScrollView, Pressable, TextInput } from "react-native";
import { useState } from "react";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Button } from "../../../components/Button";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ModalSheet } from "../../../components/ModalSheet";
import { api } from "../../../lib/api/apiClient";
import { CategoryType } from "../../../types/contract";

const CATEGORY_TYPES: ReadonlyArray<CategoryType> = ["EXPENSE", "INCOME"];

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateCategoryModal({ isOpen, onClose, onSuccess }: CreateCategoryModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please provide a category name.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.createCategory({ name: name.trim(), type });
      setName("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModalSheet isOpen={isOpen} onClose={onClose} title="Create Custom Category">
      <ScrollView>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Category Name
        </AppText>
        <View style={styles.inputWrap}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Subscriptions, Freelancing"
            placeholderTextColor={Tokens.colors.textMuted}
            style={styles.input}
          />
        </View>

        <AppText variant="small" weight="semibold" color={Tokens.colors.textSecondary} style={styles.label}>
          Category Classification
        </AppText>
        <View style={styles.typeRow}>
          {CATEGORY_TYPES.map((categoryType) => (
            <Pressable
              key={categoryType}
              accessibilityRole="button"
              accessibilityLabel={"Category type " + categoryType}
              onPress={() => setType(categoryType)}
              style={({ pressed }) => [
                styles.typeOption,
                type === categoryType ? styles.typeOptionActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <AppText variant="small" weight="bold" color={type === categoryType ? Tokens.colors.textInverse : Tokens.colors.textPrimary}>
                {categoryType}
              </AppText>
            </Pressable>
          ))}
        </View>

        <Button onPress={handleSubmit} label="Create Category" loading={isLoading} style={styles.submit} />
      </ScrollView>
    </ModalSheet>
  );
}

const styles = Tokens.createStyles(() => ({
  label: {
    marginBottom: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
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
    backgroundColor: Tokens.colors.background,
    alignItems: "center",
  },
  typeOptionActive: {
    backgroundColor: Tokens.colors.brand,
    borderColor: Tokens.colors.brandLight,
  },
  submit: {
    marginTop: Tokens.spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
}));