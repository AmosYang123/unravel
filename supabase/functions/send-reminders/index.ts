// Scheduled check-in reminders, sent through Resend.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHash, timingSafeEqual } from 'node:crypto'
import { REMINDER_SUBJECT, reminderBody } from '../_shared/reminder-email.ts'
import { sendReminderEmail } from '../_shared/gmail.ts'

/** Constant-time secret comparison; digesting first keeps the lengths equal. */
function secretMatches(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(provided), digest(expected))
}

type Profile = {
  id: string
  name: string | null
  reminder_mode: string
  reminder_days: number[] | null
  reminder_time: string | null
  timezone: string | null
  discreet_notifications: boolean | null
  last_reminder_sent_at: string | null
}

/** Local weekday (0=Sun) and minutes-since-midnight for a time zone. */
function localNow(tz: string, now: Date) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      hour12: false,
    }).formatToParts(now)
  } catch {
    return localNow('UTC', now)
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hour = Number(get('hour')) % 24
  return {
    weekday: Math.max(0, days.indexOf(get('weekday'))),
    minutes: hour * 60 + Number(get('minute')),
    dayOfMonth: Number(get('day')),
  }
}

function isDue(p: Profile, now: Date): boolean {
  const tz = p.timezone || 'UTC'
  const { weekday, minutes, dayOfMonth } = localNow(tz, now)
  const [h, m] = (p.reminder_time || '21:00').split(':').map(Number)
  const target = (h || 0) * 60 + (m || 0)
  // 15-minute window so an hourly/quarter-hourly cron still lands once.
  if (minutes < target || minutes >= target + 15) return false

  switch (p.reminder_mode) {
    case 'daily':
      return true
    case 'days':
      return (p.reminder_days ?? []).includes(weekday)
    case 'weekly':
      return weekday === ((p.reminder_days ?? [])[0] ?? 1)
    case 'monthly':
      return dayOfMonth === 1
    default:
      return false
  }
}

/** Minimum gap between reminders per rhythm, so nothing double-sends. */
function cooldownHours(mode: string) {
  if (mode === 'monthly') return 24 * 20
  if (mode === 'weekly') return 24 * 5
  return 20
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const scheduleSecret = Deno.env.get('REMINDER_CRON_SECRET')
  const bearer = /^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization') ?? '')?.[1]

  if (!scheduleSecret) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!bearer || !secretMatches(bearer, scheduleSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }


  const APP_URL = Deno.env.get('APP_URL') ?? null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const now = new Date()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(
      'id, name, reminder_mode, reminder_days, reminder_time, timezone, discreet_notifications, last_reminder_sent_at',
    )
    .eq('reminder_email_enabled', true)
    .neq('reminder_mode', 'manual')

  if (error) {
    console.error('profiles query failed', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let skipped = 0
  let missingEmail = 0
  let sendFailed = 0

  for (const p of (profiles ?? []) as Profile[]) {
    if (!isDue(p, now)) {
      skipped++
      continue
    }
    if (p.last_reminder_sent_at) {
      const hours = (now.getTime() - new Date(p.last_reminder_sent_at).getTime()) / 3_600_000
      if (hours < cooldownHours(p.reminder_mode)) {
        skipped++
        continue
      }
    }

    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(p.id)
    const email = userRes?.user?.email
    if (userErr || !email) {
      // No identifiers or provider error text in logs: a counter is enough.
      missingEmail++
      skipped++
      continue
    }

    const { text, html } = reminderBody(p.name ?? '', p.discreet_notifications ?? true, APP_URL, Deno.env.get('REMINDER_APP_LINK') ?? null)
    try {
      await sendReminderEmail({ to: email, subject: REMINDER_SUBJECT, text, html })
    } catch (error) {
      console.error('Gmail reminder send failed:', error instanceof Error ? error.message : 'unknown error')
      sendFailed++
      continue
    }


    await supabase
      .from('profiles')
      .update({ last_reminder_sent_at: now.toISOString() })
      .eq('id', p.id)
    sent++
  }

  if (missingEmail || sendFailed) {
    console.error(`send-reminders: ${missingEmail} without an email, ${sendFailed} send failures`)
  }

  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
