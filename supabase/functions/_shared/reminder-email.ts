// The one check-in reminder email. Lifted out of send-reminders so the test
// send and the scheduled send cannot drift apart.

export const REMINDER_SUBJECT = 'A moment for you'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!)

/** A complete app link overrides the optional web fallback. */
export function reminderLink(appUrl: string | null, appLink: string | null = null): string | null {
  try {
    if (appLink) {
      const url = new URL(appLink)
      if (url.protocol === 'unravel:' && (url.hostname === 'write' || (!url.hostname && url.pathname === '/write'))) return url.href
      if (url.protocol === 'https:') return url.href
      return null
    }
    if (!appUrl) return null
    const url = new URL(appUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${appUrl.replace(/\/$/, '')}/write?mode=short`
  } catch {
    return null
  }
}

/**
 * Every reminder closes by saying how to stop getting them, and carries a
 * postal address when one is configured — the two things a commercial email
 * is expected to include.
 *
 * Discreet mode is why this is not simply a branded footer. It exists so a
 * reminder landing in a shared or watched inbox does not announce that the
 * reader keeps a mental-health journal, and that has to hold: the discreet
 * footer names no app and carries no address, and says only how to turn the
 * reminders off. A postal address is printed only on the non-discreet email,
 * which already names Unravel anyway.
 */
function withFooter(text: string, html: string, discreet: boolean, postalAddress: string | null) {
  const stopLine = discreet
    ? "To stop these, turn reminders off in the app's settings."
    : "To stop these, turn reminders off in Unravel's settings."
  const address = discreet ? null : postalAddress
  const footerText = `\n—\n${stopLine}\n${address ? `${address}\n` : ''}`
  const footerHtml =
    `  <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#8a817c">` +
    `${escapeHtml(stopLine)}${address ? `<br>${escapeHtml(address)}` : ''}</p>\n`
  // Slotted inside the styled wrapper rather than after it, so mail clients
  // inherit the same font and the footer cannot be clipped as a separate block.
  const closing = html.lastIndexOf('</div>')
  return {
    text: text + footerText,
    html: closing === -1 ? html + footerHtml : html.slice(0, closing) + footerHtml + html.slice(closing),
  }
}

export function reminderBody(
  name: string,
  discreet: boolean,
  appUrl: string | null,
  appLink: string | null = null,
  postalAddress: string | null = null,
) {
  const hello = name ? `Hi ${name},` : 'Hi,'
  const htmlHello = escapeHtml(hello)
  const checkInUrl = reminderLink(appUrl, appLink)

  // If no app URL configured, send the original body with no link.
  if (!checkInUrl) {
    const line = discreet
      ? 'A reminder, whenever you get a chance.'
      : 'A reminder to open Unravel and check in, whenever you get a chance.'
    const text = `${hello}\n\n${line}\n`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#3a3430;max-width:460px">
  <p style="margin:0 0 14px">${htmlHello}</p>
  <p style="margin:0">${line}</p>
</div>`
    return withFooter(text, html, discreet, postalAddress)
  }

  if (discreet) {
    // Discreet: no visible URL anywhere, only link in HTML.
    const text = `${hello}\n\nA reminder, whenever you get a chance.\n`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#3a3430;max-width:460px">
  <p style="margin:0 0 14px">${htmlHello}</p>
  <p style="margin:0"><a href="${escapeHtml(checkInUrl)}" style="color:#5a5350;text-decoration:none;font-weight:500">A reminder</a>, whenever you get a chance.</p>
</div>`
    return withFooter(text, html, discreet, postalAddress)
  } else {
    // Non-discreet: include both link and plain text URL.
    const text = `${hello}\n\nA reminder to open Unravel and check in, whenever you get a chance.\n\n${checkInUrl}\n`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#3a3430;max-width:460px">
  <p style="margin:0 0 14px">${htmlHello}</p>
  <p style="margin:0">A reminder to <a href="${escapeHtml(checkInUrl)}" style="color:#5a5350;text-decoration:none;font-weight:500">open Unravel and check in</a>, whenever you get a chance.</p>
</div>`
    return withFooter(text, html, discreet, postalAddress)
  }
}
