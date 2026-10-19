import { View, ViewStyle } from 'react-native';
import { Tokens } from '../tokens/theme';

interface SkeletonProps {
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ height, borderRadius = Tokens.radius.md, style }: SkeletonProps) {
  return <View style={[styles.base, { height, borderRadius }, style]} />;
}

const styles = Tokens.createStyles(() => ({
  base: {
    backgroundColor: Tokens.colors.surface,
  },
}));