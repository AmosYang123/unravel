/**
 * Theme tokens ported from the web app's src/index.css.
 *
 * Colors are the same HSL values resolved to hex; nothing here is invented.
 * The CSS `--shadow-soft` / `--shadow-lift` box-shadows are two-layer and use
 * negative spread, which RN does not take, so each theme carries the nearest
 * single-layer equivalent instead. Everything else keeps the web token name.
 */

export const THEME_NAMES = ["system", "linen", "blush", "mist", "lilac", "dusk", "ink", "sage"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  accentSoft: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface Shadow {
  /** The shadow's own colour, which the modal scrims tint themselves with. */
  color: string;
  /** The drop shadow itself, spread into a `style` prop. */
  style: { boxShadow: string; elevation: number };
}

/**
 * Builds a theme's drop shadow. RN's `shadow*` style props are deprecated in
 * favour of the CSS-shaped `boxShadow`, which the new architecture and the web
 * both understand; `elevation` stays for Android below API 28, where boxShadow
 * does not render.
 *
 * The rgba() conversion is the same one components/ui/colorUtils.ts does for
 * theme colours, kept local so the token layer stays free of app imports.
 */
function shadow(hex: string, opacity: number, blur: number, offsetY: number, elevation: number): Shadow {
  const value = parseInt(hex.replace("#", ""), 16);
  const rgb = `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
  return {
    color: hex,
    style: { boxShadow: `0px ${offsetY}px ${blur}px rgba(${rgb}, ${opacity})`, elevation },
  };
}

export interface Theme {
  name: ThemeName;
  dark: boolean;
  colors: ThemeColors;
  /** --radius: 1rem, in density-independent pixels. */
  radius: number;
  shadowSoft: Shadow;
  shadowLift: Shadow;
}

/**
 * The web app's two fonts. These are the family names expo-google-fonts
 * registers, not the CSS names — `Fraunces` / `Karla` do not resolve on native.
 */
export interface FontSet {
  display: string;
  displayMedium: string;
  body: string;
  bodySemiBold: string;
}

const SOFT_SERIF_FONTS: FontSet = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  body: 'Karla_400Regular',
  bodySemiBold: 'Karla_600SemiBold',
};

const ALL_SANS_FONTS: FontSet = {
  display: 'Karla_600SemiBold',
  displayMedium: 'Karla_500Medium',
  body: 'Karla_400Regular',
  bodySemiBold: 'Karla_600SemiBold',
};

const ALL_SERIF_FONTS: FontSet = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  body: 'Fraunces_400Regular',
  bodySemiBold: 'Fraunces_600SemiBold',
};

/**
 * Maps the web app's stored `displayFont`/`bodyFont` setting (plain family
 * names like "Fraunces" / "Karla") to a set of already-loaded native family
 * names. Anything unrecognised falls back to the default "Soft serif" pairing.
 */
export function resolveFontSet(displayFont: string, bodyFont: string): FontSet {
  if (displayFont === 'Karla' && bodyFont === 'Karla') return ALL_SANS_FONTS;
  if (displayFont === 'Fraunces' && bodyFont === 'Fraunces') return ALL_SERIF_FONTS;
  return SOFT_SERIF_FONTS;
}

/** The default "Soft serif" pairing, used until settings have loaded. */
export const defaultFontSet: FontSet = SOFT_SERIF_FONTS;

/**
 * The default pairing as a frozen constant, for the one call site that still
 * builds its fonts into a module-scope `StyleSheet.create` object —
 * app/(tabs)/settings.tsx. That bakes in whatever this holds at module load
 * and so ignores the setting; every other screen takes its fonts from
 * `useTheme().fonts` via `useStyles` instead.
 */
export const FONTS: Readonly<FontSet> = Object.freeze({ ...SOFT_SERIF_FONTS });

const linen: Theme = {
  name: "linen",
  dark: false,
  colors: {
    background: "#f7f5f2",
    foreground: "#322e29",
    card: "#fbfaf8",
    cardForeground: "#322e29",
    popover: "#fbfaf8",
    popoverForeground: "#322e29",
    primary: "#453d36",
    primaryForeground: "#faf8f5",
    secondary: "#ece9e4",
    secondaryForeground: "#49423c",
    muted: "#eeebe7",
    mutedForeground: "#7c736a",
    accent: "#bd927f",
    accentForeground: "#2f2923",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#e3dfd9",
    input: "#e3dfd9",
    ring: "#bd927f",
  },
  radius: 16,
  shadowSoft: shadow("#383129", 0.18, 16, 6, 3),
  shadowLift: shadow("#383129", 0.25, 30, 12, 8),
};

const blush: Theme = {
  name: "blush",
  dark: false,
  colors: {
    background: "#faeff2",
    foreground: "#442c33",
    card: "#fdf7f8",
    cardForeground: "#442c33",
    popover: "#fdf7f8",
    popoverForeground: "#442c33",
    primary: "#683b48",
    primaryForeground: "#fdf7f8",
    secondary: "#f3e2e6",
    secondaryForeground: "#573841",
    muted: "#f4e7ea",
    mutedForeground: "#86656f",
    accent: "#d77999",
    accentForeground: "#fdf7f8",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#ead7dc",
    input: "#ead7dc",
    ring: "#d77999",
  },
  radius: 16,
  shadowSoft: shadow("#383129", 0.18, 16, 6, 3),
  shadowLift: shadow("#383129", 0.25, 30, 12, 8),
};

const mist: Theme = {
  name: "mist",
  dark: false,
  colors: {
    background: "#ebf3f9",
    foreground: "#273749",
    card: "#f7fafd",
    cardForeground: "#273749",
    popover: "#f7fafd",
    popoverForeground: "#273749",
    primary: "#324b67",
    primaryForeground: "#f7fafd",
    secondary: "#deeaf2",
    secondaryForeground: "#33465b",
    muted: "#e3ecf2",
    mutedForeground: "#607385",
    accent: "#51a0c8",
    accentForeground: "#f7fafd",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#d3e0e9",
    input: "#d3e0e9",
    ring: "#51a0c8",
  },
  radius: 16,
  shadowSoft: shadow("#383129", 0.18, 16, 6, 3),
  shadowLift: shadow("#383129", 0.25, 30, 12, 8),
};

const lilac: Theme = {
  name: "lilac",
  dark: false,
  colors: {
    background: "#f5f0f9",
    foreground: "#3b2d4d",
    card: "#faf7fd",
    cardForeground: "#3b2d4d",
    popover: "#faf7fd",
    popoverForeground: "#3b2d4d",
    primary: "#523d71",
    primaryForeground: "#faf7fd",
    secondary: "#eae3f2",
    secondaryForeground: "#493a5f",
    muted: "#ede7f3",
    mutedForeground: "#78698c",
    accent: "#a677cf",
    accentForeground: "#faf7fd",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#e0d8e9",
    input: "#e0d8e9",
    ring: "#a677cf",
  },
  radius: 16,
  shadowSoft: shadow("#383129", 0.18, 16, 6, 3),
  shadowLift: shadow("#383129", 0.25, 30, 12, 8),
};

const dusk: Theme = {
  name: "dusk",
  dark: true,
  colors: {
    background: "#181721",
    foreground: "#e3e2e9",
    card: "#1f1e29",
    cardForeground: "#e3e2e9",
    popover: "#21202c",
    popoverForeground: "#e3e2e9",
    primary: "#e3e2e9",
    primaryForeground: "#1a1924",
    secondary: "#292734",
    secondaryForeground: "#d8d7e0",
    muted: "#292734",
    mutedForeground: "#9794a8",
    accent: "#a08bc6",
    accentForeground: "#1a1924",
    accentSoft: "#bd927f",
    destructive: "#c44d45",
    destructiveForeground: "#eeeef2",
    border: "#32313f",
    input: "#32313f",
    ring: "#a08bc6",
  },
  radius: 16,
  shadowSoft: shadow("#000000", 0.3, 17, 6, 3),
  shadowLift: shadow("#000000", 0.35, 32, 12, 8),
};

const ink: Theme = {
  name: "ink",
  dark: true,
  colors: {
    background: "#161413",
    foreground: "#e5e1dc",
    card: "#1e1c1a",
    cardForeground: "#e5e1dc",
    popover: "#201f1d",
    popoverForeground: "#e5e1dc",
    primary: "#e5e1dc",
    primaryForeground: "#181716",
    secondary: "#282624",
    secondaryForeground: "#dbd7d1",
    muted: "#282624",
    mutedForeground: "#9c958b",
    accent: "#c5a177",
    accentForeground: "#181716",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#302e2c",
    input: "#302e2c",
    ring: "#c5a177",
  },
  radius: 16,
  shadowSoft: shadow("#000000", 0.4, 17, 6, 3),
  shadowLift: shadow("#000000", 0.45, 32, 12, 8),
};

const sage: Theme = {
  name: "sage",
  dark: false,
  colors: {
    background: "#eef7f1",
    foreground: "#283e34",
    card: "#f8fcf9",
    cardForeground: "#283e34",
    popover: "#f8fcf9",
    popoverForeground: "#283e34",
    primary: "#325243",
    primaryForeground: "#f8fcf9",
    secondary: "#e2eee5",
    secondaryForeground: "#355043",
    muted: "#e5f0e8",
    mutedForeground: "#5e786b",
    accent: "#49a281",
    accentForeground: "#f8fcf9",
    accentSoft: "#bd927f",
    destructive: "#b34a42",
    destructiveForeground: "#faf8f5",
    border: "#d6e6db",
    input: "#d6e6db",
    ring: "#49a281",
  },
  radius: 16,
  shadowSoft: shadow("#383129", 0.18, 16, 6, 3),
  shadowLift: shadow("#383129", 0.25, 30, 12, 8),
};

export const systemLight: Theme = {
  name: "system",
  dark: false,
  colors: {
    background: "#ffffff", foreground: "#111111", card: "#f5f5f5", cardForeground: "#111111",
    popover: "#ffffff", popoverForeground: "#111111", primary: "#111111", primaryForeground: "#ffffff",
    secondary: "#eeeeee", secondaryForeground: "#222222", muted: "#f1f1f1", mutedForeground: "#666666",
    accent: "#4a4a4a", accentForeground: "#ffffff", accentSoft: "#d8d8d8", destructive: "#b42318",
    destructiveForeground: "#ffffff", border: "#dedede", input: "#dedede", ring: "#4a4a4a",
  },
  radius: 16,
  shadowSoft: shadow("#000000", 0.12, 16, 6, 3),
  shadowLift: shadow("#000000", 0.2, 30, 12, 8),
};

export const systemDark: Theme = {
  name: "system",
  dark: true,
  colors: {
    background: "#000000", foreground: "#f5f5f5", card: "#1c1c1e", cardForeground: "#f5f5f5",
    popover: "#1c1c1e", popoverForeground: "#f5f5f5", primary: "#f5f5f5", primaryForeground: "#111111",
    secondary: "#2c2c2e", secondaryForeground: "#f5f5f5", muted: "#242426", mutedForeground: "#a1a1a6",
    accent: "#d1d1d6", accentForeground: "#111111", accentSoft: "#3a3a3c", destructive: "#ff6961",
    destructiveForeground: "#111111", border: "#3a3a3c", input: "#3a3a3c", ring: "#d1d1d6",
  },
  radius: 16,
  shadowSoft: shadow("#000000", 0.45, 16, 6, 3),
  shadowLift: shadow("#000000", 0.55, 30, 12, 8),
};

export const themes: Record<ThemeName, Theme> = {
  system: systemLight,
  linen,
  blush,
  mist,
  lilac,
  dusk,
  ink,
  sage,
};

export const defaultTheme = themes.system;

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value);
}
