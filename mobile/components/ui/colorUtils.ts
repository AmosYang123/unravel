/**
 * Turns a theme hex colour into an rgba() string with a given alpha, the RN
 * equivalent of the web app's `hsl(var(--x) / 0.4)` opacity slashes. Every
 * theme token in theme/tokens.ts is a 6-digit hex, so that's the only shape
 * handled here.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
