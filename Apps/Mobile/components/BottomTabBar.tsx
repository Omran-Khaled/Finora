import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";

interface TabItem {
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

const TABS: ReadonlyArray<TabItem> = [
  { route: "index", label: "Home", icon: "home-outline", activeIcon: "home" },
  { route: "transactions", label: "Transactions", icon: "receipt-outline", activeIcon: "receipt" },
  { route: "budgets", label: "Budgets", icon: "pie-chart-outline", activeIcon: "pie-chart" },
  { route: "more", label: "More", icon: "ellipsis-horizontal", activeIcon: "ellipsis-horizontal" },
];

export interface BottomTabBarProps {
  currentRoute: string;
  onSelect: (route: string) => void;
}

export function BottomTabBar({ currentRoute, onSelect }: BottomTabBarProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {TABS.slice(0, 2).map((tab) => (
        <TabButton key={tab.route} tab={tab} active={currentRoute === tab.route} onPress={() => onSelect(tab.route)} />
      ))}

      {/* Center elevated Add action (Section 18) */}
      <View style={styles.addSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Transaction"
          onPress={() => router.push("/transaction/new")}
          style={({ pressed }) => [styles.addButton, pressed ? styles.addPressed : null]}
        >
          <Ionicons name="add" size={26} color={Tokens.colors.textInverse} />
        </Pressable>
      </View>

      {TABS.slice(2).map((tab) => (
        <TabButton key={tab.route} tab={tab} active={currentRoute === tab.route} onPress={() => onSelect(tab.route)} />
      ))}
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? Tokens.colors.brand : Tokens.colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed ? styles.tabPressed : null]}
    >
      <Ionicons name={active ? tab.activeIcon : tab.icon} size={20} color={color} />
      <AppText variant="tiny" weight={active ? "bold" : "normal"} color={color}>
        {tab.label}
      </AppText>
    </Pressable>
  );
}

const styles = Tokens.createStyles(() => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: Tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
    paddingVertical: Tokens.spacing.sm,
    paddingBottom: Tokens.spacing.md,
    shadowColor: Tokens.colors.textPrimary,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 14,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Tokens.spacing.xs,
  },
  tabPressed: {
    opacity: 0.7,
  },
  addSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -Tokens.spacing.lg,
    borderWidth: 3,
    borderColor: Tokens.colors.surface,
  },
  addPressed: {
    opacity: 0.85,
  },
}));