import { Pressable, StyleSheet, Text } from "react-native";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { withAlpha } from "./colorUtils";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Pill toggle for filters/rhythms/tastes, ported from `.chip` / `.chip-active`
 * (src/index.css). The web version fills the active state with a diagonal
 * accent gradient; RN keeps it a flat accent tint instead of reaching for a
 * gradient dependency — same intent, calmer on native.
 */
export function Chip({ label, selected = false, onPress, disabled = false, accessibilityLabel }: ChipProps) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: selected
            ? withAlpha(theme.colors.accent, 0.6)
            : withAlpha(theme.colors.border, 0.7),
          backgroundColor: selected ? withAlpha(theme.colors.accent, 0.16) : "transparent",
        },
        pressed && !selected && { borderColor: withAlpha(theme.colors.accent, 0.4) },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? theme.colors.foreground : theme.colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  base: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
});
