import { Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, useFonts } from '@expo-google-fonts/fraunces';
import { Karla_400Regular, Karla_500Medium, Karla_600SemiBold } from '@expo-google-fonts/karla';

/**
 * Fraunces and Karla, at every weight any of the three font pairing settings
 * needs (see theme/tokens.ts `resolveFontSet`) — the two fonts the web app uses.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
  });
  // A failed font load must not hang the app on the splash screen forever —
  // fall back to system fonts and let the app proceed.
  if (error) console.warn("useAppFonts: falling back to system fonts", error);
  return loaded || !!error;
}
