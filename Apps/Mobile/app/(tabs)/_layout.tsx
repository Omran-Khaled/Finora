import { Tabs, useRouter } from "expo-router";
import { BottomTabBar } from "../../components/BottomTabBar";
import { useTheme } from "../../providers/ThemeProvider";

export default function TabsLayout() {
  useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props: { state: { index: number; routes: Array<{ name?: string }> } }) => (
        <BottomTabBar
          currentRoute={props.state.routes[props.state.index]?.name ?? "index"}
          onSelect={(route) => {
            if (route === "index") {
              router.push("/(tabs)");
            } else {
              router.push("/(tabs)/" + route);
            }
          }}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="budgets" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}