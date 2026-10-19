import { Text, TextProps } from "react-native";
import { Tokens } from "../tokens/theme";

type TextVariant = "tiny" | "small" | "body" | "title" | "large" | "hero" | "button";

const variantSize: Record<TextVariant, number> = {
  tiny: Tokens.typography.tiny,
  small: Tokens.typography.small,
  body: Tokens.typography.body,
  title: Tokens.typography.title,
  large: Tokens.typography.large,
  hero: Tokens.typography.hero,
  button: Tokens.typography.small,
};

const variantLineHeight: Record<TextVariant, number> = {
  tiny: 16,
  small: 19,
  body: 23,
  title: 25,
  large: 29,
  hero: 40,
  button: 20,
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  weight?: "normal" | "bold" | "semibold" | "extrabold" | "mono";
}

const weightMap: Record<string, "400" | "600" | "700" | "800"> = {
  normal: "400",
  semibold: "600",
  bold: "700",
  extrabold: "800",
};

export function AppText({
  variant = "body",
  color = Tokens.colors.textPrimary,
  weight = "normal",
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        { fontSize: variantSize[variant], lineHeight: variantLineHeight[variant], color },
        weight === "mono" ? styles.mono : { fontWeight: weightMap[weight] },
        style,
      ]}
    />
  );
}

const styles = Tokens.createStyles(() => ({
  base: {
    includeFontPadding: false,
  },
  mono: {
    fontVariant: ["tabular-nums"],
  },
}));