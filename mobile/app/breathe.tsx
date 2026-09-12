import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { PageUnderline } from "@/components/ui";
import BreathingSession from "@/components/BreathingSession";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/** Ported from src/pages/Breathe.tsx. */
export default function BreatheScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Link href="/" dismissTo asChild>
          <Pressable style={styles.backLink} accessibilityRole="link" hitSlop={6}>
            <ArrowLeft color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
            <Text style={[styles.backLabel, { color: theme.colors.mutedForeground }]}>Back</Text>
          </Pressable>
        </Link>

        <Text style={[styles.heading, { color: theme.colors.foreground }]}>A minute of breathing</Text>
        <PageUnderline style={styles.underline} />
        <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
          Follow the circle if it helps, or close your eyes and use the counts. Leaving early is fine.
        </Text>

        <BreathingSession />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 56 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  backLabel: { fontFamily: fonts.body, fontSize: 14 },
  heading: { marginTop: 28, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  underline: { marginTop: 10 },
  lede: { marginTop: 16, maxWidth: 420, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
});
