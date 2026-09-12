import { Tabs } from "expo-router";
import { BookOpen, Home, Library, Settings as SettingsIcon, Sparkles } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

/** Same five destinations, labels and icons as the web AppShell. */
export default function TabsLayout() {
  const { theme, fonts } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // The five tabs are siblings, not a pile: switching between them is not
        // a step deeper, so it gets no push and no cross-fade.
        animation: "none",
        tabBarActiveTintColor: theme.colors.foreground,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.body,
          fontSize: 11,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color }) => <Home color={color} size={20} strokeWidth={1.5} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "Timeline", tabBarIcon: ({ color }) => <BookOpen color={color} size={20} strokeWidth={1.5} /> }}
      />
      <Tabs.Screen
        name="reading"
        options={{ title: "Reading", tabBarIcon: ({ color }) => <Library color={color} size={20} strokeWidth={1.5} /> }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: "Patterns", tabBarIcon: ({ color }) => <Sparkles color={color} size={20} strokeWidth={1.5} /> }}
      />
      <Tabs.Screen
        name="music"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <SettingsIcon color={color} size={20} strokeWidth={1.5} /> }}
      />
    </Tabs>
  );
}
