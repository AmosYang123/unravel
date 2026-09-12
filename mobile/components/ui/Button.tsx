import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

export type ButtonVariant = "filled" | "ghost";
export type ButtonTone = "default" | "destructive";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Filled pill (the primary CTA) or ghost (quiet, no fill). Defaults to "filled". */
  variant?: ButtonVariant;
  /** "destructive" swaps in the destructive colours for either variant. Defaults to "default". */
  tone?: ButtonTone;
  disabled?: boolean;
  /** Rendered before the label, e.g. a lucide-react-native icon element. */
  icon?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Filled pill + ghost variants, the only two button looks in the web app's
 * button.tsx worth carrying over (the rest were shadcn variants this app
 * never leaned on). Every colour comes from the active theme, so switching
 * to dusk/ink just swaps which tokens resolve — nothing here is conditional
 * on light vs dark.
 */
export function Button({
  label,
  onPress,
  variant = "filled",
  tone = "default",
  disabled = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  const filledBg = tone === "destructive" ? theme.colors.destructive : theme.colors.primary;
  const filledFg = tone === "destructive" ? theme.colors.destructiveForeground : theme.colors.primaryForeground;
  const ghostFg = tone === "destructive" ? theme.colors.destructive : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      hitSlop={variant === "ghost" ? 6 : undefined}
      style={({ pressed }) => [
        styles.base,
        variant === "filled"
          ? { backgroundColor: filledBg }
          : { backgroundColor: pressed ? theme.colors.secondary : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
        pressed && variant === "filled" && { opacity: 0.88 },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.label,
          { color: variant === "filled" ? filledFg : ghostFg },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
});
