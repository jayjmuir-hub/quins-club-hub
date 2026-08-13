// Pitch requests, both directions:
//   SUBMITTED -> tell the people who can answer it (Pitch Management + supers)
//   ANSWERED  -> tell the coach who asked
//
// Jay, 11 Aug 2026: email "multiple people", appear in two dashboards, and be
// trackable from submission to assignment by the person who submitted it.
//
// == ONE FUNCTION, BOTH DIRECTIONS ==
// The two mails differ only in who they go to and what they say; the lookup,
// the auth, the Resend call and the failure handling are identical. Two
// functions would be two places to fix the next Resend quirk, and the second
// one would be the one that drifted.
//
// == WHY A TRIGGER AND NOT A CALL FROM THE APP ==
// Same reasoning as notify-approval, plus one that is specific here: the
// SUBMIT mail goes to admins, and the coach who triggers it CANNOT READ ADMIN
// EMAIL ADDRESSES. `profiles` is not readable in bulk by a coach, so a
// client-side send would either need those addresses in the browser - handing
// every coach the club's admin list - or a service-role key in the browser,
// which is worse. The recipient list has to be built server-side, and this is
// the server side.
//
// !! IT MUST NEVER BE ABLE TO FAIL THE REQUEST. pg_net queues and returns
// immediately; it cannot raise into the caller's transaction. A dead endpoint
// or an expired Resend key costs an email and nothing else - the request is
// still filed and still sits in the Pitch Management queue on screen.
//
// !! AND THAT IS THE HONEST LIMIT OF "the failure is visible". It is visible
// in THIS function's logs and nowhere else: the app is not told, and neither
// is the person holding it. The mitigation is not the email, it is that the
// QUEUE IS IN-APP -
// the request is on screen whether or not the mail arrives. The email is a
// prompt to go and look, never the record.
//
// == SECURITY ==
// !! MUST be deployed with verify_jwt: false - Postgres calls it with no user
// JWT. With verification on, the gateway rejects every call before this code
// runs and no email is ever sent, silently, because pg_net does not read the
// response.
//
// It is therefore PUBLICLY REACHABLE and the shared secret is the only gate.
// It FAILS CLOSED: unset secret means every request is refused.
//
// !! THE BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one request id.
// Every name, address, squad and pitch below is read back here with the
// service role. A body carrying its own "send this text to these addresses"
// would be an open relay wearing a shared secret.
//
// == VOLUME ==
// !! CORRECTED 13 Aug 2026. This line said "Resend free is 100/day,
// 3,000/month". The account is on Resend Pro and there is no daily cap.
//
// ONE Resend call per event with the recipients in bcc, for the same reason
// notify-approval does it: per-recipient sends would multiply a busy
// fixture-setting evening by the number of Pitch Managers. Bcc also keeps
// volunteers' addresses off each other's screens - a reason that never had
// anything to do with the price, so the design is unchanged.
//
// !! THIS FUNCTION IS THE MOST EXPOSED OF THE FOUR SENDERS, and losing the cap
// is what made that worth writing down. A coach can submit pitch requests as
// fast as they can click, each one fires this trigger, and nothing throttles
// it. Under the old free tier that stopped at 100. Now it does not stop, and
// the damage is to the sending reputation of send.adhquins-clubhub.com - which
// carries SIGN-IN mail too. See the note at the top of notify-approval.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
const REPLY_TO = Deno.env.get('REPLY_TO') ?? ''
// !! REUSES THE APPROVAL SECRET DELIBERATELY. Same trust domain, same caller
// (Postgres), and a second secret is a second thing to rotate and a second
// thing to forget. If they ever need to differ, this is the line to change.
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
    // Both parts, always: HTML-only mail scores worse with filters.
    text,
    // `to` is the club, recipients in bcc - addressing it to one person who
    // holds Pitch Management would single them out as the one being asked.
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
    //   403 -> MAIL_FROM domain not verified (send.adhquins-clubhub.com)
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
    requestId = String(body?.pitch_request_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!requestId) return new Response('bad request', { status: 400 })

  try {
    const rows = await db(
      `pitch_requests?id=eq.${encodeURIComponent(requestId)}` +
        '&select=id,status,needs_referee,note,decision_note,requested_by,' +
        'events(club_id,team_id,title,opponent,starts_at,pitch,teams(name)),' +
        'profiles!pitch_requests_requested_by_fkey(full_name,email)',
    )
    const req = rows[0]
    if (!req) {
      console.error(`pitch request ${requestId} not found`)
      return new Response('not found', { status: 404 })
    }

    const squad = req.events?.teams?.name ?? 'a squad'
    const kickOff = req.events?.starts_at
      ? new Date(req.events.starts_at).toLocaleString('en-GB', {
          timeZone: 'Asia/Dubai',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'a date we could not read'
    const asker = req.profiles?.full_name?.trim() || 'A coach'

    /* ---------- submitted: tell the people who can answer ---------- */
    if (req.status === 'submitted') {
      // !! PITCH MANAGERS **AND SUPER ADMINS**. A super admin holds every right
      // implicitly (see adminRights in src/lib/scope.js), so filtering on the
      // right alone would silently exclude the one person guaranteed to be able
      // to act - and on a club where nobody has been given the job yet, that is
      // EVERY recipient.
      const managers = await db(
        `memberships?club_id=eq.${encodeURIComponent(req.events?.club_id ?? '')}` +
          '&role=eq.admin&status=eq.active' +
          '&or=(is_super.eq.true,admin_rights.cs.%7Bpitches%7D)' +
          '&select=profiles(email)',
      )

      const recipients = [...new Set(
        managers
          .map((row: any) => row?.profiles?.email)
          .filter((e: unknown): e is string => typeof e === 'string' && e.includes('@')),
      )]

      if (recipients.length === 0) {
        // Not an error: a club with nobody holding Pitch Management and no super admin is a
        // configuration problem. Logged because it means a request will sit
        // unseen until somebody opens the queue.
        console.error(`no pitch managers for request ${requestId} - nobody will be told`)
        return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      }

      const referee = req.needs_referee ? ' They have also asked for a referee.' : ''
      const note = req.note ? `<br><em>${escapeHtml(req.note)}</em>` : ''

      await sendMail(
        recipients,
        `Pitch needed: ${squad}, ${kickOff}`,
        shell(
          'A squad needs a pitch',
          line(`<strong>${escapeHtml(asker)}</strong> has asked for a pitch for <strong>${escapeHtml(squad)}</strong> on ${escapeHtml(kickOff)}.${escapeHtml(referee)}${note}`) +
            // !! DOES NOT NAME `Pitch TBD`. That string is an option a coach
            // PICKS in the event form, not something requestPitch writes - a
            // fixture waiting for a pitch just as often has an empty one. The
            // wording has to be true in both cases.
            quiet('Nothing is booked until somebody allocates it. The fixture is already in the schedule, without a pitch.'),
          '/admin/allocation',
          'Open the allocation grid',
          "You're getting this because you look after Pitch Management for the club.",
        ),
        [
          'ABU DHABI HARLEQUINS',
          '',
          'A squad needs a pitch',
          '',
          `${asker} has asked for a pitch for ${squad} on ${kickOff}.${referee}`,
          req.note ? `\n"${req.note}"` : '',
          '',
          'Nothing is booked until somebody allocates it. The fixture is already',
          'in the schedule, without a pitch.',
          '',
          'Open the allocation grid:',
          `${APP_URL}/admin/allocation`,
          '',
          "You're getting this because you look after Pitch Management for the club.",
        ].filter(Boolean).join('\n'),
      )

      return new Response(JSON.stringify({ sent: recipients.length, kind: 'submitted' }), { status: 200 })
    }

    /* ---------- answered: tell the coach who asked ---------- */
    if (req.status === 'allocated' || req.status === 'declined') {
      const to = req.profiles?.email
      if (!to || !to.includes('@')) {
        console.error(`request ${requestId} has no usable requester email`)
        return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
      }

      const allocated = req.status === 'allocated'
      // !! READ BACK FROM THE FIXTURE, not from this table. events.pitch is the
      // only source of truth for which pitch (Jay, 11 Aug) and this row does
      // not carry one - so the mail says what the SCHEDULE says, which is what
      // the coach will see when they open it.
      const pitch = req.events?.pitch ?? 'a pitch'
      const why = req.decision_note ? quiet(escapeHtml(req.decision_note)) : ''

      await sendMail(
        [to],
        allocated
          ? `Pitch ${pitch} for ${squad}, ${kickOff}`
          : `No pitch for ${squad}, ${kickOff}`,
        shell(
          allocated ? 'You have a pitch' : 'No pitch available',
          line(
            allocated
              ? `<strong>${escapeHtml(squad)}</strong> on ${escapeHtml(kickOff)} is on <strong>${escapeHtml(pitch)}</strong>.`
              : `There was no pitch available for <strong>${escapeHtml(squad)}</strong> on ${escapeHtml(kickOff)}.`,
          ) + why,
          '/schedule',
          'Open the schedule',
          'You asked for this pitch in the Club Hub.',
        ),
        [
          'ABU DHABI HARLEQUINS',
          '',
          allocated ? 'You have a pitch' : 'No pitch available',
          '',
          allocated
            ? `${squad} on ${kickOff} is on ${pitch}.`
            : `There was no pitch available for ${squad} on ${kickOff}.`,
          req.decision_note ? `\n${req.decision_note}` : '',
          '',
          'Open the schedule:',
          `${APP_URL}/schedule`,
          '',
          'You asked for this pitch in the Club Hub.',
        ].filter(Boolean).join('\n'),
      )

      return new Response(JSON.stringify({ sent: 1, kind: req.status }), { status: 200 })
    }

    // withdrawn/cancelled: nobody needs an email about a request that no longer
    // exists as a question.
    return new Response(JSON.stringify({ skipped: req.status }), { status: 200 })
  } catch (error) {
    // !! 500 IS THE END OF IT. pg_net does not retry and nothing waits on this
    // response, so the only consequence is that no email went out. The log line
    // is the ONLY record - Edge Functions -> notify-pitch-request -> Logs (the
    // Logs tab, not Invocations).
    console.error('notify-pitch-request failed:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
