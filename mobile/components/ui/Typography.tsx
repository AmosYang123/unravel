import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

interface TextPrimitiveProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

/**
 * `.page-title` (src/index.css) without the gradient text-clip — RN can't
 * clip a gradient to text without an extra dependency, so this keeps the
 * same size/weight/tracking and plain foreground colour instead. Pair with
 * <PageUnderline /> underneath, same as ScreenPlaceholder does today.
 */
export function PageTitle({ children, style }: TextPrimitiveProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return <Text style={[styles.pageTitle, { color: theme.colors.foreground }, style]}>{children}</Text>;
}

/**
 * `.section-label` — a short eyebrow-weight label with a hairline rule
 * trailing it. The web rule fades out via a gradient; here it's a flat
 * translucent accent line, in keeping with the "no gradients" restraint.
 */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.sectionLabelRow, style]}>
      <Text style={[styles.sectionLabelText, { color: theme.colors.mutedForeground }]}>{children}</Text>
      <View style={[styles.sectionLabelRule, { backgroundColor: theme.colors.accent, opacity: 0.4 }]} />
    </View>
  );
}

/** `.eyebrow` — a small tracked-out label, no trailing rule. */
export function Eyebrow({ children, style }: TextPrimitiveProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return <Text style={[styles.eyebrow, { color: theme.colors.mutedForeground }, style]}>{children}</Text>;
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionLabelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  sectionLabelRule: {
    flex: 1,
    height: 1,
  },
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
});
