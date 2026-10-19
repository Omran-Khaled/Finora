import { View } from "react-native";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";

interface BadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
}

export function Badge({
  label,
  color = Tokens.colors.textSecondary,
  backgroundColor = Tokens.colors.surfaceSubtle,
}: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <AppText variant="tiny" weight="bold" color={color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  badge: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    alignSelf: "flex-start",
  },
}));