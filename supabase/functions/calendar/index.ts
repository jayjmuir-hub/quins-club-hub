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
  // Both added 8 Aug 2026 (db/migrations/20260808_event_end_time_and_notes.sql).
  //
  // ⚠️ OPTIONAL IN THIS TYPE ON PURPOSE. These rows come from
  // calendar_events_for_token(), and it is that function's RETURNS TABLE —
  // not this file — that decides which columns actually leave the database.
  // The pitch was missing from the feed for a day in Aug 2026 for exactly
  // that reason, and no amount of editing this file fixed it; see
  // db/migrations/20260805_calendar_feed_pitch.sql. Until the matching
  // migration is applied these arrive `undefined`, so everything below must
  // fall back rather than emit "undefined" into a subscribed calendar.
  ends_at?: string | null
  notes?: string | null
  team_name: string | null
  // Added 12 Aug 2026 (db/migrations/20260812_calendar_feed_league_team.sql).
  //
  // ⚠️ OPTIONAL FOR THE SAME REASON ends_at AND notes ARE, and the reason is
  // directly above: calendar_events_for_token()'s RETURNS TABLE decides what
  // actually leaves the database, not this file. Until that migration is
  // applied these arrive `undefined`, and everything below must fall back
  // rather than emit "undefined" into somebody's subscribed calendar.
  league_team_name?: string | null
  league_division?: string | null
  round?: number | null
  // Added 14 Aug 2026 (db/migrations/20260814_competition_tbd_and_time_tbd.sql).
  //
  // ⚠️ OPTIONAL FOR THE SAME REASON AS EVERY FIELD ABOVE IT, and here the
  // fallback genuinely matters: until that migration is applied this arrives
  // `undefined`, and `undefined !== true` means every fixture keeps the timed
  // entry it has today. Deploying this function before the migration therefore
  // changes nothing rather than breaking the feed.
  time_tbd?: boolean | null
  // Added 14 Aug 2026 alongside the tournament-title fix.
  //
  // ⚠️ OPTIONAL, LIKE EVERY FIELD ABOVE IT, AND THE FALLBACK IS DELIBERATE:
  // until the matching migration is applied this arrives `undefined`, and
  // summaryFor() below then falls back to the pre-existing "squad v opponent"
  // — which is what every fixture rendered as yesterday. Deploying this
  // function early therefore changes nothing.
  competition_type?: string | null
  // Added 1 Sep 2026 (Club Diary phase 2 — claude/plans/2026-08-31-club-diary.md).
  // ⚠️ THE THIRD TIME STATE, distinct from time_tbd and never merged with it:
  // time_tbd = "the day is known, the time is not decided" and earns the
  // "Kick-off time to be confirmed" line; all_day = "there is no clock time"
  // and must NOT carry that line, or a kit collection tells every subscribed
  // parent its kick-off is pending. Optional for the same deploy-order reason
  // as every field above: this function may run against a database whose token
  // function does not yet return the column.
  all_day?: boolean | null
  // Also added 1 Sep 2026. Not used in the ICS output today — a diary entry
  // exports like any other event, which is its whole purpose — but carried so
  // labelling diary entries in the feed is a one-line change, not a function
  // replacement plus a hand deploy.
  info_only?: boolean | null
}

/**
 * The fixture's league identity, or '' when it has none.
 *
 * ⚠️ DUPLICATES fixtureLabel() in src/lib/fixtureLabel.js, deliberately and
 * unavoidably — the same standing arrangement locationFor() has with
 * venueLine(). That module is browser JavaScript bundled by Vite; this is a
 * standalone Deno function deployed separately, and there is no shared build.
 * ⚠️ AND THIS ONE MATTERS MORE THAN THE VENUE COPY, because the feed is what a
 * parent sees when they are NOT looking at the app: a fixture labelled ADHQ2
 * on screen and ADHQ1 in their calendar is a family at the wrong pitch.
 * tests/fixture-label.test.js pins the app side.
 *
 * ⚠️ NO LEAGUE TEAM MEANS NO LEAGUE DECORATION — UNLESS THE EVENT IS FILED AS
 * A LEAGUE FIXTURE (competition_type), matching src/lib/fixtureLabel.js since
 * the 1 Sep 2026 league placeholders. A league round whose side nobody has
 * picked yet still shows its round; a round left on a fixture later changed
 * to a friendly stays hidden, because a friendly has no competition_type —
 * stale data, not a label, exactly as before.
 */
function leagueLabel(event: Event): string {
  if (!event.league_team_name) {
    if (event.competition_type === 'league' && event.round !== null && event.round !== undefined) {
      return `Round ${event.round}`
    }
    return ''
  }
  const parts = [event.league_team_name]
  if (event.league_division) parts.push(`Div ${event.league_division}`)
  if (event.round !== null && event.round !== undefined) parts.push(`Round ${event.round}`)
  return parts.join(' · ')
}

/** Matches the app's own wording (src/lib/eventFormat.js). */
function summaryFor(event: Event): string {
  // ⚠️ THE LEAGUE TEAM STANDS IN FOR THE SQUAD, AND ONLY ITS NAME. "ADHQ2 v
  // Dubai Exiles" is the title; the division and round go in DESCRIPTION.
  // A phone truncates SUMMARY hard, and "ADHQ2 · Div B · Round 4 v Dubai
  // Exiles" loses the opponent — the one thing the title exists to carry.
  // ⚠️ THIS IS A DELIBERATE DEPARTURE FROM THE APP'S CHIP, which shows the
  // whole label because it has a chip to itself and no competing text. Same
  // facts, same order, different amount of room. It is NOT a drift: both come
  // from the same three columns and neither invents anything.
  const squad = event.league_team_name ?? event.team_name ?? 'Quins'
  // ⚠️ A TOURNAMENT IS NAMED, NOT OPPOSED — "U16B Contact — Al Ain Tournament",
  // never "U16B Contact v Al Ain Tournament". Mirrors eventTitle() in
  // src/lib/eventFormat.js, and ⚠️ THIS MIRRORING IS THE WHOLE RISK: the app is
  // bundled by Vite and this is a Deno function deployed separately, so a fix
  // applied to one and not the other means a parent reads one thing on screen
  // and another in their calendar. Same standing arrangement leagueLabel() and
  // locationFor() already have.
  //
  // ⚠️ AHEAD OF THE OPPONENT LINE, because rows entered before this fix hold the
  // tournament's name in the opponent column too — the workaround the required
  // opponent field forced. Opponent-first would keep rendering the old string.
  if (event.type === 'match' && event.competition_type === 'tournament' && event.competition) {
    return `${squad} — ${event.competition}`
  }
  if (event.type === 'match') {
    // ⚠️ A LEAGUE PLACEHOLDER IS TITLED BY ITS ROUND (1 Sep 2026) — the app's
    // eventTitle() says "Round 1" for the same fixture, and "U16B v TBC"
    // invents an opposition where the true fact is "Round 1, fixture not out
    // yet". Same competition_type gate as leagueLabel above.
    if (
      !event.opponent &&
      event.competition_type === 'league' &&
      event.round !== null &&
      event.round !== undefined
    ) {
      return `${squad} · Round ${event.round}`
    }
    const opponent = event.opponent ?? 'TBC'
    // ⚠️ STRICT === false. `home` is tri-state since the placeholders — null
    // means "not decided yet" and must not flip the title to opposition-first,
    // which would assert an away fixture nobody has confirmed.
    return event.home === false ? `${opponent} v ${squad}` : `${squad} v ${opponent}`
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

// ⚠️ THE FALLBACK, NOT THE ANSWER. DTEND is required by every calendar
// client, and until 8 Aug 2026 there was no end time in the database at all,
// so one was assumed rather than emitting a zero-length event (which some
// clients render as an unreadable sliver). Deliberately generous for a
// match: nobody leaves a fixture after exactly an hour.
//
// events.ends_at now carries the truth where anyone has entered it, and
// endFor() below prefers it. KEEP THIS ANYWAY — the column is nullable on
// purpose (see the migration: a future external fixture feed may not supply
// an end time, and a NOT NULL there means a hard insert failure on data we
// cannot fix), and every event created before that date has no end either.
// Deleting this guess would mean no DTEND at all for those, which is a
// broken feed rather than an approximate one.
const DURATION_MINUTES: Record<string, number> = { match: 120, training: 90, social: 120 }

/**
 * The event's end: the stored one when there is one, otherwise the per-type
 * guess above.
 *
 * An unparseable or backwards ends_at falls back too. The
 * events_ends_after_starts CHECK should make that impossible — but this runs
 * against whatever the database actually holds, and a DTEND at or before
 * DTSTART is rendered differently and uniformly wrongly across clients,
 * which is the failure the check exists to prevent in the first place.
 */
function endFor(event: Event, start: Date): Date {
  if (event.ends_at) {
    const stored = new Date(event.ends_at)
    if (!Number.isNaN(stored.getTime()) && stored.getTime() > start.getTime()) return stored
  }
  return new Date(start.getTime() + (DURATION_MINUTES[event.type] ?? 90) * 60_000)
}

// ══ ALL-DAY ENTRIES, FOR A FIXTURE WHOSE KICK-OFF IS NOT SET ═══════════════
//
// Jay, 14 Aug 2026. `time_tbd` says the clock time in starts_at is a
// placeholder (the app writes midnight club time). Emitting that as a timed
// entry would put "00:00" in every subscribed parent's calendar — the same
// class of invented value as the per-type duration guess above, except this one
// would be flatly wrong rather than approximate.
//
// ⚠️ THE ZONE IS NOT OPTIONAL HERE. `starts_at` is UTC and the club is UTC+4, so
// the placeholder midnight is stored as 20:00 the PREVIOUS day. Formatting the
// instant in UTC would put every TBD fixture on the wrong date — a day early,
// silently, for every reader. Asia/Dubai is the same CLUB_TIME_ZONE the app
// pins in src/lib/eventFormat.js and for the same reason.
const CLUB_TIME_ZONE = 'Asia/Dubai'

/** The club's calendar date for an instant, as ICS's DATE value: "20260815". */
function icsDate(value: Date): string {
  // en-CA renders ISO-ordered YYYY-MM-DD, which is exactly the shape wanted
  // once the separators come out. The LOCALE is pinned here — unlike the app's
  // display formatters, which take the reader's — because this is a wire
  // format, not something a human reads.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(value)
    .replace(/-/g, '')
}

/**
 * The day after an ICS DATE, because RFC 5545 §3.6.1 makes DTEND EXCLUSIVE for
 * a DATE-valued event: a one-day entry on the 15th is DTSTART 20260815 /
 * DTEND 20260816. Omitting DTEND, or repeating DTSTART, gives a zero-length
 * all-day event that clients render inconsistently and some drop entirely.
 *
 * ⚠️ DONE IN CALENDAR ARITHMETIC, NOT BY ADDING 86,400,000ms TO THE INSTANT.
 * The instant is 20:00 UTC on the previous day, so adding a day to it and
 * re-formatting would work by luck; Date.UTC on the parsed parts rolls the
 * month and the year correctly and cannot be knocked out by an offset change.
 */
function icsDatePlusOneDay(yyyymmdd: string): string {
  const year = Number(yyyymmdd.slice(0, 4))
  const month = Number(yyyymmdd.slice(4, 6))
  const day = Number(yyyymmdd.slice(6, 8))
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`
}

function toVEvent(event: Event, stamp: string): string[] {
  const start = new Date(event.starts_at)
  const end = endFor(event, start)
  // ⚠️ STRICT === true, matching src/lib/eventFormat.js's isTimeTbd. An
  // `undefined` from a pre-migration feed function must read as "has a time",
  // which is what every fixture in the database was before the column existed.
  //
  // ⚠️ TWO WAYS TO BE A VALUE=DATE ENTRY, ONE SENTENCE APART. time_tbd earns
  // the "Kick-off time to be confirmed" DESCRIPTION line below; a genuinely
  // all-day event (event.all_day) must NOT — printing it would claim the time
  // is undecided when there is no time, the inverse of the mistake that line
  // exists to prevent. `timeTbd` is therefore kept separate from `allDay`
  // rather than folded in.
  const timeTbd = event.time_tbd === true
  const isAllDayEvent = event.all_day === true
  const allDay = isAllDayEvent || timeTbd

  const description: string[] = []
  // ⚠️ FIRST, AHEAD OF THE COMPETITION. DESCRIPTION is the line a phone
  // truncates from the right, and "which of our teams, in which division, in
  // which round" is the fact a parent cannot recover from anywhere else in the
  // entry — the SUMMARY carries only the team's name. The competition ("UAE
  // Youth League") is the more guessable of the two.
  // ⚠️ EMPTY STRING WHEN THE FIXTURE IS NOT A LEAGUE MATCH, so nothing is
  // pushed and the description is byte-identical to what it was before this
  // change for every friendly, training and social.
  // ⚠️ AHEAD OF EVERYTHING, INCLUDING THE LEAGUE LABEL. An all-day entry with
  // no explanation reads as "this lasts all day", which is a different and
  // wrong claim — the day is known and the kick-off is not. DESCRIPTION
  // truncates from the right on a phone, so this has to be the first thing in
  // it or it is the first thing lost.
  // ⚠️ timeTbd, NOT allDay — an all-day event has no time to confirm.
  if (timeTbd) description.push('Kick-off time to be confirmed')
  const league = leagueLabel(event)
  if (league) description.push(league)
  // ⚠️ SKIPPED WHEN THE SUMMARY ALREADY IS THE TOURNAMENT NAME, or the entry
  // reads "U16B Contact — Al Ain Tournament" with "Al Ain Tournament" repeated
  // directly underneath it.
  if (event.competition && !(event.type === 'match' && event.competition_type === 'tournament')) {
    description.push(event.competition)
  }
  // ⚠️ BOOLEANS ONLY. `home` is tri-state since the 1 Sep 2026 placeholders:
  // null means "not decided yet", and the old `event.home ? 'Home' : 'Away'`
  // would have printed Away into a subscribed calendar for it — an invented
  // fact, the exact class this feed keeps refusing to emit.
  if (event.type === 'match' && event.opponent && typeof event.home === 'boolean') {
    description.push(event.home ? 'Home' : 'Away')
  }
  // Last, so the fixed facts (competition, home/away) stay at the front of
  // the line a phone truncates. escapeText() below handles the newlines a
  // coach may have typed — DESCRIPTION is a single ICS content line, and a
  // raw newline inside it truncates the property in strict clients.
  if (event.notes) description.push(event.notes)

  const lines = [
    'BEGIN:VEVENT',
    // Stable across refreshes: the client updates the existing entry instead
    // of creating a duplicate every time the feed is polled.
    // ⚠️ THE DOMAIN PART IS FROZEN ON THE RETIRED adhjrt ALIAS, DELIBERATELY
    // (ruled 30 Aug 2026, Grok item 16). A UID is an OPAQUE IDENTIFIER — RFC
    // 5545 does not care that the domain no longer resolves, but every
    // subscribed client keys the event's identity on it: change it and the
    // whole season duplicates in 13 families' calendars, with the old copies
    // never updating or cancelling again. A dead string nobody sees beats
    // that. Do not "fix" this to the live origin.
    `UID:${event.id}@quins.adhjrt.com`,
    `DTSTAMP:${stamp}`,
    // ⚠️ `;VALUE=DATE` IS WHAT MAKES IT ALL-DAY, and both properties must carry
    // it — a DATE DTSTART with a DATE-TIME DTEND is invalid and clients disagree
    // wildly about how to recover from it.
    // ⚠️ THE SPAN: a multi-day all-day event ends the day AFTER its last day,
    // because ICS's DATE-valued DTEND is EXCLUSIVE (RFC 5545 §3.6.1). A kit
    // collection on 17–18 Sep is DTSTART:20260917 / DTEND:20260919 — the +1 on
    // ends_at's club date is not an off-by-one, it IS the format. Dropping it
    // shows a one-day event; applying it to the last day directly shows three.
    // Both look plausible, which is why the boundary is written longhand in
    // tests/calendar-all-day.test.js.
    // ⚠️ ends_at is only consulted for a genuinely all-day event. A time_tbd
    // fixture cannot carry one (events_no_end_when_time_tbd), so its DTEND
    // stays start-plus-one-day exactly as before.
    ...(allDay
      ? [
          `DTSTART;VALUE=DATE:${icsDate(start)}`,
          `DTEND;VALUE=DATE:${
            isAllDayEvent && event.ends_at
              ? icsDatePlusOneDay(icsDate(new Date(event.ends_at)))
              : icsDatePlusOneDay(icsDate(start))
          }`,
        ]
      : [`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`]),
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
