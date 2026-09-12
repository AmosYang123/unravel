import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "./colorUtils";

/**
 * The card surface every screen builds on, ported from the web app's
 * `.surface` / `.surface-hover` classes (src/index.css). CSS's layered
 * background-image + box-shadow can't translate literally, so this keeps the
 * same intent with the boxShadow/elevation tokens from theme/tokens.ts: a soft
 * shadow at rest, a border tint plus a stronger "lift" shadow when pressed.
 */
export interface SurfaceProps extends Omit<PressableProps, "style" | "children"> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Renders a Pressable with the pressed treatment instead of a static View. */
  onPress?: () => void;
}

export function Surface({ children, style, onPress, ...pressableProps }: SurfaceProps) {
  const { theme } = useTheme();
  const base: StyleProp<ViewStyle> = [
    styles.base,
    {
      backgroundColor: theme.colors.card,
      borderColor: withAlpha(theme.colors.border, 0.7),
      borderRadius: theme.radius * 1.5,
      ...theme.shadowSoft.style,
    },
    style,
  ];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && {
          borderColor: withAlpha(theme.colors.accent, 0.4),
          ...theme.shadowLift.style,
        },
      ]}
      {...pressableProps}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
});
