import { Modal, View } from "react-native";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Ionicons } from "@expo/vector-icons";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.icon}>
            <Ionicons name="alert-circle" size={24} color={Tokens.colors.danger} />
          </View>
          <AppText variant="title" weight="bold" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.message}>
            {message}
          </AppText>
          <Button
            onPress={onConfirm}
            label={confirmLabel}
            variant={isDestructive ? "destructive" : "primary"}
            loading={isLoading}
            style={styles.confirm}
          />
          <Button onPress={onCancel} label={cancelLabel} variant="secondary" disabled={isLoading} style={styles.cancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = Tokens.createStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: Tokens.spacing.lg,
  },
  dialog: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  icon: {
    marginBottom: Tokens.spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Tokens.spacing.sm,
  },
  message: {
    textAlign: "center",
    marginBottom: Tokens.spacing.xl,
  },
  confirm: {
    width: "100%",
    marginBottom: Tokens.spacing.sm,
  },
  cancel: {
    width: "100%",
  },
}));