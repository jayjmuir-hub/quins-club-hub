// Auth email sender — replaces Supabase's built-in mail via the Send Email
// Hook, so sign-in links come from the club rather than from Supabase.
//
// WHY THIS EXISTS AND NOT CUSTOM SMTP: Supabase's custom SMTP is
// password-only, and doesn't fit the free sending providers cleanly either
// way — this hook approach sends over plain HTTPS, no SMTP credentials
// anywhere.
//
// PROVIDER: Resend, via a single HTTPS POST with an API key
// (`Authorization: Bearer re_...`). Decided 5 Aug 2026, reversing the
// 4 Aug decision to run this through Microsoft Graph on a new tenant — see
// claude/decisions/2026-08-05-resend.md for the reasoning and what was
// dropped. This used to call Microsoft Graph (`getToken` + `sendMail`
// against `login.microsoftonline.com` / `graph.microsoft.com`); if you're
// reading old context that mentions `MS_TENANT_ID` / `MS_CLIENT_ID` /
// `MS_CLIENT_SECRET`, that's why — those env vars are gone.
//
// It also removes the reason this was urgent: Supabase's built-in email
// service is capped at 2 messages per hour with no delivery SLA, which cannot
// onboard a club of 300.
//
// SECURITY: this endpoint runs with verify_jwt OFF, because Supabase Auth
// calls it server-to-server with no user JWT. It is therefore PUBLICLY
// REACHABLE, and the ONLY thing standing between the internet and "send mail
// as the club to any address" is the signature check below. If SEND_EMAIL_HOOK_SECRET
// is unset the function refuses every request rather than sending unverified
// mail — fail closed, always.

const HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''

// Replay window for the webhook timestamp. Standard Webhooks recommends five
// minutes; a captured request older than this is refused even with a valid
// signature.
const TOLERANCE_SECONDS = 300

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Constant-time compare. A plain === leaks, through timing, how many leading
 * bytes of a guessed signature were right, which is enough to forge one given
 * patience.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Standard Webhooks verification, implemented directly rather than pulled in
 * as a dependency: it is thirty lines, and an unaudited import in the one
 * place that decides whether to trust a caller is a poor trade.
 *
 * Signed payload is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the secret
 * (base64, after the `whsec_` prefix), compared against any of the
 * space-separated `v1,<sig>` entries in the webhook-signature header.
 */
async function verify(request: Request, body: string): Promise<boolean> {
  if (!HOOK_SECRET) return false

  const id = request.headers.get('webhook-id')
  const timestamp = request.headers.get('webhook-timestamp')
  const signature = request.headers.get('webhook-signature')
  if (!id || !timestamp || !signature) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false

  const secret = HOOK_SECRET.startsWith('whsec_') ? HOOK_SECRET.slice(6) : HOOK_SECRET
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  )
  const expected = bytesToBase64(new Uint8Array(mac))

  return signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => timingSafeEqual(candidate, expected))
}

/* ---------------- Resend ---------------- */

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    to: [to],
    subject,
    html,
  }
  // Optional: without it, a reply to a sign-in email vanishes into a mailbox
  // nobody reads, which is worse than no reply address at all.
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
    // Deliberately does not log the body on 401/403 — a misconfigured key
    // can otherwise echo account details into logs. The status alone
    // diagnoses it:
    //   401 -> wrong or revoked RESEND_API_KEY
    //   403 -> MAIL_FROM's domain isn't verified in Resend yet
    //   422 -> malformed request (bad address, missing field)
    //   429 -> the free-tier rate limit (100/day) was hit
    throw new Error(`Resend sendMail failed (${response.status}): ${await response.text()}`)
  }
}

/* ---------------- Templates ---------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Deliberately plain HTML: no images, no external CSS, no tracking pixel.
// This is a sign-in email — it should look like one, load instantly on a phone
// with one bar of signal, and give a spam filter nothing to dislike.
function layout(heading: string, intro: string, actionUrl: string, actionLabel: string): string {
  const url = escapeHtml(actionUrl)
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
      <p style="margin:0 0 24px;">
        <a href="${url}" style="display:inline-block;background:#c21f32;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">${escapeHtml(actionLabel)}</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5c5854;">
        If the button doesn't work, copy this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#5c5854;">${url}</p>
      <p style="margin:0;padding-top:16px;border-top:1px solid #e6e3e1;font-size:12px;line-height:1.6;color:#77726e;">
        This link expires shortly and can only be used once. If you didn't ask for it, you can ignore this email — nobody can get into your account without it.
      </p>
    </div>
  </body>
</html>`
}

type EmailData = {
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url: string
}

function render(email: string, data: EmailData): { subject: string; html: string } {
  // The hook hands over a token_hash, not a finished link — the URL has to be
  // assembled here. Getting this wrong produces an email whose button silently
  // fails, so it is built once, in one place.
  const verifyUrl =
    `${data.site_url}/auth/v1/verify` +
    `?token=${encodeURIComponent(data.token_hash)}` +
    `&type=${encodeURIComponent(data.email_action_type)}` +
    `&redirect_to=${encodeURIComponent(data.redirect_to)}`

  switch (data.email_action_type) {
    case 'signup':
    case 'magiclink':
    case 'email':
      return {
        subject: 'Your Quins Club Hub sign-in link',
        html: layout(
          'Sign in to Quins Club Hub',
          `Tap the button below to sign in as ${email}. You won't need a password.`,
          verifyUrl,
          'Sign in',
        ),
      }
    case 'recovery':
      return {
        subject: 'Get back into Quins Club Hub',
        html: layout(
          'Get back into your account',
          `Use the button below to get back into Quins Club Hub as ${email}.`,
          verifyUrl,
          'Continue',
        ),
      }
    case 'email_change':
      return {
        subject: 'Confirm your new email address',
        html: layout(
          'Confirm your new email address',
          `Confirm that ${email} should be the address you use for Quins Club Hub.`,
          verifyUrl,
          'Confirm address',
        ),
      }
    case 'invite':
      return {
        subject: "You've been invited to Quins Club Hub",
        html: layout(
          "You've been invited",
          'Abu Dhabi Harlequins has invited you to Quins Club Hub — the club schedule, roster and availability in one place.',
          verifyUrl,
          'Accept the invitation',
        ),
      }
    default:
      return {
        subject: 'Quins Club Hub',
        html: layout(
          'Quins Club Hub',
          'Use the button below to continue.',
          verifyUrl,
          'Continue',
        ),
      }
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Read the body as TEXT first: the signature covers the exact bytes sent, so
  // parsing to JSON and re-serialising would verify something the sender never
  // signed.
  const raw = await request.text()

  if (!(await verify(request, raw))) {
    // No detail to the caller. Whether the secret is missing, the timestamp is
    // stale or the signature is wrong is not something an unverified caller
    // gets to learn.
    console.error('send-email: signature verification failed')
    return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!RESEND_API_KEY || !MAIL_FROM) {
    console.error('send-email: Resend is not configured')
    return new Response(
      JSON.stringify({ error: { message: 'Email is not configured.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const payload = JSON.parse(raw)
    const email: string = payload.user?.email
    const data: EmailData = payload.email_data
    if (!email || !data?.token_hash) throw new Error('Malformed hook payload')

    const { subject, html } = render(email, data)
    await sendMail(email, subject, html)

    // An empty object is the hook's "handled, don't send anything yourself".
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    // Returning a non-2xx makes Supabase surface a failure to the user rather
    // than telling them to check an inbox nothing was sent to.
    console.error('send-email:', error instanceof Error ? error.message : error)
    return new Response(
      JSON.stringify({ error: { message: 'Could not send the email. Try again shortly.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
