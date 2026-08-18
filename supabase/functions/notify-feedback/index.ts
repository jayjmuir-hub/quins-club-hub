// Tells the club that somebody reported a problem or sent a suggestion, and
// tells the reporter it arrived.
//
// Fired by an AFTER INSERT trigger on public.feedback.
// Design: claude/plans/2026-08-18-help-and-feedback.md.
//
// == ⚠️ THE SCREEN IS THE RECORD. THIS IS A PROMPT TO GO AND LOOK ==========
//
// An earlier draft of the plan made the inbox the triage tool and had no admin
// screen at all. Jay, 18 Aug 2026: "keep everything in one place instead of
// emails". So `Reply-To` still points at the reporter, because answering
// somebody should be one tap — but the row on /admin/needs-attention is the
// record, and this mail failing costs promptness, not the report.
//
// That is not a hypothetical: a brand-new M365 tenant with no sending history
// junked the first two messages ever sent to help@ on 18 Aug 2026. **Check the
// junk folder before concluding this function is broken.**
//
// == WHY A TRIGGER AND NOT A CALL FROM THE APP ============================
//
// Same reasoning as notify-approval: a notification the CLIENT fires is one
// the client can skip. Not a security hole — the row is already written — but
// it would make "the club is always told" depend on a browser finishing a
// second request from a phone on pitch-side mobile data.
//
// !! IT MUST NEVER BE ABLE TO FAIL THE INSERT. pg_net.http_post queues the
// request and returns immediately; it does not wait and cannot raise into the
// caller's transaction. A dead endpoint or an expired Resend key costs an
// email and nothing else — the report is still filed and still on the screen.
//
// == SECURITY ==============================================================
//
// !! MUST be deployed with verify_jwt: false. Postgres calls it with no user
// JWT; with verification on, the gateway rejects every call before this code
// runs and no mail is ever sent — silently, because pg_net does not care what
// came back. Same trap send-email documents.
//
// It is therefore PUBLICLY REACHABLE, and the only thing between the internet
// and this endpoint is the shared secret below. It FAILS CLOSED: if
// FEEDBACK_NOTIFY_SECRET is unset it refuses every request rather than sending
// unauthenticated mail.
//
// !! THE REQUEST BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one
// thing — a feedback id — and everything shown in the mail is read back from
// the database with the service role. A caller who guesses the secret can make
// the club re-send a notification about a row that already exists; it cannot
// make the club send arbitrary text to arbitrary people.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''

// ⚠️ THE SHARED NOTIFY SECRET, NOT ONE OF ITS OWN — AND THIS FILE INVENTED
// `FEEDBACK_NOTIFY_SECRET` FIRST, WHICH WAS WRONG.
//
// `notify-approval`, `notify-invite`, `notify-pitch-request` and the
// photo-backup cron all authenticate with `approval_notify_secret` and the
// header `x-approval-secret`. Edge Function secrets are PROJECT-WIDE, so this
// value is already present here — a new name would have meant generating a
// credential, pasting it in two places and recording it nowhere, to gain
// nothing. One more endpoint behind the existing gate is the house pattern
// (`claude/runbooks/player-photo-backup.md` derives its URL the same way).
//
// ⚠️ The trade is real and already accepted: one leaked secret reaches every
// notify endpoint. Rotating it means changing it everywhere at once. That was
// the decision when the third caller adopted it, not a new one taken here.
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Where reports are read. Not a link to the row — there is no such URL — but
// to the screen that lists everything waiting.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

// The club's help mailbox. A shared mailbox in the M365 tenant, created
// 18 Aug 2026 — see claude/runbooks/m365-add-alias-to-shared-mailbox.md.
const HELP_MAILBOX = Deno.env.get('FEEDBACK_MAILBOX') ?? 'help@adhquins-clubhub.com'

/* ---------------- helpers ---------------- */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// !! CONSTANT TIME. A plain `a === b` on a secret leaks its length and, in
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

// PostgREST with the service role. RLS does not apply, which is the point:
// this needs the reporter's email address, which no signed-in user may read.
async function db(path: string): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) {
    throw new Error(`db read failed (${response.status}) on ${path}: ${await response.text()}`)
  }
  return await response.json()
}

async function sendMail(opts: {
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    // !! BOTH PARTS, ALWAYS. HTML-only mail scores worse with filters, and
    // this one is already landing in a junk folder on a young tenant.
    text: opts.text,
  }
  if (opts.replyTo) body.reply_to = opts.replyTo

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`resend failed (${response.status}): ${await response.text()}`)
  }
}

/** `QCH-0041`. Must match feedbackRef() in src/data/feedback.js. */
function ref(n: unknown): string {
  return `QCH-${String(n ?? '').padStart(4, '0')}`
}

const KIND_WORD: Record<string, string> = { bug: 'Problem', idea: 'Suggestion' }

/* ---------------- handler ---------------- */

Deno.serve(async (request) => {
  // Fails closed. An unset secret means refuse, never "allow everything".
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is unset — refusing.')
    return new Response('not configured', { status: 503 })
  }

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!timingSafeEqual(presented, NOTIFY_SECRET)) {
    return new Response('forbidden', { status: 403 })
  }

  let feedbackId = ''
  try {
    const payload = await request.json()
    feedbackId = String(payload?.feedback_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!feedbackId) return new Response('bad request', { status: 400 })

  try {
    // Everything shown below is read back here, never taken from the caller.
    const rows = await db(
      `feedback?id=eq.${encodeURIComponent(feedbackId)}&select=` +
        'ref,kind,body,route,context,created_at,profiles!feedback_submitted_by_fkey(full_name,email)',
    )
    const row = rows?.[0]
    if (!row) return new Response('not found', { status: 404 })

    const reference = ref(row.ref)
    const kind = KIND_WORD[row.kind] ?? 'Report'
    // ⚠️ THE REPORTER'S NAME IS IN THE ADMIN MAIL — Jay asked for it
    // explicitly, 18 Aug 2026. Knowing who reported something is most of
    // knowing what they meant.
    const who = row.profiles?.full_name ?? 'A member'
    const reporterEmail: string | undefined = row.profiles?.email ?? undefined
    const context = row.context ?? {}
    const where = row.route ?? 'unknown screen'

    const facts: Array<[string, unknown]> = [
      ['Who', who],
      ['Screen', where],
      ['Device', context.user_agent],
      ['Viewport', context.viewport],
      ['Installed app', context.standalone === true ? 'yes' : 'no'],
      ['App version', context.app_version],
      ['Reported', row.created_at],
    ]

    const factsHtml = facts
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
      .join('')
    const factsText = facts
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n')

    // ── to the club ──────────────────────────────────────────────────────
    //
    // ⚠️ Reply-To is the REPORTER, so answering somebody is one tap from the
    // notification. It is a convenience, not the design: the record is the row
    // on /admin/needs-attention.
    await sendMail({
      to: [HELP_MAILBOX],
      replyTo: reporterEmail,
      subject: `${kind} on ${where} — ${reference}`,
      html:
        `<p><strong>${escapeHtml(who)}</strong> reported this from <strong>${escapeHtml(where)}</strong>:</p>` +
        `<blockquote>${escapeHtml(row.body)}</blockquote>` +
        `<table>${factsHtml}</table>` +
        `<p><a href="${APP_URL}/admin/needs-attention">Open it in the app</a> — that is where the status lives.</p>`,
      text:
        `${who} reported this from ${where}:\n\n${row.body}\n\n${factsText}\n\n` +
        `Open it in the app: ${APP_URL}/admin/needs-attention\n` +
        `That is where the status lives; this email is only a prompt.`,
    })

    // ── back to the reporter ─────────────────────────────────────────────
    //
    // ⚠️ SENT SECOND, AND ITS FAILURE MUST NOT LOSE THE FIRST. If this throws
    // after the club mail already went, the catch below returns 500 and pg_net
    // discards it — the club has still been told, which is the half that
    // matters. Do not "fix" this by moving the ack first.
    if (reporterEmail) {
      await sendMail({
        to: [reporterEmail],
        replyTo: HELP_MAILBOX,
        subject: `Thanks — we got it (${reference})`,
        html:
          `<p>Thanks for telling us. Somebody at the club will look at it.</p>` +
          `<p>Your reference is <strong>${escapeHtml(reference)}</strong>, and this is what you sent:</p>` +
          `<blockquote>${escapeHtml(row.body)}</blockquote>` +
          `<p>You can reply to this email if you remember anything else.</p>`,
        text:
          `Thanks for telling us. Somebody at the club will look at it.\n\n` +
          `Your reference is ${reference}, and this is what you sent:\n\n${row.body}\n\n` +
          `You can reply to this email if you remember anything else.`,
      })
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    // pg_net never reads this. It is here for the function logs, which are the
    // only place a failure is visible at all.
    console.error('notify-feedback failed:', error)
    return new Response('error', { status: 500 })
  }
})
