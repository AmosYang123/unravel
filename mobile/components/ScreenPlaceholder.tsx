import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/**
 * Stage 1 stand-in for a feature screen. It exists to prove navigation and
 * theming reach every tab; the real screens land in stage 2.
 */
export function ScreenPlaceholder({ title, note }: { title: string; note: string }) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>{title}</Text>
        <View style={[styles.underline, { backgroundColor: theme.colors.accent }]} />
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>{note}</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  title: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.5 },
  underline: { height: 3, width: 44, borderRadius: 999, marginTop: 12, opacity: 0.85 },
  note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, marginTop: 20 },
});
