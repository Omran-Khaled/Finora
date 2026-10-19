import { View, ScrollView, Pressable } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../../tokens/theme";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { useAuth } from "../../providers/AuthProvider";
import { Telemetry } from "../../lib/telemetry";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemePreference } from "../../providers/ThemeProvider";

interface MoreLink {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  route: string;
}

const LINKS: readonly MoreLink[] = [
  {
    icon: "wallet-outline",
    label: "Accounts",
    description: "Manage balances, archives and account creation",
    route: "/accounts",
  },
  {
    icon: "document-text-outline",
    label: "Categories",
    description: "Customize your income and expense categories",
    route: "/categories",
  },
  {
    icon: "save-outline",
    label: "Savings Goals",
    description: "Track progress toward your financial targets",
    route: "/savings",
  },
  {
    icon: "add-circle-outline",
    label: "New Transaction",
    description: "Record income, expenses and transfers",
    route: "/transaction/new",
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();

  useEffect(() => {
    Telemetry.track("screen_opened", { screenName: "More" });
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="tiny" weight="semibold" color={Tokens.colors.textSecondary}>
          Platform Tools
        </AppText>
        <AppText variant="title" weight="extrabold">
          More
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sessionCard}>
          <View style={styles.sessionIcon}>
            <Ionicons name="person" size={18} color={Tokens.colors.brandLight} />
          </View>
          <View style={styles.sessionInfo}>
            <AppText variant="small" weight="bold" numberOfLines={1}>
              {user?.email || "Signed in"}
            </AppText>
            <AppText variant="tiny" color={Tokens.colors.textSecondary}>
              Base currency: {user?.baseCurrency || "USD"}
            </AppText>
          </View>
        </View>

        <View style={styles.themeCard}>
          <AppText variant="small" weight="bold">
            Appearance
          </AppText>
          <AppText variant="tiny" color={Tokens.colors.textSecondary}>
            Choose how Finora looks on this device.
          </AppText>
          <View style={styles.themeOptions}>
            {(["light", "dark", "system"] as const).map((option: ThemePreference) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: preference === option }}
                accessibilityLabel={`${option[0]!.toUpperCase()}${option.slice(1)} theme`}
                onPress={() => void setPreference(option)}
                style={[
                  styles.themeOption,
                  preference === option ? styles.themeOptionActive : null,
                ]}
              >
                <AppText
                  variant="tiny"
                  weight="bold"
                  color={preference === option ? Tokens.colors.textInverse : Tokens.colors.textSecondary}
                >
                  {option[0]!.toUpperCase() + option.slice(1)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.linkList}>
          {LINKS.map((link) => (
            <Pressable
              key={link.route}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              onPress={() => router.push(link.route as never)}
              style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
            >
              <View style={styles.linkIcon}>
                <Ionicons name={link.icon} size={16} color={Tokens.colors.brandLight} />
              </View>
              <View style={styles.linkText}>
                <AppText variant="small" weight="bold">
                  {link.label}
                </AppText>
                <AppText variant="tiny" color={Tokens.colors.textSecondary} numberOfLines={2}>
                  {link.description}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Tokens.colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Button onPress={() => void signOut()} label="Sign Out" variant="secondary" style={styles.signOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = Tokens.createStyles(() => ({
  header: {
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.borderSubtle,
  },
  content: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  themeCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  themeOptions: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
    marginTop: Tokens.spacing.xs,
  },
  themeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.surfaceSubtle,
  },
  themeOptionActive: {
    backgroundColor: Tokens.colors.brand,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: {
    flex: 1,
  },
  linkList: {
    gap: Tokens.spacing.sm,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.borderSubtle,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.background,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    flex: 1,
  },
  signOut: {
    marginTop: Tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
}));