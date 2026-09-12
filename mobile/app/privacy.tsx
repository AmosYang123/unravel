import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Button, PageTitle } from "@/components/ui";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import { releaseConfig } from "@/lib/release-config";
import { FONT_LICENSES } from "@/lib/font-licenses";

export default function Privacy() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="Back" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace("/auth")} />
        <PageTitle>Privacy policy</PageTitle>
        <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>Updated September 12, 2026</Text>
        {PRIVACY_SECTIONS.map(({ title, text }) => (
          <Text key={title} style={[styles.body, { color: theme.colors.foreground }]}>
            <Text style={styles.heading}>{title}{"\n\n"}</Text>{text}
          </Text>
        ))}
        {releaseConfig.ownerName ? <Text style={[styles.body, { color: theme.colors.foreground }]}>App owner: {releaseConfig.ownerName}</Text> : null}
        {releaseConfig.supportEmail ? <Link href={`mailto:${releaseConfig.supportEmail}`} style={[styles.body, { color: theme.colors.foreground, textDecorationLine: "underline" }]}>{releaseConfig.supportEmail}</Link> : <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>Support contact details are not yet available.</Text>}
        {releaseConfig.privacyUrl ? <Link href={releaseConfig.privacyUrl} style={[styles.body, { color: theme.colors.foreground, textDecorationLine: "underline" }]}>Privacy policy on the web</Link> : null}
        {releaseConfig.supportUrl ? <Link href={releaseConfig.supportUrl} style={[styles.body, { color: theme.colors.foreground, textDecorationLine: "underline" }]}>Support</Link> : null}
        <Text style={[styles.body, { color: theme.colors.foreground }]}><Text style={styles.heading}>Font licenses{"\n\n"}</Text>{FONT_LICENSES}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  content: { padding: 24, gap: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  heading: { fontFamily: fonts.display, fontSize: 21 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25 },
});
