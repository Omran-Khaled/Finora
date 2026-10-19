import { View, ScrollView } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../../tokens/theme";
import { AppText } from "../../../components/AppText";
import { Button } from "../../../components/Button";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ModalSheet } from "../../../components/ModalSheet";
import { ConfirmationDialog } from "../../../components/ConfirmationDialog";
import { ProgressBar } from "../../../components/ProgressBar";
import { api } from "../../../lib/api/apiClient";
import { Account, SavingsGoal } from "../../../types/contract";
import { formatDate, formatMoney } from "../../../lib/format";

interface GoalDetailModalProps {
  goal: SavingsGoal | null;
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onArchiveSuccess: () => void;
}

export function GoalDetailModal({ goal, accounts, isOpen, onClose, onArchiveSuccess }: GoalDetailModalProps) {
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!goal) return null;

  const linkedAccount = accounts.find((a) => a.id === goal.accountId);
  const progressPercent = goal.progressPercentage ?? 0;

  const handleArchive = async () => {
    setIsArchiving(true);
    setError(null);
    try {
      await api.archiveSavingsGoal(goal.id);
      setShowArchiveConfirm(false);
      onArchiveSuccess();
    } catch (err) {
      setError(err);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <>
      <ModalSheet isOpen={isOpen} onClose={onClose} title="Savings Goal Details">
        <ScrollView>
          <ErrorBanner error={error} onDismiss={() => setError(null)} />

          <View style={styles.hero}>
            <AppText variant="title" weight="bold" style={styles.heroName}>
              {goal.name}
            </AppText>
            <AppText variant="hero" weight="extrabold" color={Tokens.colors.successText}>
              {progressPercent}%
            </AppText>
            <AppText variant="small" color={Tokens.colors.textSecondary}>
              {formatMoney(goal.currentAmountMinor || 0)} of {formatMoney(goal.targetAmountMinor)}
            </AppText>
            <View style={styles.progressWrap}>
              <ProgressBar progress={progressPercent} color={Tokens.colors.success} />
            </View>
          </View>

          <View style={styles.details}>
            <DetailRow icon="business-outline" label="Linked Account" value={linkedAccount?.name || "Linked Account"} />
            <DetailRow icon="cash-outline" label="Current Balance (From Account)" value={formatMoney(goal.currentAmountMinor || 0)} />
            <DetailRow icon="flag-outline" label="Target Amount" value={formatMoney(goal.targetAmountMinor)} />
            {goal.targetDate ? <DetailRow icon="calendar-outline" label="Target Date" value={formatDate(goal.targetDate)} /> : null}
          </View>

          {goal.status === "ACTIVE" ? (
            <Button onPress={() => setShowArchiveConfirm(true)} label="Archive Goal" variant="secondary" style={styles.archiveButton} />
          ) : null}
        </ScrollView>
      </ModalSheet>

      <ConfirmationDialog
        isOpen={showArchiveConfirm}
        title="Archive this savings goal?"
        message="Archiving the goal removes it from active tracking. The linked savings account and its balance remain completely unchanged."
        confirmLabel="Archive Goal"
        isDestructive={false}
        isLoading={isArchiving}
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLabel}>
        <Ionicons name={icon} size={13} color={Tokens.colors.textSecondary} />
        <AppText variant="small" color={Tokens.colors.textSecondary}>
          {label}
        </AppText>
      </View>
      <AppText variant="small" weight="semibold" style={styles.detailValue} numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  hero: {
    alignItems: "center",
    padding: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.background,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  heroName: {
    marginBottom: Tokens.spacing.xs,
  },
  progressWrap: {
    width: "100%",
    marginTop: Tokens.spacing.md,
  },
  details: {
    marginTop: Tokens.spacing.md,
    backgroundColor: Tokens.colors.background,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Tokens.spacing.sm,
    gap: Tokens.spacing.md,
  },
  detailLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  archiveButton: {
    marginTop: Tokens.spacing.md,
  },
}));