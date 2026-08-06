// Calendar subscription feed — serves a person's fixtures as iCalendar
// (RFC 5545) so Google and Apple Calendar can subscribe and stay in sync.
//
// Deployed as a Supabase Edge Function with JWT VERIFICATION OFF, which is
// not a shortcut: a calendar client fetches a URL on a timer with no cookies,
// no Authorization header and no way to refresh anything. The URL is the
// credential. What protects the data is that the token is an unguessable uuid
// and that public.calendar_events_for_token() decides what it returns.
//
// This function holds the ANON key only. It has no elevated access and could
// not read a fixture on its own — every authorisation decision lives in the
// SECURITY DEFINER function, one auditable place, rather than being
// reimplemented in TypeScript where nothing tests it.
// See db/migrations/20260804_calendar_feed.sql.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CALENDAR_NAME = 'Abu Dhabi Harlequins'
// Clients treat this as a hint, not an instruction. Google in particular
// refreshes on its own schedule (historically several hours), so a fixture
// change is not instant for everyone — worth knowing before someone reports
// it as a bug.
const REFRESH = 'PT1H'

/** RFC 5545 §3.3.5: UTC timestamps, no punctuation. */
function icsStamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * RFC 5545 §3.3.11. Backslash, semicolon and comma are structural in ICS and
 * a venue like "Zayed Sports City, Gate 3" silently truncates the property
 * without this. Order matters: backslash first, or it re-escapes its own
 * output.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 §3.1: content lines are folded at 75 OCTETS, not characters.
 * Counting characters splits multi-byte UTF-8 mid-sequence, which is how a
 * feed with an accented opponent name turns into mojibake in one client and a
 * parse error in another.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Never split inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    out.push(new TextDecoder().decode(bytes.slice(start, end)))
    start = end
    limit = 74 // continuation lines carry a leading space
  }
  return out.join('\r\n ')
}

type Event = {
  id: string
  type: string
  title: string | null
  opponent: string | null
  home: boolean | null
  venue: string | null
  pitch: string | null
  competition: string | null
  starts_at: string
  team_name: string | null
}

/** Matches the app's own wording (src/lib/eventFormat.js). */
function summaryFor(event: Event): string {
  const squad = event.team_name ?? 'Quins'
  if (event.type === 'match') {
    const opponent = event.opponent ?? 'TBC'
    return event.home ? `${squad} v ${opponent}` : `${opponent} v ${squad}`
  }
  if (event.title) return `${squad} — ${event.title}`
  return event.type === 'training' ? `${squad} training` : `${squad} — club event`
}

/**
 * Where the event is, as one line, for LOCATION.
 *
 * ⚠️ DUPLICATES venueLine() in src/lib/eventFormat.js, deliberately and
 * unavoidably: that module is browser JavaScript bundled by Vite, this is a
 * standalone Deno function deployed separately, and there is no shared build
 * between them. Keep the two in step by hand — a parent reading "Pitch 3" in
 * the app and something different in their calendar is the failure this
 * comment exists to prevent. tests/event-format.test.js pins the app side.
 *
 * The pitch goes in LOCATION rather than DESCRIPTION because LOCATION is what
 * a phone shows under the event title without opening it, and "which pitch"
 * is the one thing a parent standing at a 12-pitch venue actually needs.
 */
function locationFor(event: Event): string {
  const venue = (event.venue ?? '').trim()
  const pitch = (event.pitch ?? '').trim()
  if (venue && pitch) return `${venue} · ${pitch}`
  return venue || pitch || ''
}

// No end time is stored, so one is assumed rather than emitting a zero-length
// event, which some clients render as an unreadable sliver. Deliberately
// generous for a match: nobody leaves a fixture after exactly an hour.
const DURATION_MINUTES: Record<string, number> = { match: 120, training: 90, social: 120 }

function toVEvent(event: Event, stamp: string): string[] {
  const start = new Date(event.starts_at)
  const end = new Date(start.getTime() + (DURATION_MINUTES[event.type] ?? 90) * 60_000)

  const description: string[] = []
  if (event.competition) description.push(event.competition)
  if (event.type === 'match' && event.opponent) {
    description.push(event.home ? 'Home' : 'Away')
  }

  const lines = [
    'BEGIN:VEVENT',
    // Stable across refreshes: the client updates the existing entry instead
    // of creating a duplicate every time the feed is polled.
    `UID:${event.id}@quins.adhjrt.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeText(summaryFor(event))}`,
  ]
  const location = locationFor(event)
  if (location) lines.push(`LOCATION:${escapeText(location)}`)
  if (description.length) lines.push(`DESCRIPTION:${escapeText(description.join(' · '))}`)
  lines.push('END:VEVENT')
  return lines
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  // Shape check before touching the database. An unparseable token would
  // otherwise reach Postgres as a cast error rather than a clean refusal.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!token || !looksLikeUuid.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_events_for_token`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _token: token }),
  })

  if (!response.ok) {
    // Deliberately vague to the client, detailed in the log. A calendar app
    // shows the user nothing useful either way, and distinguishing "no such
    // token" from "database down" hands a token-guesser an oracle.
    console.error('calendar feed rpc failed', response.status, await response.text())
    return new Response('Unavailable', { status: 503 })
  }

  const events: Event[] = await response.json()
  const stamp = icsStamp(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Abu Dhabi Harlequins//Quins Club Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
    `X-WR-TIMEZONE:Asia/Dubai`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    `X-PUBLISHED-TTL:${REFRESH}`,
    ...events.flatMap((event) => toVEvent(event, stamp)),
    'END:VCALENDAR',
  ]

  // CRLF is required by RFC 5545 §3.1. Some clients tolerate bare LF; the
  // strict ones reject the whole calendar.
  const body = lines.map(fold).join('\r\n') + '\r\n'

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="quins.ics"',
      // An unguessable URL must not be cached by anything in between.
      'Cache-Control': 'private, max-age=0, no-store',
    },
  })
})
