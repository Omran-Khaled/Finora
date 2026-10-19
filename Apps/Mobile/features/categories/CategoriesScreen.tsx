import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { api } from "../../lib/api/apiClient";
import { Category } from "../../types/contract";
import { Telemetry } from "../../lib/telemetry";
import { CreateCategoryModal } from "./components/CreateCategoryModal";

export default function CategoriesScreen() {
  useTheme();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await api.getCategories();
      setCategories(res.filter((category) => category.status === "ACTIVE"));
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      Telemetry.track("screen_opened", { screenName: "Categories" });
      void fetchData();
    }, [fetchData]),
  );

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteCategory(categoryToDelete.id);
      setCategoryToDelete(null);
      await fetchData(true);
    } catch (err) {
      setError(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const expenseCategories = categories.filter((category) => category.type === "EXPENSE");
  const incomeCategories = categories.filter((category) => category.type === "INCOME");

  const renderGroup = (title: string, group: Category[], icon: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Ionicons name={icon} size={13} color={Tokens.colors.textSecondary} />
        <AppText variant="small" weight="bold" color={Tokens.colors.textSecondary}>
          {title} ({group.length})
        </AppText>
      </View>
      {group.length === 0 ? (
        <AppText variant="tiny" color={Tokens.colors.textMuted}>
          No categories in this group yet.
        </AppText>
      ) : (
        group.map((category) => (
          <View key={category.id} style={styles.row}>
            <View style={styles.rowText}>
              <AppText variant="small" weight="semibold">
                {category.name}
              </AppText>
            </View>
            {category.isSystem ? (
              <Badge label="SYSTEM" color={Tokens.colors.textMuted} backgroundColor={Tokens.colors.surfaceSubtle} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={"Delete category " + category.name}
                onPress={() => setCategoryToDelete(category)}
                style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
              >
                <Ionicons name="trash-outline" size={14} color={Tokens.colors.dangerText} />
              </Pressable>
            )}
          </View>
        ))
      )}
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/more");
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <View>
          <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
            Organize Your Spending
          </AppText>
          <AppText variant="title" weight="extrabold">
            Categories
          </AppText>
        </View>
        <Button onPress={() => setShowCreateModal(true)} label="Add" style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={Tokens.colors.brand} />}
      >
        <ErrorBanner error={error} onRetry={() => fetchData(false)} />

        {isLoading ? (
          <View style={styles.group}>
            <Skeleton height={64} borderRadius={Tokens.radius.md} />
            <Skeleton height={64} borderRadius={Tokens.radius.md} />
            <Skeleton height={64} borderRadius={Tokens.radius.md} />
          </View>
        ) : categories.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No categories"
            description="Categories classify every transaction. System categories are provided out of the box."
            actionLabel="Create Category"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <>
            {renderGroup("Expense Categories", expenseCategories, "arrow-up-circle-outline")}
            {renderGroup("Income Categories", incomeCategories, "arrow-down-circle-outline")}
          </>
        )}
      </ScrollView>

      <CreateCategoryModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSuccess={() => fetchData(true)} />

      <ConfirmationDialog
        isOpen={categoryToDelete !== null}
        title="Delete this category?"
        message="Custom categories can only be deleted when no active transactions reference them. System categories cannot be deleted."
        confirmLabel="Delete Category"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setCategoryToDelete(null)}
      />
    </Screen>
  );
}

const styles = Tokens.createStyles(() => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
    gap: Tokens.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButton: {
    minHeight: 40,
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.lg,
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.lg,
  },
  group: {
    gap: Tokens.spacing.sm,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    marginBottom: Tokens.spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
  },
  rowText: {
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
}));