import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";
import { toUserMessage, isApiError } from "../lib/api/errors";

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  if (!error) return null;
  const message = toUserMessage(error);
  const requestId = isApiError(error) ? error.error.requestId : null;

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle" size={16} color={Tokens.colors.dangerText} />
      <View style={styles.textWrap}>
        <AppText variant="small" weight="semibold" color={Tokens.colors.dangerText}>
          {message}
        </AppText>
        {requestId ? (
          <AppText variant="tiny" color={Tokens.colors.textMuted}>
            Ref: {requestId}
          </AppText>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}
        >
          <AppText variant="tiny" weight="bold" color={Tokens.colors.textInverse}>
            Retry
          </AppText>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <Ionicons name="close" size={14} color={Tokens.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Tokens.spacing.md,
    backgroundColor: Tokens.colors.dangerBg,
    borderWidth: 1,
    borderColor: Tokens.colors.danger,
    borderRadius: Tokens.radius.md,
    marginVertical: Tokens.spacing.sm,
  },
  textWrap: {
    flex: 1,
    marginLeft: Tokens.spacing.sm,
  },
  retry: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: Tokens.spacing.xs,
    backgroundColor: Tokens.colors.dangerText,
    borderRadius: Tokens.radius.xs,
    marginLeft: Tokens.spacing.sm,
  },
  dismiss: {
    marginLeft: Tokens.spacing.sm,
    padding: Tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
}));