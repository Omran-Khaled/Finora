import { Pressable, ActivityIndicator, View, ViewStyle } from 'react-native';
import { ReactNode } from 'react';
import { Tokens } from '../tokens/theme';
import { AppText } from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  leftIcon?: ReactNode;
  accessibilityLabel?: string;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  leftIcon,
  accessibilityLabel,
}: ButtonProps) {
  const palette = {
    primary: {
      bg: Tokens.colors.brand,
      text: Tokens.colors.textInverse,
    },
    secondary: {
      bg: Tokens.colors.surfaceSubtle,
      text: Tokens.colors.textPrimary,
    },
    destructive: {
      bg: Tokens.colors.dangerBg,
      text: Tokens.colors.dangerText,
    },
    ghost: {
      bg: 'transparent',
      text: Tokens.colors.brandLight,
    },
  } as const;

  const paletteColors = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: paletteColors.bg },
        variant === "primary" ? styles.primaryBorder : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={paletteColors.text} />
      ) : (
        <View style={styles.row}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <AppText variant="button" weight="bold" color={paletteColors.text}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = Tokens.createStyles(() => ({
  base: {
    minHeight: 52,
    borderRadius: Tokens.radius.lg,
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: Tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.56,
  },
  primaryBorder: {
    borderColor: Tokens.colors.brand,
  },
}));