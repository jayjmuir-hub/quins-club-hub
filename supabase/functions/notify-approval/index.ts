// Tells coaches, team managers and admins that somebody is waiting to be
// approved. Fired by an AFTER INSERT trigger on public.memberships whenever a
// row lands with status = 'pending'.
//
// Jay, 9 Aug 2026: "need emails alerting them and admins of approvals waiting",
// immediate rather than a daily digest.
//
// ══ WHY A TRIGGER AND NOT A CALL FROM THE APP ═══════════════════════════
// The registration itself is a SECURITY DEFINER function
// (public.register_my_player) reachable by any signed-in stranger with a
// confirmed email. A notification the CLIENT fires is one the client can skip
// — not a security hole, but it would make "the club is always told" a claim
// that depends on the browser finishing a second request. The trigger is on
// the row.
//
// ⚠️ IT MUST NEVER BE ABLE TO FAIL THE REGISTRATION. pg_net.http_post queues
// the request and returns an id immediately; it does not wait for a response
// and cannot raise into the caller's transaction. So a dead endpoint, an
// expired Resend key or a 500 in here costs an email and nothing else — the
// parent's player is still registered and still shows in the queue on screen.
// That ordering is deliberate: the SCREEN is the source of truth, the email is
// a prompt to go and look at it.
//
// ══ SECURITY ════════════════════════════════════════════════════════════
// ⚠️ MUST be deployed with verify_jwt: false. Postgres calls it with no user
// JWT; with verification on, the gateway rejects every call before this code
// runs and no email is ever sent — silently, because pg_net does not care what
// came back. The same trap the send-email function documents.
//
// It is therefore PUBLICLY REACHABLE, and the only thing between the internet
// and this endpoint is the shared secret below. It FAILS CLOSED: if
// APPROVAL_NOTIFY_SECRET is unset the function refuses every request rather
// than sending unauthenticated mail.
//
// ⚠️ THE REQUEST BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one
// membership id and nothing else. Every name, address and squad in the email
// is read back from the database here, with the service role. A body carrying
// its own "send this text to these addresses" would be an open relay wearing
// a shared secret.
//
// ══ THE VOLUME PROBLEM, STATED RATHER THAN DISCOVERED LATER ═════════════
// Resend's free tier is 100 emails/day, 3,000/month.
//
// ONE Resend call per registration, with every recipient in `bcc`. Not one per
// recipient: with two admins and two coaches on a squad that would be four
// emails per registration, and a 100-player onboarding weekend would be 400 —
// four times the daily cap, and the failures would land on whoever registered
// last. Bcc'd, the same weekend costs 100 sends, which is exactly the cap.
//
// ⚠️ SO A BIG ONBOARDING DAY CAN STILL HIT IT. A 429 from Resend is logged and
// swallowed; the registration is unaffected and the queue on the Accounts
// screen is unaffected. If the club onboards in one weekend, either stagger it
// or move Resend to a paid tier first. This is a known ceiling, not a bug to
// be discovered at email 101.
//
// bcc also means recipients cannot see each other's addresses, which is the
// right default for a mail to a mixed group of volunteers.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Where the email sends people. Not a link to the pending row — there is no
// such URL — but to the screen that lists everything waiting.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

/* ---------------- helpers ---------------- */

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ⚠️ CONSTANT TIME. A plain `a === b` on a secret leaks its length and, in
// principle, its prefix through timing. The cost here is a few microseconds.
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
// this needs the admins' and coaches' email addresses, and no signed-in user
// is allowed to read those in bulk.
async function db(path: string): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) {
    throw new Error(`db read failed (${response.status}) on ${path}: ${await response.text()}`)
  }
  return await response.json()
}

async function sendMail(bcc: string[], subject: string, html: string): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    // ⚠️ `to` IS THE SENDER, recipients are in bcc. Resend requires a `to`,
    // and putting the first coach there would single them out as the person
    // being asked while everyone else was merely copied. Addressing it to the
    // club makes the ask collective, which is what it is.
    to: [MAIL_FROM],
    bcc,
    subject,
    html,
  }
  if (REPLY_TO) body.reply_to = REPLY_TO

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    //   401 -> wrong or revoked RESEND_API_KEY
    //   403 -> MAIL_FROM's domain is not verified. It must be on
    //          send.adhquins-clubhub.com, NOT the root domain.
    //   429 -> free-tier limit: 100/day, 3,000/month. See the volume note at
    //          the top of this file — this is a known ceiling.
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

function template(playerName: string, teamName: string, parentName: string, parentEmail: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Someone is waiting to be approved</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
        <strong>${escapeHtml(parentName)}</strong> has registered
        <strong>${escapeHtml(playerName)}</strong> in <strong>${escapeHtml(teamName)}</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        Until someone approves them they can see their own child and the squad's
        fixtures — enough to set availability — and nothing else. Not the squad
        roster, not other families' contact details.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        Registered with ${escapeHtml(parentEmail)}
      </p>
      <a href="${escapeHtml(APP_URL)}/approvals"
         style="display:inline-block;background:#8e1526;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">
        Review it in the Club Hub
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;line-height:1.5;color:#8a8582;">
        You're getting this because you're a coach, team manager or admin for
        this age group.
      </p>
    </div>
  </body>
</html>`
}

/* ---------------- entry point ---------------- */

Deno.serve(async (request: Request): Promise<Response> => {
  // Fail closed. An unset secret means every request is refused, rather than
  // the endpoint quietly becoming open to the internet.
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is not set — refusing every request.')
    return new Response('not configured', { status: 503 })
  }

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!timingSafeEqual(presented, NOTIFY_SECRET)) {
    return new Response('unauthorised', { status: 401 })
  }

  let membershipId = ''
  try {
    const body = await request.json()
    membershipId = String(body?.membership_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!membershipId) return new Response('bad request', { status: 400 })

  try {
    // ── The registration. Everything below is read here, not taken from the
    //    request body — see the security note at the top.
    const rows = await db(
      `memberships?id=eq.${encodeURIComponent(membershipId)}` +
        '&select=id,status,club_id,team_id,profiles(full_name,email),players(full_name),teams(name)',
    )
    const membership = rows[0]
    if (!membership) {
      console.error(`membership ${membershipId} not found`)
      return new Response('not found', { status: 404 })
    }

    // ⚠️ RE-CHECKED, not assumed from the trigger's WHEN clause. An approval
    // racing the notification is unlikely but the email would be actively
    // wrong — telling four volunteers to go and action something that has
    // already been actioned.
    if (membership.status !== 'pending') {
      return new Response(JSON.stringify({ skipped: 'no longer pending' }), { status: 200 })
    }

    // ── Who to tell: every admin in the club, plus the coaches and team
    //    managers of THIS squad. Deliberately the same list as
    //    private.can_approve_team — the people who can act on it.
    //
    // ⚠️ NOT medic, matching the approval rule. A medic cannot approve, so an
    // email asking them to would be an instruction they cannot follow.
    const [admins, squadStaff] = await Promise.all([
      db(
        `memberships?club_id=eq.${encodeURIComponent(membership.club_id)}` +
          '&role=eq.admin&status=eq.active&select=profiles(email)',
      ),
      db(
        `memberships?team_id=eq.${encodeURIComponent(membership.team_id)}` +
          '&role=in.(coach,manager)&status=eq.active&select=profiles(email)',
      ),
    ])

    const recipients = [...new Set(
      [...admins, ...squadStaff]
        .map((row: any) => row?.profiles?.email)
        .filter((email: unknown): email is string => typeof email === 'string' && email.includes('@')),
    )]

    if (recipients.length === 0) {
      // Not an error: a club with no admin and no coach on that squad is a
      // configuration problem, and sending nothing is the correct outcome.
      // Logged because it means somebody's registration will sit unseen.
      console.error(`no recipients for membership ${membershipId} — nobody will be told`)
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    await sendMail(
      recipients,
      `Approval needed: ${membership.players?.full_name ?? 'a new player'} in ${membership.teams?.name ?? 'a squad'}`,
      template(
        membership.players?.full_name ?? 'A new player',
        membership.teams?.name ?? 'their age group',
        membership.profiles?.full_name?.trim() || 'Someone',
        membership.profiles?.email ?? 'an address we could not read',
      ),
    )

    return new Response(JSON.stringify({ sent: recipients.length }), { status: 200 })
  } catch (error) {
    // ⚠️ 500 IS THE END OF IT. pg_net does not retry and nothing is waiting on
    // this response, so the only consequence is that no email went out. The
    // log line is the ONLY record — read it at Edge Functions → notify-approval
    // → Logs (the Logs tab, not Invocations; the MCP get_logs query shows only
    // the HTTP access log, which is how a 500 went undiagnosed for an hour on
    // 5 Aug).
    console.error('notify-approval failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
