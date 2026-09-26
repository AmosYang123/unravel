import { Platform } from "react-native";
import type { ThemeName } from "./types";

/** The alternate icon for each theme, as named in app.json. Others use the default. */
const ICON_FOR: Partial<Record<ThemeName, string>> = {
  blush: "Blush",
  mist: "Mist",
  lilac: "Lilac",
  sage: "Sage",
  dusk: "Dusk",
  ink: "Ink",
};

/**
 * Switches the home-screen icon to match a theme. iOS shows its own
 * "You have changed the icon" notice each time; apps can't hide it, so this
 * only runs when someone picks a theme, never on its own.
 */
export async function matchIconToTheme(theme: ThemeName): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    // Loaded here so web, which has no native module, never imports it.
    const icons = await import("expo-alternate-app-icons");
    if (!icons.supportsAlternateIcons) return;
    const want = ICON_FOR[theme] ?? null;
    if (icons.getAppIconName() === want) return;
    await icons.setAlternateAppIcon(want);
  } catch (err) {
    console.error("Couldn't change the app icon", err);
  }
}
