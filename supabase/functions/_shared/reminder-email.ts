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

export function reminderBody(name: string, discreet: boolean, appUrl: string | null, appLink: string | null = null) {
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
    return { text, html }
  }

  if (discreet) {
    // Discreet: no visible URL anywhere, only link in HTML.
    const text = `${hello}\n\nA reminder, whenever you get a chance.\n`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#3a3430;max-width:460px">
  <p style="margin:0 0 14px">${htmlHello}</p>
  <p style="margin:0"><a href="${escapeHtml(checkInUrl)}" style="color:#5a5350;text-decoration:none;font-weight:500">A reminder</a>, whenever you get a chance.</p>
</div>`
    return { text, html }
  } else {
    // Non-discreet: include both link and plain text URL.
    const text = `${hello}\n\nA reminder to open Unravel and check in, whenever you get a chance.\n\n${checkInUrl}\n`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#3a3430;max-width:460px">
  <p style="margin:0 0 14px">${htmlHello}</p>
  <p style="margin:0">A reminder to <a href="${escapeHtml(checkInUrl)}" style="color:#5a5350;text-decoration:none;font-weight:500">open Unravel and check in</a>, whenever you get a chance.</p>
</div>`
    return { text, html }
  }
}
