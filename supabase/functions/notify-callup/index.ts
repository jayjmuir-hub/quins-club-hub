// Emails a player's family when a senior squad asks to call them up —
// claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep 2026 beside the
// push that #689 already sends. Same shape as notify-approval: the SQL side
// posts { request_id } with the shared x-approval-secret header; everything
// else is read here from the database with the service role, never taken
// from the request body.
//
// !! WHO IS MAILED: the profiles holding an ACTIVE parent or player membership
// carrying this player's id — private.callup_family's rule, restated here in
// PostgREST terms. Nobody else. The U18 staff get a push, not a mail.
//
// !! WHAT THE MAIL SAYS: the senior squad's name and the player's name, and a
// link to /callups where the answer is given. No birthday, no contact
// details, nothing about the player beyond the name the family already knows.
//
// !! SECRET, DEPLOY AND DNS RULES: as notify-approval. verify_jwt stays OFF
// (the database calls this server-to-server); the gate is the header check;
// MAIL_FROM is on send.adhquins-clubhub.com.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const MAIL_TO = Deno.env.get('MAIL_TO') || MAIL_FROM.replace('@send.', '@')
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
  const body: Record<string, unknown> = { from: MAIL_FROM, to: [MAIL_TO], bcc, subject, html, text }
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

type Ask = { playerName: string; seniorName: string; homeName: string }

function plainText(ask: Ask): string {
  return [
    `${ask.seniorName} would like to call up ${ask.playerName} from ${ask.homeName}.`,
    '',
    'A called-up player joins the senior squad for fixtures, training, availability and chat, and keeps their place in their own squad. Saying yes counts for the rest of the season; you can still say no to any single match.',
    '',
    `Say yes or no here: ${APP_URL}/callups`,
    '',
    "You're getting this because you are listed as this player's parent or as the player. The U18 coaches have been told as well.",
  ].join('\n')
}

function template(ask: Ask): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(ask.seniorName)} would like to call up ${escapeHtml(ask.playerName)}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
        A called-up player joins the senior squad for fixtures, training, availability and chat, and keeps their place in ${escapeHtml(ask.homeName)}. Saying yes counts for the rest of the season; you can still say no to any single match.
      </p>
      <a href="${escapeHtml(APP_URL)}/callups"
         style="display:inline-block;background:#8e1526;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">
        Say yes or no in the Club Hub
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;line-height:1.5;color:#8a8582;">
        You're getting this because you are listed as this player's parent or as the player. The U18 coaches have been told as well.
      </p>
    </div>
  </body>
</html>`
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is not set - refusing every request.')
    return new Response('not configured', { status: 503 })
  }
  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!timingSafeEqual(presented, NOTIFY_SECRET)) {
    return new Response('unauthorised', { status: 401 })
  }

  let requestId = ''
  try {
    const body = await request.json()
    requestId = String(body?.request_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!requestId) return new Response('bad request', { status: 400 })

  try {
    const rows = await db(
      `callup_requests?id=eq.${encodeURIComponent(requestId)}` +
        '&select=id,status,player_id,players(full_name),home:teams!callup_requests_home_team_id_fkey(name),senior:teams!callup_requests_senior_team_id_fkey(name)',
    )
    const req = rows?.[0]
    if (!req) return new Response('not found', { status: 404 })
    if (req.status !== 'requested') {
      return new Response(JSON.stringify({ skipped: 'already answered' }), { status: 200 })
    }

    const family = await db(
      `memberships?player_id=eq.${encodeURIComponent(req.player_id)}` +
        '&status=eq.active&role=in.(parent,player)&select=profiles(email)',
    )
    const recipients = [...new Set(
      family
        .map((row: any) => row?.profiles?.email)
        .filter((email: unknown): email is string => typeof email === 'string' && email.includes('@')),
    )]
    if (recipients.length === 0) {
      console.error(`no family address for call-up ${requestId} - nobody will be mailed`)
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const ask: Ask = {
      playerName: req.players?.full_name ?? 'your player',
      seniorName: req.senior?.name ?? 'A senior squad',
      homeName: req.home?.name ?? 'their squad',
    }
    await sendMail(recipients, `${ask.seniorName} would like to call up ${ask.playerName}`, template(ask), plainText(ask))
    return new Response(JSON.stringify({ sent: recipients.length }), { status: 200 })
  } catch (error) {
    console.error('notify-callup failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
