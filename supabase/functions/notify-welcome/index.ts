// Welcomes a brand-new account holder to Quins Club Hub. Fired by the
// on_auth_user_created_welcome trigger on auth.users — rows born with
// email_confirmed_at set, which is every self-signup once the dashboard's
// "Confirm email" toggle is off (Jay's decision, 25 Aug 2026 — see
// claude/decisions/2026-08-25-remove-email-confirmation.md).
//
// == THIS MAIL IS A WELCOME, NOT A GATE ==
// It carries no token and no verify link. The account already works; the
// club's admin approval is the real gate on everything that matters. If this
// mail is never sent the person loses nothing but a greeting — which is why
// the trigger swallows failures and why nothing here retries.
//
// == WHY A TRIGGER AND NOT A CALL FROM THE APP ==
// Same reasoning as notify-approval: a notification the client fires is one
// the client can skip. "Every new account gets a welcome" should not depend
// on the browser finishing a second request after signUp().
//
// == SECURITY ==
// !! MUST be deployed with verify_jwt: false. Postgres calls it with no user
// JWT; with verification on, the gateway rejects every call before this code
// runs and no email is ever sent — silently, because pg_net does not care
// what came back.
//
// It is therefore PUBLICLY REACHABLE, and the only thing between the internet
// and this endpoint is the shared secret below (APPROVAL_NOTIFY_SECRET,
// reused across the notify functions — same caller, same trust domain, one
// thing to rotate). It FAILS CLOSED: unset secret means every request is
// refused.
//
// !! THE REQUEST BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one
// user id and nothing else. The name and address in the email are read back
// from the database here, with the service role. A body carrying its own
// "send this text to this address" would be an open relay wearing a shared
// secret — and this endpoint would be the worst one to have that hole,
// because it mails ARBITRARY new signups, i.e. any address an attacker just
// typed into the signup form. The per-user cost of abusing it that way is
// one welcome email to an inbox the attacker controls, which is nothing.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Where the button sends people: the app itself. They are already signed in
// on the device they registered from; on any other device this lands them on
// the sign-in screen, which is right.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

/* ---------------- helpers ---------------- */

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// !! CONSTANT TIME. Same reasoning as the other notify functions.
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
// there is no session in this process to read the profile as.
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

function template(firstName: string | null): string {
  const greeting = firstName ? `Welcome, ${escapeHtml(firstName)}` : 'Welcome to the club'
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8e1526;">Abu Dhabi Harlequins</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${greeting}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
        Your Quins Club Hub account is created and ready — this email is just to
        say so, there is nothing you need to click to activate it.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5c5854;">
        The club has what you told us at signup and a volunteer will approve
        your request — you'll get an email when that happens. In the meantime
        you can sign in any time with your email and the password you chose.
      </p>
      <a href="${escapeHtml(APP_URL)}"
         style="display:inline-block;background:#8e1526;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:11px;">
        Open the Club Hub
      </a>
      <p style="margin:20px 0 0;font-size:12.5px;line-height:1.5;color:#8a8582;">
        Didn't create this account? Reply to this email and tell us — we'll
        remove it.
      </p>
    </div>
  </body>
</html>`
}

// The plain-text half. !! NOT ESCAPED, deliberately — template() escapes
// because its values land in markup; escaping here would show a reader &amp;.
// And no "the button below": there is no button in a plain-text part.
function plainText(firstName: string | null): string {
  const greeting = firstName ? `Welcome, ${firstName}.` : 'Welcome to the club.'
  return (
    `${greeting}\n\n` +
    'Your Quins Club Hub account is created and ready - this email is just to ' +
    'say so, there is nothing you need to click to activate it.\n\n' +
    'The club has what you told us at signup and a volunteer will approve your ' +
    "request - you'll get an email when that happens. In the meantime you can " +
    'sign in any time with your email and the password you chose:\n\n' +
    `${APP_URL}\n\n` +
    "Didn't create this account? Reply to this email and tell us - we'll remove it."
  )
}

async function sendMail(to: string, firstName: string | null): Promise<void> {
  const body: Record<string, unknown> = {
    from: MAIL_FROM,
    // !! BOTH PARTS, ALWAYS. Resend sends multipart/alternative when `text`
    // is present; HTML-only mail scores worse with filters — and this one is
    // the first mail a brand-new address ever gets from the club, so its
    // deliverability sets the tone for every mail after it.
    to: [to],
    subject: 'Welcome to Quins Club Hub — your account is ready',
    html: template(firstName),
    text: plainText(firstName),
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
    //   429 -> rate or allowance limit (the account is on Resend Pro).
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

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

  let userId = ''
  try {
    const body = await request.json()
    userId = String(body?.user_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!userId) return new Response('bad request', { status: 400 })

  try {
    // Everything in the mail is read here, not taken from the request body —
    // see the security note at the top.
    const rows = await db(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,first_name`,
    )
    const profile = rows[0]
    if (!profile?.email) {
      console.error(`profile ${userId} not found or has no email`)
      return new Response('not found', { status: 404 })
    }

    await sendMail(profile.email, profile.first_name ?? null)
    return new Response(JSON.stringify({ sent: 1 }), { status: 200 })
  } catch (error) {
    console.error(error)
    return new Response('failed', { status: 500 })
  }
})
