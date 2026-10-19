import { DimensionValue, View } from "react-native";
import { Tokens } from "../tokens/theme";

interface ProgressBarProps {
  progress: number; // 0..100
  color?: string;
}

export function ProgressBar({ progress, color = Tokens.colors.brand }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const widthValue: DimensionValue = (clamped + "%") as DimensionValue;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: widthValue, backgroundColor: color }]} />
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  track: {
    height: 8,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surfaceSubtle,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Tokens.radius.full,
  },
}));