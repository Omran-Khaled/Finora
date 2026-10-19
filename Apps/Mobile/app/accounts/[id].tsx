import { Pressable, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { api } from "../../lib/api/apiClient";
import { useCallback, useRef, useState } from "react";
import { Account } from "../../types/contract";
import { formatMoney } from "../../lib/format";
import { useTheme } from "../../providers/ThemeProvider";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { ModalSheet } from "../../components/ModalSheet";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";

export default function AccountDetailRoute() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [archiveError, setArchiveError] = useState<unknown>(null);
  const [editError, setEditError] = useState<unknown>(null);
  const [editName, setEditName] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const isFocused = useRef(false);
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAccount(null);
    try {
      const accounts = await api.getAccounts();
      const found = accounts.find((a) => a.id === id);
      if (isFocused.current) {
        setAccount(found || null);
        if (found) setEditName(found.name);
      }
    } catch (err) {
      if (isFocused.current) setError(err);
    } finally {
      if (isFocused.current) setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    void load();
    return () => {
      isFocused.current = false;
    };
  }, [load]));

  const handleSave = async () => {
    const name = editName.trim();
    if (!name || name.length > 120) {
      setEditError("Account name must be between 1 and 120 characters.");
      return;
    }
    setEditError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateAccount(id, { name });
      setAccount(updated);
      setEditName(updated.name);
      setIsEditOpen(false);
    } catch (err) {
      setEditError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiveError(null);
    setIsArchiving(true);
    try {
      await api.archiveAccount(id);
      setShowArchiveConfirm(false);
      router.replace("/accounts");
    } catch (err) {
      setShowArchiveConfirm(false);
      setArchiveError(err);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/accounts");
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={18} color={Tokens.colors.textSecondary} />
        </Pressable>
        <AppText variant="title" weight="bold">
          Account Details
        </AppText>
        <View style={styles.backButton} />
      </View>
      <View style={styles.content}>
        <ErrorBanner error={archiveError} onDismiss={() => setArchiveError(null)} />
        <ErrorBanner
          error={error}
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
        {isLoading ? (
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            Loading account...
          </AppText>
        ) : !account && !error ? (
          <AppText variant="small" color={Tokens.colors.textSecondary}>
            Account not found.
          </AppText>
        ) : account ? (
          <View style={styles.card}>
            <AppText variant="small" weight="bold">
              {account.name}
            </AppText>
            <AppText variant="tiny" color={Tokens.colors.textSecondary}>
              {account.type} • {account.status}
            </AppText>
            <AppText variant="large" weight="extrabold" style={styles.balance}>
              {formatMoney(account.balanceMinor, account.currencyCode)}
            </AppText>
            {account.status === "ACTIVE" ? (
              <View style={styles.actions}>
                <Button
                  label="Edit account"
                  variant="secondary"
                  accessibilityLabel="Edit account"
                  onPress={() => {
                    setEditName(account.name);
                    setEditError(null);
                    setArchiveError(null);
                    setIsEditOpen(true);
                  }}
                  style={styles.actionButton}
                />
                <Button
                  label="Archive account"
                  variant="destructive"
                  accessibilityLabel="Archive account"
                  onPress={() => {
                    setArchiveError(null);
                    setShowArchiveConfirm(true);
                  }}
                  style={styles.actionButton}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <ModalSheet
        isOpen={isEditOpen}
        onClose={() => {
          if (!isSaving) setIsEditOpen(false);
        }}
        title="Edit account"
      >
        <ErrorBanner error={editError} onDismiss={() => setEditError(null)} />
        <TextField
          label="Account name"
          accessibilityLabel="Account name"
          value={editName}
          onChangeText={setEditName}
          maxLength={120}
          autoCapitalize="words"
          editable={!isSaving}
        />
        <Button
          label="Save changes"
          onPress={() => void handleSave()}
          loading={isSaving}
          disabled={!editName.trim()}
        />
      </ModalSheet>
      <ConfirmationDialog
        isOpen={showArchiveConfirm}
        title="Archive this account?"
        message="The account will be removed from active accounts, while its financial history is preserved. Accounts linked to active savings goals cannot be archived."
        confirmLabel="Archive"
        isLoading={isArchiving}
        onConfirm={() => void handleArchive()}
        onCancel={() => setShowArchiveConfirm(false)}
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
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  card: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
  },
  balance: {
    marginTop: Tokens.spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.lg,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Tokens.spacing.sm,
  },
}));