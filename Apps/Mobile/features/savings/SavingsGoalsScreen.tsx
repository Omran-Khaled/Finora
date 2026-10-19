import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ProgressBar } from "../../components/ProgressBar";
import { api } from "../../lib/api/apiClient";
import { Account, SavingsGoal } from "../../types/contract";
import { formatMoney } from "../../lib/format";
import { Telemetry } from "../../lib/telemetry";
import { GoalDetailModal } from "./components/GoalDetailModal";
import { CreateSavingsGoalModal } from "./components/CreateSavingsGoalModal";

export default function SavingsGoalsScreen() {
  useTheme();
  const router = useRouter();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const [goalRes, accountRes] = await Promise.all([api.getSavingsGoals(), api.getAccounts()]);
      setGoals(goalRes.filter((goal) => goal.status === "ACTIVE"));
      setAccounts(accountRes);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      Telemetry.track("screen_opened", { screenName: "SavingsGoals" });
      void fetchData();
    }, [fetchData]),
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
            Financial Targets
          </AppText>
          <AppText variant="title" weight="extrabold">
            Savings Goals
          </AppText>
        </View>
        <Button onPress={() => setShowCreateModal(true)} label="New Goal" style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={Tokens.colors.brand} />}
      >
        <ErrorBanner error={error} onRetry={() => fetchData(false)} />

        {isLoading ? (
          <View style={styles.list}>
            <Skeleton height={110} borderRadius={Tokens.radius.lg} />
            <Skeleton height={110} borderRadius={Tokens.radius.lg} />
          </View>
        ) : goals.length === 0 ? (
          <EmptyState
            icon="save-outline"
            title="No savings goals yet"
            description="Create a goal linked to a SAVINGS account and watch your progress grow with every deposit."
            actionLabel="Create First Goal"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <View style={styles.list}>
            {goals.map((goal) => {
              const progress = goal.progressPercentage ?? 0;
              const linkedAccount = accounts.find((account) => account.id === goal.accountId);
              const isCompleted = goal.currentAmountMinor !== undefined && goal.currentAmountMinor >= goal.targetAmountMinor;
              return (
                <Pressable
                  key={goal.id}
                  accessibilityRole="button"
                  accessibilityLabel={"Open goal " + goal.name}
                  onPress={() => setSelectedGoal(goal)}
                  style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardTitle}>
                      <Ionicons
                        name="save-outline"
                        size={14}
                        color={isCompleted ? Tokens.colors.successText : Tokens.colors.brandLight}
                      />
                      <AppText variant="small" weight="bold" numberOfLines={1}>
                        {goal.name}
                      </AppText>
                    </View>
                    <AppText variant="small" weight="bold" color={isCompleted ? Tokens.colors.successText : Tokens.colors.brandLight}>
                      {progress}%
                    </AppText>
                  </View>
                  <AppText variant="tiny" color={Tokens.colors.textSecondary}>
                    {linkedAccount?.name || "Linked Account"} • {formatMoney(goal.currentAmountMinor || 0)} of{" "}
                    {formatMoney(goal.targetAmountMinor)}
                  </AppText>
                  <View style={styles.progress}>
                    <ProgressBar progress={progress} color={isCompleted ? Tokens.colors.success : Tokens.colors.brand} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <GoalDetailModal
        goal={selectedGoal}
        accounts={accounts}
        isOpen={selectedGoal !== null}
        onClose={() => setSelectedGoal(null)}
        onArchiveSuccess={() => fetchData(true)}
      />

      <CreateSavingsGoalModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchData(true)}
        accounts={accounts}
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
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  list: {
    gap: Tokens.spacing.sm,
  },
  card: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.xs,
  },
  cardTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  progress: {
    marginTop: Tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
}));