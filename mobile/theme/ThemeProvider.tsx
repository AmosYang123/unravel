import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '@/lib/store';
import {
  defaultFontSet,
  defaultTheme,
  isThemeName,
  resolveFontSet,
  systemDark,
  systemLight,
  themes,
  type FontSet,
  type Theme,
  type ThemeName,
} from './tokens';

interface ThemeValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  fonts: FontSet;
}

const ThemeContext = createContext<ThemeValue>({
  theme: defaultTheme,
  themeName: defaultTheme.name,
  setTheme: () => {},
  fonts: defaultFontSet,
});

/**
 * Holds the active theme and font pairing. `settings.theme` /
 * `settings.displayFont` / `settings.bodyFont` are the source of truth once
 * the profile has loaded — same as `applyAppearance` in the web app's
 * src/lib/store.ts. The store loads asynchronously after sign-in, so this
 * stays on the linen/soft-serif default (same as a signed-out visitor on
 * web) until `loading` clears, then applies the loaded value exactly once.
 * Tapping a swatch in Settings still calls `setTheme` for an instant local
 * preview ahead of the `update()` round trip that persists it; once that
 * round trip lands, `settings.theme` matches what's already showing, so it
 * is a no-op rather than a second flip.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { settings, loading } = useSettings();
  const colorScheme = useColorScheme();
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme.name);
  const appliedSettingsTheme = useRef<ThemeName | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isThemeName(settings.theme) || settings.theme === appliedSettingsTheme.current) return;
    appliedSettingsTheme.current = settings.theme;
    setThemeName(settings.theme);
  }, [settings.theme, loading]);

  // The font pairing is derived, not stored: `update({ displayFont, bodyFont })`
  // in Settings writes new settings straight into the store, which re-renders
  // this provider, which hands every `useTheme()` consumer a new `fonts`
  // object — no reload needed.
  const fonts = useMemo(
    () => (loading ? defaultFontSet : resolveFontSet(settings.displayFont, settings.bodyFont)),
    [settings.displayFont, settings.bodyFont, loading],
  );

  const value = useMemo<ThemeValue>(
    () => ({
      theme: themeName === "system" ? (colorScheme === "dark" ? systemDark : systemLight) : themes[themeName],
      themeName,
      setTheme: (name: ThemeName) => {
        if (!isThemeName(name)) return;
        appliedSettingsTheme.current = name;
        setThemeName(name);
      },
      fonts,
    }),
    [themeName, fonts, colorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

/**
 * Builds a screen's `StyleSheet` from the active font pairing, rebuilding it
 * only when that pairing changes. Styles that name a font family have to be
 * created during render — a module-scope `StyleSheet.create` freezes whatever
 * fonts were active when the module was first imported, which is why changing
 * the setting used to do nothing until the app restarted.
 */
export function useStyles<T>(create: (fonts: FontSet) => T): T {
  const { fonts } = useTheme();
  return useMemo(() => create(fonts), [create, fonts]);
}
