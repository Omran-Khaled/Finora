import { FlatList, View, Pressable, RefreshControl } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { useTheme } from "../../providers/ThemeProvider";
import { AppText } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { EmptyState } from "../../components/EmptyState";
import { TransactionItem } from "./components/TransactionItem";
import { TransactionFiltersSheet } from "./components/TransactionFiltersSheet";
import { api } from "../../lib/api/apiClient";
import { Transaction, TransactionFilterParams } from "../../types/contract";
import { Telemetry } from "../../lib/telemetry";

export default function TransactionsScreen({ standalone = false }: { standalone?: boolean }) {
  useTheme();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<TransactionFilterParams>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/transactions");
  };

  const fetchInitial = useCallback(async (appliedFilters: TransactionFilterParams = {}, refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const txRes = await api.getTransactions({ ...appliedFilters, limit: 15 });
      setTransactions(txRes.data);
      setNextCursor(txRes.meta?.nextCursor || null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Telemetry.track("screen_opened", { screenName: "Transactions" });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchInitial(filters);
    }, [fetchInitial, filters]),
  );

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await api.getTransactions({ ...filters, cursor: nextCursor, limit: 15 });
      setTransactions((prev) => [...prev, ...res.data]);
      setNextCursor(res.meta?.nextCursor || null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <View style={styles.container}>
      {!standalone ? (
        <View style={styles.header}>
          <View>
            <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
              Ledger History
            </AppText>
            <AppText variant="title" weight="extrabold">
              Transactions
            </AppText>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter transactions"
              onPress={() => setIsFilterOpen(true)}
              style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="filter" size={15} color={hasActiveFilters ? Tokens.colors.brandLight : Tokens.colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh transaction ledger"
              onPress={() => fetchInitial(filters, true)}
              style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="refresh" size={15} color={Tokens.colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.standaloneHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
          </Pressable>
          <AppText variant="title" weight="bold">
            Transactions
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter transactions" onPress={() => setIsFilterOpen(true)} style={styles.backButton}>
            <Ionicons name="filter" size={15} color={hasActiveFilters ? Tokens.colors.brandLight : Tokens.colors.textSecondary} />
          </Pressable>
        </View>
      )}

      <ErrorBanner error={error} onRetry={() => fetchInitial(filters)} />

      {isLoading && !isRefreshing ? (
        <View style={styles.loading}>
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            Loading transactions...
          </AppText>
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="receipt-outline"
            title="No transactions found"
            description={
              hasActiveFilters
                ? "No transactions match the selected filter criteria. Try resetting your filters."
                : "Let's record your first income, expense, or transfer."
            }
            actionLabel={hasActiveFilters ? "Clear Filters" : "Add Transaction"}
            onAction={hasActiveFilters ? () => setFilters({}) : () => router.push("/transaction/new")}
          />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionItem transaction={item} onPress={() => router.push("/transactions/" + item.id)} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchInitial(filters, true)} tintColor={Tokens.colors.brand} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <AppText variant="tiny" color={Tokens.colors.textSecondary} style={styles.footerText}>
                Loading earlier transactions...
              </AppText>
            ) : nextCursor ? (
              <Pressable accessibilityRole="button" onPress={handleLoadMore} style={styles.loadMore}>
                <AppText variant="small" weight="semibold" color={Tokens.colors.brandLight}>
                  Load Earlier Transactions
                </AppText>
              </Pressable>
            ) : null
          }
        />
      )}

      <TransactionFiltersSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        currentFilters={filters}
        onApplyFilters={(next) => {
          setFilters(next);
          setIsFilterOpen(false);
        }}
      />
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: Tokens.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
  },
  headerActions: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  standaloneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  loading: {
    padding: Tokens.spacing.xl,
    alignItems: "center",
  },
  emptyWrap: {
    padding: Tokens.spacing.lg,
  },
  listContent: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  footerText: {
    textAlign: "center",
    paddingVertical: Tokens.spacing.md,
  },
  loadMore: {
    paddingVertical: Tokens.spacing.md,
    alignItems: "center",
  },
}));