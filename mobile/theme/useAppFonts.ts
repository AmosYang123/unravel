import { Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, useFonts } from '@expo-google-fonts/fraunces';
import { Karla_400Regular, Karla_500Medium, Karla_600SemiBold } from '@expo-google-fonts/karla';

/**
 * Fraunces and Karla, at every weight any of the three font pairing settings
 * needs (see theme/tokens.ts `resolveFontSet`) — the two fonts the web app uses.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
  });
  return loaded;
}
