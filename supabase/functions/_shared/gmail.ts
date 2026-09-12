export interface ReminderMessage {
  to: string
  subject: string
  text: string
  html: string
}

const utf8Base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const encodeHeader = (value: string) => `=?UTF-8?B?${utf8Base64(value)}?=`

const base64Url = (value: string) =>
  utf8Base64(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** Build the RFC 2822 message expected by Gmail's send endpoint. */
export function gmailRawMessage(message: ReminderMessage, boundary = crypto.randomUUID()): string {
  const from = Deno.env.get('REMINDER_FROM') ?? 'Unravel <unravelreminders@gmail.com>'
  const safeTo = message.to.replace(/[\r\n]/g, '')
  const safeFrom = from.replace(/[\r\n]/g, '')
  const lines = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodeHeader(message.subject.replace(/[\r\n]/g, ''))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.html,
    `--${boundary}--`,
  ]
  return base64Url(lines.join('\r\n'))
}

async function gmailAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Gmail is not configured')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error(`Gmail token request failed [${response.status}]`)
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('access_token' in body) ||
      typeof body.access_token !== 'string') throw new Error('Gmail returned no access token')
  return body.access_token
}

/** Send through the Gmail account authorized by the stored refresh token. */
export async function sendReminderEmail(message: ReminderMessage): Promise<void> {
  const accessToken = await gmailAccessToken()
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: gmailRawMessage(message) }),
  })
  if (!response.ok) throw new Error(`Gmail send failed [${response.status}]`)
}
