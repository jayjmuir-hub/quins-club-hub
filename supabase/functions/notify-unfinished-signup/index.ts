// The follow-up for somebody who created a login and never finished.
//
// WHY THIS EXISTS. Jay, 20 Aug 2026, asked "will they be nudged again?" and the
// honest answer was: only if they choose to come back. Nothing chased them.
// Measured the same day: of the accounts with no access, several had confirmed
// their email, signed in, and stopped — two had even given their name, because
// the sign-up flow saves that before it asks what you want.
//
// ⚠️ THE DATABASE DECIDES WHO, NOT THIS FUNCTION. `private.send_signup_nudges()`
// claims the people it is about to chase into `public.signup_nudges` FIRST and
// posts the claimed list here. That order is what makes a double-send
// impossible: if this call fails, the rows are already claimed and nobody is
// mailed twice. The cost is the opposite failure — a nudge recorded that never
// arrived — and for a reminder that is the cheaper of the two. The same
// reasoning, and the same order, as the availability nudge.
//
// ⚠️ TWO EMAILS, EVER. One at 24 hours, one at seven days, then silence. The
// cap is enforced by the PRIMARY KEY on (profile_id, nudge_no), not by a
// counter this function keeps — a counter would reset the first time somebody
// re-ran it by hand.
//
// ⚠️ IT REUSES `approval_notify_secret` RATHER THAN INTRODUCING A NEW ONE. A
// second secret is a second thing to rotate, and this endpoint is reachable by
// exactly the same caller as the approval notifier: the database.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// The cap is a brake, not a quota: the club has ~200 members and the nudge
// candidates are a trickle. A request naming more ids than this is not a
// legitimate cron tick.
const MAX_BATCH = 100

/**
 * Constant-time compare — HASH BOTH SIDES first (Grok item 15, 30 Aug 2026):
 * the old early return on a length mismatch leaked the secret's length.
 */
async function secretMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const ua = new Uint8Array(a)
  const ub = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < ua.length; i += 1) diff |= ua[i] ^ ub[i]
  return diff === 0
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  const body: Record<string, unknown> = { from: MAIL_FROM, to: [to], subject, html, text }
  if (REPLY_TO) body.reply_to = REPLY_TO

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

/**
 * ⚠️ THE WORDING IS NOT "YOUR REQUEST WAS REJECTED", AND THE DIFFERENCE MATTERS.
 * These people did nothing wrong — they were interrupted. The mail says what is
 * missing, how long it takes, and nothing about approval, because an email that
 * reads as a refusal gets a reply to the club rather than a click.
 */
function compose(firstName: string, nudgeNo: number) {
  const hi = firstName ? `Hi ${firstName},` : 'Hi,'
  const second = nudgeNo >= 2

  const subject = second
    ? 'Still need a hand finishing at the Quins?'
    : 'One more step to finish setting up'

  const lead = second
    ? 'We noticed your Quins Club Hub account is still waiting on one last step. This is the last reminder we will send.'
    : 'Thanks for creating your Quins Club Hub account. There is one step left before the club can give you access.'

  const text = [
    hi,
    '',
    lead,
    '',
    'We still need to know who you are at the club — whether you have a child playing, which squad they are in, or whether you coach or help out. It takes about a minute.',
    '',
    `Finish here: ${APP_URL}`,
    '',
    'If you did not mean to sign up, you can ignore this and we will not email you again.',
    '',
    'Abu Dhabi Harlequins',
  ].join('\n')

  const html = `
    <p>${escapeHtml(hi)}</p>
    <p>${escapeHtml(lead)}</p>
    <p>We still need to know who you are at the club &mdash; whether you have a child playing,
       which squad they are in, or whether you coach or help out. It takes about a minute.</p>
    <p><a href="${escapeHtml(APP_URL)}"
          style="display:inline-block;background:#e11b22;color:#ffffff;text-decoration:none;
                 padding:11px 18px;border-radius:8px;font-weight:700">Finish setting up</a></p>
    <p style="color:#565c67;font-size:13px">If you did not mean to sign up, you can ignore this
       and we will not email you again.</p>
    <p style="color:#565c67;font-size:13px">Abu Dhabi Harlequins</p>`

  return { subject, html, text }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!NOTIFY_SECRET || !(await secretMatches(presented, NOTIFY_SECRET))) {
    return new Response('unauthorised', { status: 401 })
  }

  // ⚠️ IDS ONLY, NEVER ADDRESSES (Grok item 10, 30 Aug 2026). This function
  // used to mail whatever addresses the body carried — with the shared secret
  // that was an open relay wearing club branding. It now accepts profile ids,
  // loads email/first_name from the database itself (the notify-welcome
  // pattern), and caps the batch. A body carrying an `email` key is refused
  // outright rather than quietly ignored, so a stale caller fails loudly.
  let people: Array<{ profile_id?: string; nudge_no?: number }> = []
  try {
    const body = await request.json()
    people = Array.isArray(body?.people) ? body.people : []
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (people.some((p) => 'email' in (p ?? {}))) {
    return new Response('bad request: this endpoint takes profile ids, not addresses', { status: 400 })
  }
  if (people.length > MAX_BATCH) {
    return new Response('bad request: batch too large', { status: 400 })
  }

  const ids = people
    .map((p) => String(p?.profile_id ?? '').trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const nudgeNoById = new Map(
    people
      .filter((p) => p?.profile_id)
      .map((p) => [String(p.profile_id), Number(p?.nudge_no ?? 1)]),
  )

  let rows: Array<{ id: string; email: string | null; first_name: string | null }> = []
  if (ids.length > 0) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,email,first_name`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    )
    if (!response.ok) {
      return new Response(`profiles read failed (${response.status})`, { status: 502 })
    }
    rows = await response.json()
  }

  // ⚠️ ONE FAILURE MUST NOT SWALLOW THE REST. Every address is independent, so a
  // single bounce or a malformed row would otherwise cost everybody behind it
  // their reminder — and the database has already claimed them all, so they
  // would never be retried.
  let sent = 0
  const failures: string[] = []
  for (const row of rows) {
    const to = String(row?.email ?? '').trim()
    if (!to) continue
    const { subject, html, text } = compose(
      String(row?.first_name ?? '').trim(),
      nudgeNoById.get(row.id) ?? 1,
    )
    try {
      await sendMail(to, subject, html, text)
      sent += 1
    } catch (error) {
      failures.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return new Response(JSON.stringify({ sent, attempted: ids.length, failures }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
