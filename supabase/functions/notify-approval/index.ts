// Tells coaches, team managers and admins that somebody is waiting to be
// approved. Fired by an AFTER INSERT trigger on public.memberships whenever a
// row lands with status = 'pending'.
//
// Jay, 9 Aug 2026: "need emails alerting them and admins of approvals waiting",
// immediate rather than a daily digest.
//
// == WHY A TRIGGER AND NOT A CALL FROM THE APP ==
// The registration itself is a SECURITY DEFINER function
// (public.register_my_player) reachable by any signed-in stranger with a
// confirmed email. A notification the CLIENT fires is one the client can skip
// - not a security hole, but it would make "the club is always told" a claim
// that depends on the browser finishing a second request. The trigger is on
// the row.
//
// !! IT MUST NEVER BE ABLE TO FAIL THE REGISTRATION. pg_net.http_post queues
// the request and returns an id immediately; it does not wait for a response
// and cannot raise into the caller's transaction. So a dead endpoint, an
// expired Resend key or a 500 in here costs an email and nothing else - the
// parent's player is still registered and still shows in the queue on screen.
// That ordering is deliberate: the SCREEN is the source of truth, the email is
// a prompt to go and look at it.
//
// == SECURITY ==
// !! MUST be deployed with verify_jwt: false. Postgres calls it with no user
// JWT; with verification on, the gateway rejects every call before this code
// runs and no email is ever sent - silently, because pg_net does not care what
// came back. The same trap the send-email function documents.
//
// It is therefore PUBLICLY REACHABLE, and the only thing between the internet
// and this endpoint is the shared secret below. It FAILS CLOSED: if
// APPROVAL_NOTIFY_SECRET is unset the function refuses every request rather
// than sending unauthenticated mail.
//
// !! THE REQUEST BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one
// membership id and nothing else. Every name, address and squad in the email
// is read back from the database here, with the service role. A body carrying
// its own "send this text to these addresses" would be an open relay wearing
// a shared secret.
//
// == THE VOLUME PROBLEM, STATED RATHER THAN DISCOVERED LATER ==
//
// !! CORRECTED 13 Aug 2026: THE ACCOUNT IS ON RESEND PRO. This block used to
// open "Resend's free tier is 100 emails/day, 3,000/month" and closed with "SO
// A BIG ONBOARDING DAY CAN STILL HIT IT ... move Resend to a paid tier first."
// Jay moved it. The daily cap is gone. Do not cite 100/day from anywhere.
//
// !! THE BCC DESIGN BELOW IS UNCHANGED AND STILL RIGHT. It was justified by the
// cap, but it does not DEPEND on the cap, and removing it would be the wrong
// lesson to draw from the upgrade:
//
// ONE Resend call per registration, with every recipient in `bcc`. Not one per
// recipient: with two admins and two coaches on a squad that would be four
// emails per registration, and a 100-player onboarding weekend would be 400
// sends instead of 100. Bcc also means recipients cannot see each other's
// addresses, which is the right default for a mail to a mixed group of
// volunteers - and that reason never had anything to do with pricing.
//
// !! WHAT REPLACED THE CAP AS THE THING TO WORRY ABOUT. The cap was an
// accidental brake: a runaway sender stopped at 100. Nothing stops one now.
// FIVE things share one Resend key and one sending domain - send-email (all
// auth mail), notify-approval, notify-pitch-request and notify-access-request.
// A loop on any of them sends thousands of REAL emails to REAL volunteers, and
// the consequence is no longer "we run out" but "Resend suspends
// send.adhquins-clubhub.com over complaints" - which takes SIGN-IN with it,
// because auth mail rides the same domain. A per-user throttle is still wanted;
// only its justification changed.
//
// A 429 is still logged and swallowed, and the registration is still
// unaffected: the queue on the Accounts screen is the record, the email is a
// prompt to go and look at it.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Where the email sends people. Not a link to the pending row - there is no
// such URL - but to the screen that lists everything waiting.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

/* ---------------- helpers ---------------- */

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// !! CONSTANT TIME. A plain `a === b` on a secret leaks its length and, in
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

async function sendMail(bcc: string[], subject: string, html: string, text: string): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    // !! BOTH PARTS, ALWAYS. Resend sends multipart/alternative when `text` is
    // present; HTML-only mail scores worse with filters. This one has to reach
    // volunteers during an onboarding weekend, so it gets the same treatment as
    // the auth mail - see the note on plainText below.
    text,
    // !! `to` IS THE SENDER, recipients are in bcc. Resend requires a `to`,
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
    //   429 -> rate or allowance limit. !! NOT the old 100/day free cap - the
    //          account is on Resend Pro since 13 Aug 2026. See the volume note
    //          at the top of this file.
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

/**
 * The plain-text half.
 *
 * !! NOT ESCAPED, deliberately - template() runs the same values through
 * escapeHtml because they land in markup; doing it here would show a reader
 * `&amp;` in the body of the mail.
 *
 * !! AND NO "the button below": there is no button in a plain-text part, and an
 * instruction pointing at something not present reads as a broken email.
 */
/**
 * !! TWO KINDS OF PENDING ROW REACH THIS FUNCTION, AND UNTIL 16 Aug 2026 IT
 * ASSUMED THERE WAS ONE.
 *
 *   a parent registering a child   -> player_id set, role 'parent'
 *   somebody claiming a staff job  -> player_id NULL, role coach/manager/medic
 *
 * The second arrived with public.request_staff_role (the sign-in gate's "do you
 * do anything else at the club?" step). Both fire the same
 * notify_pending_membership trigger, and with one wording the staff case read
 * "Someone has registered A new player in U12 Mixed" — a sentence in which every
 * single fact is wrong.
 *
 * `playerName` null is what distinguishes them, NOT the role: the role is what
 * is being CLAIMED and is attacker-controlled in the sense that matters here
 * (the requester chooses it), whereas the presence of a player row is a fact
 * about what was actually created.
 */
type Ask = {
  parentName: string
  teamName: string
  playerName: string | null
  roleLabel: string | null
  parentEmail: string
}

/**
 * How each claimable role reads in a sentence.
 *
 * !! ONLY THE THREE REQUESTABLE ONES. 'admin' is deliberately absent — it is
 * never requestable (public.request_staff_role refuses it, and so does the
 * CHECK on access_requests), so an entry here would describe a row this
 * function can never receive. 'parent' and 'player' are absent because those
 * rows always carry a player and take the other branch.
 *
 * !! AND AN UNKNOWN ROLE FALLS BACK TO "volunteer" RATHER THAN PRINTING THE RAW
 * VALUE. The role is chosen by the person asking; echoing it verbatim into an
 * email would let a request put arbitrary text in front of four volunteers.
 */
const ROLE_LABELS: Record<string, string> = {
  coach: 'coach',
  manager: 'team manager',
  medic: 'medic or physio',
}

/** The one sentence that differs, built once so both renderings agree. */
function claimSentence(ask: Ask): string {
  return ask.playerName
    ? `${ask.parentName} has registered ${ask.playerName} in ${ask.teamName}.`
    : `${ask.parentName} says they are a ${ask.roleLabel ?? 'volunteer'} for ${ask.teamName}.`
}

/**
 * What the person can and cannot see meanwhile. Also differs — a staff claimant
 * has no child to be shown, so the parent wording would be promising a
 * volunteer something that does not exist for them.
 */
function caveatSentence(ask: Ask): string {
  return ask.playerName
    ? "Until someone approves them they can see their own child and the squad's " +
        "fixtures - enough to set availability - and nothing else. Not the squad " +
        "roster, not other families' contact details."
    : "Until someone approves them they can see the squad's fixtures and nothing " +
        "else. Not the squad roster, not the players, not any family's contact " +
        'details. Approve only if you know who this is.'
}

function plainText(ask: Ask): string {
  return [
    'ABU DHABI HARLEQUINS',
    '',
    'Someone is waiting to be approved',
    '',
    claimSentence(ask),
    '',
    caveatSentence(ask),
    '',
    `Asked from ${ask.parentEmail}`,
    '',
    'Review it in the Club Hub:',
    `${APP_URL}/approvals`,
    '',
    "You're getting this because you're a coach, team manager or admin for this",
    'age group.',
  ].join('\n')
}

function template(ask: Ask): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Someone is waiting to be approved</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
        ${escapeHtml(claimSentence(ask))}
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        ${escapeHtml(caveatSentence(ask))}
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        Asked from ${escapeHtml(ask.parentEmail)}
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
    console.error('APPROVAL_NOTIFY_SECRET is not set - refusing every request.')
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
    // -- The registration. Everything below is read here, not taken from the
    //    request body - see the security note at the top.
    const rows = await db(
      `memberships?id=eq.${encodeURIComponent(membershipId)}` +
        // !! `role` ADDED 16 Aug 2026. Without it this function could not tell a
        //    parent registering a child from somebody claiming a staff job, and
        //    named the wrong thing in the one sentence that matters.
        '&select=id,status,role,club_id,team_id,profiles(full_name,email),players(full_name),teams(name)',
    )
    const membership = rows[0]
    if (!membership) {
      console.error(`membership ${membershipId} not found`)
      return new Response('not found', { status: 404 })
    }

    // !! RE-CHECKED, not assumed from the trigger's WHEN clause. An approval
    // racing the notification is unlikely but the email would be actively
    // wrong - telling four volunteers to go and action something that has
    // already been actioned.
    if (membership.status !== 'pending') {
      return new Response(JSON.stringify({ skipped: 'no longer pending' }), { status: 200 })
    }

    // -- Who to tell: SUPER admins, plus the head coach and team manager(s) of
    //    THIS squad. Jay, 18 Aug 2026: "we don't need to email every single
    //    admin every time or all the coaches in an age group".
    //
    // !! THIS IS DELIBERATELY NARROWER THAN private.can_approve_team, AND THAT
    //    IS THE CHANGE. It used to be the same list - every admin in the club
    //    plus every coach and manager on the squad - on the reasoning that the
    //    people who CAN act should be told. In practice that meant an assistant
    //    coach got an email for every registration in their age group, and all
    //    five admins got one whether or not they run registrations.
    //    Everyone who could approve before still can; they are simply not all
    //    told. Authority is private.can_approve_team's business, not this
    //    function's.
    //
    // !! NOT medic, unchanged. A medic cannot approve, so an email asking them
    //    to would be an instruction they cannot follow.
    //
    // !! THE HEAD COACH IS A COLUMN, NOT A TITLE MATCH. `memberships.title` is
    //    free text with no constraints and already holds 'Assistant
    //    Coach/Medic' on production; matching '%head coach%' would drop a
    //    recipient silently the first time somebody typed 'HC'. The database
    //    guarantees at most one per squad
    //    (memberships_one_head_coach_per_team), so this cannot fan out.
    //
    // !! MANAGERS BY ROLE, NOT BY TITLE, and there may be more than one - Jay
    //    asked for "the team manager or team managers if there is more than
    //    one". role='manager' and the title 'Team Manager' cover the same
    //    squads today, and a role cannot break on a typo.
    const [supers, squadStaff] = await Promise.all([
      db(
        `memberships?club_id=eq.${encodeURIComponent(membership.club_id)}` +
          '&is_super=is.true&status=eq.active&select=profiles(email)',
      ),
      db(
        `memberships?team_id=eq.${encodeURIComponent(membership.team_id)}` +
          '&status=eq.active&or=(is_head_coach.is.true,role.eq.manager)&select=profiles(email)',
      ),
    ])

    const recipients = [...new Set(
      [...supers, ...squadStaff]
        .map((row: any) => row?.profiles?.email)
        .filter((email: unknown): email is string => typeof email === 'string' && email.includes('@')),
    )]

    if (recipients.length === 0) {
      // Not an error: a club with no super admin and nobody running that squad
      // is a configuration problem, and sending nothing is the correct outcome.
      // Logged because it means somebody's registration will sit unseen.
      //
      // !! THE SUPER ADMINS ARE THE FLOOR, and that is what makes the narrowing
      //    above safe. A squad with no head coach and no manager - measured, one
      //    of them on 18 Aug 2026 - still reaches the super admins, so a request
      //    is never lost; the squad simply is not told. This branch therefore
      //    means there is no active super admin either, which is a different and
      //    much louder problem.
      console.error(`no recipients for membership ${membershipId} - nobody will be told`)
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    // One set of values, both renderings - so the plain-text part, which almost
    // nobody looks at, cannot drift from the HTML.
    //
    // !! `playerName` IS NULL RATHER THAN A FALLBACK STRING WHEN THERE IS NO
    //    PLAYER, and the difference is the whole fix. The old default was
    //    'A new player', which turned a staff claim into a confident sentence
    //    about a child who does not exist.
    const playerName = membership.players?.full_name ?? null
    const teamName = membership.teams?.name ?? 'their age group'
    const parentName = membership.profiles?.full_name?.trim() || 'Someone'
    const parentEmail = membership.profiles?.email ?? 'an address we could not read'
    const roleLabel = ROLE_LABELS[membership.role as string] ?? null

    const ask: Ask = { parentName, teamName, playerName, roleLabel, parentEmail }

    await sendMail(
      recipients,
      playerName
        ? `Approval needed: ${playerName} in ${teamName}`
        : `Approval needed: ${parentName} says they are a ${roleLabel ?? 'volunteer'} for ${teamName}`,
      template(ask),
      plainText(ask),
    )

    return new Response(JSON.stringify({ sent: recipients.length }), { status: 200 })
  } catch (error) {
    // !! 500 IS THE END OF IT. pg_net does not retry and nothing is waiting on
    // this response, so the only consequence is that no email went out. The
    // log line is the ONLY record - read it at Edge Functions -> notify-approval
    // -> Logs (the Logs tab, not Invocations; the MCP get_logs query shows only
    // the HTTP access log, which is how a 500 went undiagnosed for an hour on
    // 5 Aug).
    console.error('notify-approval failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
