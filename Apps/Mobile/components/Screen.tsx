import { View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ReactNode } from "react";
import { Tokens } from "../tokens/theme";

interface ScreenProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Screen({ children, style }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={["top", "left", "right"]}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = Tokens.createStyles(() => ({
  safeArea: {
    flex: 1,
    backgroundColor: Tokens.colors.background,
  },
  content: {
    flex: 1,
  },
}));