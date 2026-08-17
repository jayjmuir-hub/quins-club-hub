// Emails somebody the club has invited, with the link that lets them in.
// Fired by an AFTER INSERT trigger on public.invites.
//
// Jay, 16 Aug 2026: "there should be an invite button that the coaches,
// managers, and admin can click to send that person an email invitation" — and
// 17 Aug, settling the three questions this raised: yes; the sender is NAMED;
// and it fires for EVERY invite, not only the ones made from a parent row.
//
// !! WHY EVERY INVITE. A rule about WHICH invites get emailed is a second rule,
// free to disagree with the first, and the wrong one would be the one nobody
// tested. It also fixes a rough edge: the admin invite form has always made an
// admin copy a link and send it by hand.
//
// == !! THIS FUNCTION IS NOT LIKE THE OTHER THREE, AND THE DIFFERENCE IS THE
//       DANGEROUS PART ======================================================
//
// notify-approval, notify-access-request and notify-pitch-request all mail a
// GROUP of volunteers, in bcc, about work waiting for them. This mails ONE
// PERSON and puts a CREDENTIAL in the message: invites.token is the whole of
// the authentication — anybody holding it can accept and become a member.
//
// !! SO THERE IS NO bcc, NO cc, AND EXACTLY ONE RECIPIENT: the address on the
// invite row. Copying the squad's coaches "for visibility", as the other three
// deliberately do, would hand every one of them a working link into somebody
// else's account. If a future change adds a second recipient here, that is the
// line to argue about.
//
// !! AND THE ADDRESS IS READ FROM THE ROW, NEVER FROM THE REQUEST BODY. The
// body carries an invite id and nothing else. A body that could name its own
// recipient would make this an open relay that mails a valid credential.
//
// == !! WHAT IT MUST NOT TRY TO READ =======================================
//
// !! NOT invite_targets. A multi-target invite (a parent of two children in
// different age groups) is TWO writes: the invite row first, then the targets.
// This trigger fires on the first, so the targets DO NOT EXIST YET and a query
// for them returns zero, every time. An email that listed "the children you'll
// be linked to" would therefore list none — silently, and only for the
// multi-child case, which is the one hardest to notice.
//
// The invite's own team_id/player_id columns are safe: createInvite fills them
// when there is exactly one target, and leaves them null when there are several
// — so a null there means "more than one, or none", and the copy says nothing
// specific rather than something wrong.
//
// == SECURITY ==
// !! MUST be deployed with verify_jwt: false. Postgres calls it with no user
// JWT; with verification on, the gateway rejects every call before this code
// runs and no email is ever sent — silently, because pg_net does not read the
// response. !! THE MCP DEPLOY TOOL SILENTLY DEFAULTS THIS BACK TO true; check
// it after deploying, do not assume it.
//
// It is therefore PUBLICLY REACHABLE, and the shared secret is the only thing
// between the internet and a function that emails credentials. It FAILS CLOSED:
// with APPROVAL_NOTIFY_SECRET unset it refuses every request.
//
// !! IT REUSES APPROVAL_NOTIFY_SECRET rather than minting its own, matching the
// other three notifiers. One secret to rotate, not four — and rotating three of
// four is the failure that would leave exactly one endpoint open.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

/**
 * !! ONE RECIPIENT, IN `to`, AND NOTHING IN bcc. See the header. The other
 * notifiers address the club and bcc the volunteers precisely so recipients
 * cannot see each other; here there is only ever one person, and the message
 * carries their credential.
 */
async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  const body: Record<string, unknown> = { from: MAIL_FROM, to: [to], subject, html, text }
  if (REPLY_TO) body.reply_to = REPLY_TO

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    //   401 -> wrong or revoked RESEND_API_KEY
    //   403 -> MAIL_FROM's domain is not verified. It must be on
    //          send.adhquins-clubhub.com, NOT the root domain.
    //   429 -> rate limit. The account is on Resend Pro since 13 Aug 2026.
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

/**
 * How each role reads in a sentence.
 *
 * !! AN UNKNOWN ROLE FALLS BACK TO A PLAIN WORD RATHER THAN PRINTING THE RAW
 * VALUE, the same rule notify-approval follows. The role comes off a row a
 * coach or admin filled in; echoing it verbatim into an email is how arbitrary
 * text reaches somebody's inbox under the club's name.
 */
const ROLE_LABELS: Record<string, string> = {
  parent: 'a parent',
  player: 'a player',
  coach: 'a coach',
  manager: 'a team manager',
  medic: 'a medic or physio',
  admin: 'a club admin',
}

type Invite = {
  inviteeName: string | null
  senderName: string
  roleLabel: string
  playerName: string | null
  teamName: string | null
  link: string
  needsApproval: boolean
}

/**
 * The one sentence that says who did this and why the recipient is hearing from
 * the club at all.
 *
 * !! THE SENDER IS NAMED — Jay's call, 17 Aug 2026. An unattributed "you have
 * been invited" from a club somebody may have no account with reads as spam,
 * and the recipient cannot tell whether to trust it. Naming the person who
 * pressed the button is what makes it credible.
 */
function openingLine(invite: Invite): string {
  const who = invite.senderName
  if (invite.playerName && invite.teamName) {
    return `${who} has added you as ${invite.playerName}'s parent or carer in ${invite.teamName}, and invited you to the Abu Dhabi Harlequins Club Hub.`
  }
  if (invite.teamName) {
    return `${who} has invited you to join the Abu Dhabi Harlequins Club Hub as ${invite.roleLabel} for ${invite.teamName}.`
  }
  return `${who} has invited you to join the Abu Dhabi Harlequins Club Hub as ${invite.roleLabel}.`
}

/**
 * What happens after they accept.
 *
 * !! IT SAYS WHICH, AND IT IS READ OFF THE ROW RATHER THAN GUESSED. An invite
 * created by somebody who could not approve it lands PENDING (see
 * 20260816_invite_grant_status.sql), and somebody who accepts one and then finds
 * an empty app will assume it is broken.
 */
function nextLine(invite: Invite): string {
  return invite.needsApproval
    ? 'Once you have set up your account, a coach, manager or admin will approve it — until then you will see fixtures and nothing else.'
    : 'Once you have set up your account you are in — no approval needed.'
}

function plainText(invite: Invite): string {
  return [
    'ABU DHABI HARLEQUINS',
    '',
    openingLine(invite),
    '',
    nextLine(invite),
    '',
    'Set up your account:',
    invite.link,
    '',
    'If you were not expecting this, you can ignore this email — nothing happens',
    'until you use the link.',
  ].join('\n')
}

function template(invite: Invite): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You have been invited to the Club Hub</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
        ${escapeHtml(openingLine(invite))}
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        ${escapeHtml(nextLine(invite))}
      </p>
      <a href="${escapeHtml(invite.link)}"
         style="display:inline-block;background:#8e1526;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">
        Set up your account
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;line-height:1.5;color:#8a8582;">
        If you were not expecting this you can ignore this email — nothing
        happens until you use the link.
      </p>
    </div>
  </body>
</html>`
}

/* ---------------- entry point ---------------- */

Deno.serve(async (request: Request): Promise<Response> => {
  // Fail closed: an unset secret refuses everything rather than leaving an
  // endpoint that emails credentials open to the internet.
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is not set - refusing every request.')
    return new Response('not configured', { status: 503 })
  }

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!timingSafeEqual(presented, NOTIFY_SECRET)) {
    return new Response('unauthorised', { status: 401 })
  }

  let inviteId = ''
  try {
    const body = await request.json()
    inviteId = String(body?.invite_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!inviteId) return new Response('bad request', { status: 400 })

  try {
    // !! EVERYTHING IS READ BACK HERE, NOT TAKEN FROM THE BODY — including the
    // address the mail goes to. See the header.
    const rows = await db(
      `invites?id=eq.${encodeURIComponent(inviteId)}` +
        '&select=id,email,token,role,grant_status,accepted_at,created_by,' +
        'teams(name),players(full_name)',
    )
    const invite = rows[0]
    if (!invite) {
      console.error(`invite ${inviteId} not found`)
      return new Response('not found', { status: 404 })
    }

    // !! RE-CHECKED RATHER THAN ASSUMED FROM THE TRIGGER. An invite accepted
    // between the insert and this call would get a "set up your account" mail
    // for an account that already exists.
    if (invite.accepted_at) {
      return new Response(JSON.stringify({ skipped: 'already accepted' }), { status: 200 })
    }

    const to = String(invite.email ?? '').trim()
    if (!to.includes('@')) {
      console.error(`invite ${inviteId} has no usable email`)
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    // The person who pressed the button. A separate read because `created_by`
    // points at profiles and PostgREST cannot embed it without a named
    // relationship on this table.
    let senderName = 'Someone at the club'
    if (invite.created_by) {
      const senders = await db(
        `profiles?id=eq.${encodeURIComponent(invite.created_by)}&select=full_name`,
      )
      const named = senders[0]?.full_name?.trim()
      if (named) senderName = named
    }

    const model: Invite = {
      inviteeName: null,
      senderName,
      roleLabel: ROLE_LABELS[invite.role as string] ?? 'a member',
      playerName: invite.players?.full_name ?? null,
      teamName: invite.teams?.name ?? null,
      link: `${APP_URL}/accept-invite/${invite.token}`,
      // Anything that is not explicitly 'active' is treated as needing
      // approval: the cautious direction, and it means a future third status
      // reads as "wait" rather than silently promising immediate access.
      needsApproval: invite.grant_status !== 'active',
    }

    await sendMail(
      to,
      model.playerName
        ? `${senderName} has invited you to the Quins Club Hub`
        : 'You have been invited to the Quins Club Hub',
      template(model),
      plainText(model),
    )

    return new Response(JSON.stringify({ sent: 1 }), { status: 200 })
  } catch (error) {
    // !! 500 IS THE END OF IT. pg_net does not retry and nothing is waiting on
    // this response, so the only consequence is that no email went out. The log
    // line is the ONLY record - read it at Edge Functions -> notify-invite ->
    // Logs (the Logs tab, not Invocations).
    //
    // !! AND THE INVITE STILL EXISTS AND STILL WORKS. The screen shows the
    // accept link to whoever pressed the button, so a dead mail path costs
    // convenience rather than access.
    console.error('notify-invite failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
