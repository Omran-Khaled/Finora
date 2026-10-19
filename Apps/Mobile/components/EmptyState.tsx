import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={24} color={Tokens.colors.brandLight} />
      </View>
      <AppText variant="title" weight="bold" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="small" color={Tokens.colors.textSecondary} style={styles.description}>
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <Button onPress={onAction} label={actionLabel} variant="primary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    paddingVertical: Tokens.spacing.xxl,
    paddingHorizontal: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Tokens.colors.border,
    alignItems: "center",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Tokens.spacing.md,
  },
  title: {
    marginBottom: Tokens.spacing.xs,
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginBottom: Tokens.spacing.lg,
    maxWidth: 260,
  },
  action: {
    alignSelf: "center",
  },
}));