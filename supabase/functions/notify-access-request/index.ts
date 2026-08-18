// Somebody signed in and asked for access. Tell the admins who can answer.
//
// THE GAP THIS CLOSES: "Nobody is emailed when an access REQUEST arrives."
// A person signs up, lands on a screen that says an admin will be in touch,
// and then nothing happens until somebody happens to open /accounts.
//
// !! NOT TO BE CONFUSED WITH notify-approval. That one fires for a pending
// MEMBERSHIP - somebody who already has a squad attached and is waiting to be
// approved into it. This one fires for an ACCESS REQUEST - somebody with no
// membership at all, asking to be let in.
//
// !! MUST be deployed with verify_jwt: false - Postgres calls it with no user
// JWT. It is therefore PUBLICLY REACHABLE and the shared secret is the only
// gate. It FAILS CLOSED: unset secret means every request is refused.
//
// !! THE BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one request id;
// every name and address below is read back here with the service role.
//
// !! WHO GETS IT: EVERY ACTIVE ADMIN, measured not assumed. There is no
// `accounts` admin right - acting on a request means reading the waiting list
// (private.is_admin_anywhere) and granting a membership (private.is_admin),
// and both are plain admin.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
// !! REUSES THE APPROVAL SECRET DELIBERATELY. Same trust domain, same caller.
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

/** Longest stranger-written note this will put in an admin's inbox. */
const NOTE_LIMIT = 400

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// !! CONSTANT TIME - a plain === on a secret leaks its length and, in
// principle, its prefix through timing.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(a)
  const bb = enc.encode(b)
  if (ba.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i]
  return diff === 0
}

async function db(path: string): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) {
    throw new Error(`db read failed (${response.status}) on ${path}: ${await response.text()}`)
  }
  return await response.json()
}

async function sendMail(bcc: string[], subject: string, html: string, text: string): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    text,
    // `to` is the club, recipients in bcc - addressing it to one admin would
    // single them out, and bcc keeps volunteers' addresses off each other's
    // screens.
    to: [MAIL_FROM],
    bcc,
    subject,
    html,
  }
  if (REPLY_TO) body.reply_to = REPLY_TO

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    //   401 -> wrong or revoked RESEND_API_KEY
    //   403 -> MAIL_FROM domain not verified
    //   429 -> rate or allowance limit. !! NOT the old 100/day free cap - the
    //          account is on Resend Pro since 13 Aug 2026.
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

function shell(title: string, bodyHtml: string, ctaPath: string, ctaLabel: string, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <a href="${escapeHtml(APP_URL)}${ctaPath}"
         style="display:inline-block;background:#8e1526;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">
        ${escapeHtml(ctaLabel)}
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;line-height:1.5;color:#8a8582;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`
}

function line(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">${text}</p>`
}
function quiet(text: string): string {
  return `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">${text}</p>`
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is not set - refusing every request.')
    return new Response('not configured', { status: 503 })
  }
  if (!timingSafeEqual(request.headers.get('x-approval-secret') ?? '', NOTIFY_SECRET)) {
    return new Response('unauthorised', { status: 401 })
  }

  let requestId = ''
  try {
    const body = await request.json()
    requestId = String(body?.access_request_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!requestId) return new Response('bad request', { status: 400 })

  try {
    // !! THE CONSTRAINT NAME IS MANDATORY, NOT STYLE. access_requests has TWO
    // foreign keys to profiles - profile_id and decided_by - so a bare
    // `profiles(...)` embed is ambiguous and PostgREST REFUSES the whole query.
    // Caught live on 12 Aug 2026: the first version shipped without it, and the
    // only symptom was this function returning 500 and no email ever arriving.
    // notify-pitch-request carries the identical fix for the identical reason.
    const rows = await db(
      `access_requests?id=eq.${encodeURIComponent(requestId)}` +
        '&select=id,status,note,created_at,profiles!access_requests_profile_id_fkey(full_name,email)',
    )
    const req = rows[0]
    if (!req) {
      console.error(`access request ${requestId} not found`)
      return new Response('not found', { status: 404 })
    }

    // Only the arrival is worth an email. A dismissal is an admin telling
    // themselves something they just did.
    if (req.status !== 'pending') {
      return new Response(JSON.stringify({ skipped: req.status }), { status: 200 })
    }

    // !! NO club_id ON THIS TABLE. An access request comes from somebody with
    // no membership, so there is nothing to derive a club from - the
    // single-club assumption is doing the work, same as in is_admin_anywhere().
    //
    // !! SUPER ADMINS ONLY, from 18 Aug 2026. Jay: "we don't need to email
    //    every single admin every time". This was every active admin - five
    //    people, of whom three are super. The other two keep every power they
    //    had; they are simply not told, because an access request is a
    //    club-level decision and the super admins are the people who own it.
    //
    // !! NO SQUAD HALF HERE, unlike notify-approval. An access request has no
    //    team_id to narrow by - see the note above about there being no
    //    club_id either - so there is no head coach or manager to add.
    const admins = await db(
      'memberships?is_super=is.true&status=eq.active&select=profiles(email)',
    )

    const recipients = [...new Set(
      admins
        .map((row: any) => row?.profiles?.email)
        .filter((e: unknown): e is string => typeof e === 'string' && e.includes('@')),
    )]

    if (recipients.length === 0) {
      // !! READS "no active SUPER admins" NOW. Before 18 Aug 2026 this branch
      //    meant the club had no admin at all; it now fires while ordinary
      //    admins may still exist, so the log line has to say which.
      console.error(`no active super admins - nobody will be told about request ${requestId}`)
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const who = req.profiles?.full_name?.trim() || req.profiles?.email || 'Somebody'
    const email = req.profiles?.email ?? ''

    // !! TRUNCATED, NOT JUST ESCAPED. This is the one field written by an
    // account the club has not approved.
    const raw = typeof req.note === 'string' ? req.note.trim() : ''
    const trimmed = raw.length > NOTE_LIMIT ? `${raw.slice(0, NOTE_LIMIT)}…` : raw
    const noteHtml = trimmed ? `<br><em>${escapeHtml(trimmed)}</em>` : ''

    await sendMail(
      recipients,
      `Access requested: ${who}`,
      shell(
        'Somebody is asking to join',
        line(
          `<strong>${escapeHtml(who)}</strong>${email ? ` (${escapeHtml(email)})` : ''} has signed in and asked for access to the Club Hub.${noteHtml}`,
        ) +
          quiet('They can sign in but cannot see anything yet. Give them access, or dismiss them, on the Accounts screen.'),
        '/accounts',
        'Open Accounts',
        "You're getting this because you're an admin for the club.",
      ),
      [
        'ABU DHABI HARLEQUINS',
        '',
        'Somebody is asking to join',
        '',
        `${who}${email ? ` (${email})` : ''} has signed in and asked for access to the Club Hub.`,
        trimmed ? `\n"${trimmed}"` : '',
        '',
        'They can sign in but cannot see anything yet. Give them access, or',
        'dismiss them, on the Accounts screen.',
        '',
        'Open Accounts:',
        `${APP_URL}/accounts`,
        '',
        "You're getting this because you're an admin for the club.",
      ].filter(Boolean).join('\n'),
    )

    return new Response(JSON.stringify({ sent: recipients.length }), { status: 200 })
  } catch (error) {
    // !! 500 IS THE END OF IT. pg_net does not retry and nothing waits on this
    // response. The log line is the ONLY record.
    console.error('notify-access-request failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
