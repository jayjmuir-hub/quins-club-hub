// Auth email sender - replaces Supabase's built-in mail via the Send Email
// Hook, so sign-in links come from the club rather than from Supabase.
//
// PROVIDER: Resend, via a single HTTPS POST with an API key.
//
// !! MAIL_FROM MUST BE ON `send.adhquins-clubhub.com`, NOT the root domain.
// The subdomain is what is verified in Resend; a root-domain address returns
// 403. Root DMARC must also stay RELAXED (`adkim=r; aspf=r`) or subdomain
// sending fails alignment. Do not tighten it.
//
// !! DNS IS COMPLETE AND CORRECT - verified live 9 Aug 2026. All three records
// are published and Resend reports the domain Verified:
//
//   TXT  send.send.adhquins-clubhub.com  v=spf1 include:amazonses.com ~all
//   MX   send.send.adhquins-clubhub.com  10 feedback-smtp.ap-northeast-1.amazonses.com
//   TXT  resend._domainkey.send.adhquins-clubhub.com  p=MIGfMA0...
//
// !! NOTE THE DOUBLE `send`, because it cost an hour. Resend puts the bounce /
// envelope domain ONE LEVEL BELOW the sending domain, so a domain of
// `send.adhquins-clubhub.com` has its MAIL FROM at
// `send.send.adhquins-clubhub.com`. An earlier pass queried SPF and MX at
// `send.adhquins-clubhub.com`, got NoAnswer, and reported the records as
// MISSING - a wrong diagnosis reached by looking in one place and not checking
// it was the right place. Jay's screenshot of the Resend dashboard is what
// corrected it.
//
// Alignment is fine either way: DKIM signs as send.adhquins-clubhub.com,
// matching the From domain, and the envelope domain shares the organisational
// domain, which relaxed DMARC (aspf=r) accepts. DMARC passes on BOTH.
//
// !! SECURITY: this endpoint MUST stay deployed with verify_jwt OFF, because
// Supabase Auth calls it server-to-server with no user JWT - with JWT
// verification on, every hook call is rejected at the gateway before reaching
// this code and NOBODY CAN SIGN IN. It is therefore PUBLICLY REACHABLE, and
// the ONLY thing standing between the internet and "send mail as the club to
// any address" is the signature check below. If SEND_EMAIL_HOOK_SECRET is
// unset the function refuses every request rather than sending unverified
// mail - fail closed, always.
//
// !! Deploying via the Supabase MCP `deploy_edge_function` tool DEFAULTS
// verify_jwt back to TRUE. It was silently re-enabled that way on 6 Aug and had
// to be redeployed. Always pass verify_jwt: false explicitly, and read it back
// from the deploy response before assuming the deploy was clean.
//
// !! WHY NOT MICROSOFT GRAPH, so nobody "fixes" it back: that path was built
// correctly and works right up to the point Exchange refuses to let the
// message leave. Every send failed with
//   550 5.7.708 Access denied, traffic not accepted from this IP
// which is Microsoft's outbound restriction on a BRAND-NEW tenant, applied
// before the tenant had ever sent anything. Graph returns 200; the message
// dies after Submit. No setting fixes it. The implementation is in git history
// at `a9e8492` if the block is ever lifted.

const HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
// Where the app lives. Every link in every auth email is built on this, NOT on
// Supabase's site_url - see the note in render(). Falls back to production so
// an unset variable cannot put the project ref back in front of people.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

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

  // Supabase's Send Email Hook secret is shown as `v1,whsec_<base64>` - a
  // Standard Webhooks version tag ("v1,") in front of the usual "whsec_"
  // prefix. Stripping only a leading "whsec_" (the plain Standard Webhooks
  // format) leaves "v1," on the front, which corrupts the base64 and makes
  // every request fail closed with a raw 500 before it even reaches the
  // signature comparison. Strip up to and including whichever "whsec_" is
  // found, wherever it starts, so both the bare and Supabase-prefixed forms
  // decode correctly.
  const whsecIndex = HOOK_SECRET.indexOf('whsec_')
  const secret = whsecIndex >= 0 ? HOOK_SECRET.slice(whsecIndex + 'whsec_'.length) : HOOK_SECRET
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

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    to: [to],
    subject,
    html,
    // !! BOTH PARTS, ALWAYS. Resend sends multipart/alternative when `text` is
    // present. HTML-only mail scores worse with filters, and it is also what a
    // plain-text client or a screen reader falls back to.
    text,
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
    // The response body is included because, unlike the Graph token call, it
    // carries no credential material - only a reason. The status alone is
    // usually enough:
    //   401 -> wrong or revoked RESEND_API_KEY
    //   403 -> MAIL_FROM's domain isn't verified in Resend. Check it is on
    //          send.adhquins-clubhub.com and NOT the root domain.
    //   422 -> malformed request (bad address, missing field)
    //   429 -> free-tier limit: 100/day, 3,000/month
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

const FOOTER =
  "This link expires shortly and can only be used once. If you didn't ask for it, " +
  'you can ignore this email - nobody can get into your account without it.'

/**
 * The plain-text half of every email.
 *
 * !! MULTIPART, NOT HTML-ONLY (added 9 Aug 2026). A message with no text/plain
 * alternative is a small but real spam signal, and it was the last technical
 * lever left after the link domain and the copy were fixed - the DNS turned
 * out to be correct all along, so reputation and content are all that remain.
 *
 * !! THE VALUES ARE NOT ESCAPED HERE, and that is the point rather than an
 * oversight. layout() runs them through escapeHtml because they land in
 * markup; doing the same in plain text would show a reader `&amp;` and
 * `&quot;` in the body of the mail.
 *
 * !! NO COPY MAY SAY "the button below". There is no button in a plain-text
 * part, and an instruction that refers to something not present reads as a
 * broken email. Every intro was reworded to "the link below", which is true in
 * both halves - the HTML control is a link wearing a button's clothes.
 *
 * Returned by layout() alongside the HTML so both are produced from one set of
 * inputs. Two functions taking the same arguments would be two things to
 * remember to change, and the plain-text one - which almost nobody looks at -
 * would be the one left stale.
 */
function plainText(heading: string, intro: string, actionUrl: string, actionLabel: string): string {
  return [
    'ABU DHABI HARLEQUINS',
    '',
    heading,
    '',
    intro,
    '',
    `${actionLabel}:`,
    actionUrl,
    '',
    FOOTER,
  ].join('\n')
}

// Deliberately plain HTML: no images, no external CSS, no tracking pixel.
// This is a sign-in email - it should look like one, load instantly on a phone
// with one bar of signal, and give a spam filter nothing to dislike.
function layout(
  heading: string,
  intro: string,
  actionUrl: string,
  actionLabel: string,
): { html: string; text: string } {
  const url = escapeHtml(actionUrl)
  const html = `<!doctype html>
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
        ${escapeHtml(FOOTER)}
      </p>
    </div>
  </body>
</html>`

  return { html, text: plainText(heading, intro, actionUrl, actionLabel) }
}

type EmailData = {
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url: string
}

function render(email: string, data: EmailData): { subject: string; html: string; text: string } {
  // == THE LINK POINTS AT THE CLUB'S OWN DOMAIN (changed 9 Aug 2026) ==
  //
  // It used to point at `https://<project-ref>.supabase.co/auth/v1/verify`.
  // That worked, and it cost us twice:
  //
  //   1. SPAM. The mail is FROM send.adhquins-clubhub.com and every link in it
  //      pointed at supabase.co. Sender domain != link domain is a textbook
  //      phishing signature, and Gmail, Outlook and Yahoo all weight it
  //      heavily. A real confirmation landed in Yahoo's junk on 9 Aug.
  //   2. TRUST. The project ref reads as `lusmshimxdcxpnrktlgz` - precisely
  //      the kind of hostname people are taught not to click.
  //
  // !! NOTHING EVER FORCED THE OLD SHAPE. The hook hands over a `token_hash`,
  // not a finished URL, so the destination was always ours to choose. The link
  // now goes to /auth/confirm on the app's own domain, which redeems the token
  // with verifyOtp and then routes the person onward. See
  // src/screens/AuthConfirm.jsx.
  //
  // !! APP_URL, NOT `site_url`. Supabase's site_url is the API origin
  // (`https://<ref>.supabase.co/auth/v1`) - using it here is what put the
  // project ref in front of people in the first place. If APP_URL is unset the
  // fallback is the production domain rather than the Supabase one, so a
  // missing env var can never silently reintroduce the bug this replaced.
  //
  // !! `next`, NOT `redirect_to`. AuthConfirm validates it as a same-origin
  // PATH before redirecting - see safeNext() there. A link on the club's own
  // domain that signs someone in and then bounces them anywhere the URL says
  // would be an open redirect wearing the club's reputation.
  //
  // KEPT FOR THE RECORD - the bug the old line carried, in case anyone ever
  // reinstates a direct verify URL: `site_url` arrives with `/auth/v1` ALREADY
  // on the end, so appending `/auth/v1/verify` produced
  // `/auth/v1/auth/v1/verify`. That path misses the API gateway's route
  // exemption and answered `{"message":"No API key found in request"}`. Every
  // sign-in email sent between the hook going live and 5 Aug had a dead button.
  const appBase = (APP_URL || 'https://adhquins-clubhub.com').replace(/\/+$/, '')
  const verifyUrl =
    `${appBase}/auth/confirm` +
    `?token_hash=${encodeURIComponent(data.token_hash)}` +
    `&type=${encodeURIComponent(data.email_action_type)}` +
    `&next=${encodeURIComponent(data.redirect_to || '/')}`

  switch (data.email_action_type) {
    // !! SIGNUP IS ITS OWN TEMPLATE SINCE 9 Aug 2026. It used to share the
    // magic-link one, which was correct when magic links WERE the sign-in
    // method - and became wrong the moment password auth landed on 8 Aug and
    // SHOW_PASSWORDLESS was switched off. Every parent who created an account
    // with a password was then told, by name, "you won't need a password".
    //
    // Jay spotted it in a real email during the pilot preparation. It is also
    // poor for deliverability: "you won't need a password" is exactly the
    // phrasing credential-phishing uses.
    case 'signup':
      return {
        subject: 'Confirm your email address',
        ...layout(
          'Confirm your email address',
          `Confirm ${email} to finish setting up your Quins Club Hub account. You'll sign in with the password you just chose.`,
          verifyUrl,
          'Confirm my email',
        ),
      }

    // The passwordless paths. Still reachable server-side, and still correct
    // wording FOR THEM - SHOW_PASSWORDLESS in src/screens/Login.jsx hides the
    // button that starts this flow, but the flow itself was mothballed rather
    // than deleted (Jay's ruling, 8 Aug) and the code must stay honest about
    // what it does if it is ever switched back on.
    case 'magiclink':
    case 'email':
      return {
        subject: 'Your Quins Club Hub sign-in link',
        ...layout(
          'Sign in to Quins Club Hub',
          `Use the link below to sign in as ${email}.`,
          verifyUrl,
          'Sign in',
        ),
      }
    case 'recovery':
      return {
        subject: 'Get back into Quins Club Hub',
        ...layout(
          'Get back into your account',
          `Use the link below to get back into Quins Club Hub as ${email}.`,
          verifyUrl,
          'Continue',
        ),
      }
    case 'email_change':
      return {
        subject: 'Confirm your new email address',
        ...layout(
          'Confirm your new email address',
          `Confirm that ${email} should be the address you use for Quins Club Hub.`,
          verifyUrl,
          'Confirm address',
        ),
      }
    case 'invite':
      return {
        subject: "You've been invited to Quins Club Hub",
        ...layout(
          "You've been invited",
          'Abu Dhabi Harlequins has invited you to Quins Club Hub - the club schedule, roster and availability in one place.',
          verifyUrl,
          'Accept the invitation',
        ),
      }
    default:
      return {
        subject: 'Quins Club Hub',
        ...layout(
          'Quins Club Hub',
          'Use the link below to continue.',
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

  // verify() can throw (e.g. a malformed HOOK_SECRET that isn't valid base64)
  // rather than just returning false. Catch that here so a bad secret fails
  // closed as an ordinary 401 like any other verification failure, instead of
  // an unhandled exception that Deno turns into a bodyless 500 with no clue
  // in our own logs about why.
  let verified: boolean
  try {
    verified = await verify(request, raw)
  } catch (error) {
    console.error('send-email: verification threw:', error instanceof Error ? error.message : error)
    verified = false
  }

  if (!verified) {
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

    const { subject, html, text } = render(email, data)
    await sendMail(email, subject, html, text)

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
