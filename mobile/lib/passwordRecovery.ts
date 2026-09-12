/** Recovery finishes on the deployed web page, then the user signs in here. */
export function passwordRecoveryUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password ||
      !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^[\d.]+$/.test(host) || host.includes(":")) return null;
    return url.href;
  } catch {
    return null;
  }
}
