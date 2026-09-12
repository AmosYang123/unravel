import Svg, { Path } from "react-native-svg";
import type { StyleProp, ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

export interface PageUnderlineProps {
  /** Rendered width in dp; height follows the source viewBox's aspect ratio. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The yarn-thread motif under a page title. `.page-underline` (src/index.css)
 * masks a solid accent bar with this same squiggle as an SVG data URI — RN
 * has no CSS mask, so this draws the two paths directly with react-native-svg
 * instead, stroked in the theme's accent colour.
 */
export function PageUnderline({ width = 44, style }: PageUnderlineProps) {
  const { theme } = useTheme();
  const height = (width / 56) * 8;

  return (
    <Svg width={width} height={height} viewBox="0 0 56 8" style={style} aria-hidden>
      <Path
        d="M2 4.3 C 8 1.8, 14 6.5, 20 4 C 26 1.5, 32 6, 38 4.2 C 42 3, 45 5.2, 48 4"
        stroke={theme.colors.accent}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M48 4 C 50.5 3.2, 52.5 5.3, 54.5 3.8"
        stroke={theme.colors.accent}
        strokeWidth={0.9}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
    </Svg>
  );
}
