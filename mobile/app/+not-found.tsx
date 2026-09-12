import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

export default function NotFoundScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={[styles.body, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>This page isn't here</Text>
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          The link may be out of date.
        </Text>
        <Link href="/" style={[styles.link, { color: theme.colors.accent }]}>
          Go back to Today
        </Link>
      </View>
    </>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontFamily: fonts.display, fontSize: 24 },
  note: { fontFamily: fonts.body, fontSize: 15, marginTop: 10, textAlign: "center" },
  link: { fontFamily: fonts.body, fontSize: 15, marginTop: 20 },
});
