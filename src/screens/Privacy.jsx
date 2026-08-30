import { Link } from 'react-router-dom'

// /privacy — PUBLIC. Required by Google Play, and linked from the Play
// listing, the delete-account page and the More tab.
//
// ⚠️ EVERY FACT BELOW WAS CHECKED AGAINST THE ACTUAL SYSTEM ON 6 AUG 2026,
// not written from a template. If you change what the app stores, change this
// page in the same commit — a privacy policy that has drifted from the
// database is worse than none, because people rely on it.
//
// Checked: the table list and every column (Supabase schema); the hosting
// region (ap-northeast-1, Tokyo); that the front end loads NO analytics,
// tracking or third-party scripts of any kind (fixed-string search for gtag,
// analytics, plausible, posthog, sentry, fathom across src/ and index.html —
// zero hits, with a positive control to prove the search worked).
//
// ⚠️ PLACEHOLDERS Jay must confirm before this is relied on are marked
// CONFIRM in the text. This was drafted by an assistant, not a lawyer.

// ⚠️ BUMP THIS whenever the wording below changes in a way that affects what
// the club is telling people it does. A privacy policy whose date never moves
// gives a reader no way to tell whether what they read last season still
// applies. Moved to 7 Aug 2026 for the "who can see what" correction.
// ══ REWRITTEN MINIMAL, 23 Aug 2026 — Jay: "as minimal as possible with general
// info, no details, just basic privacy cover". The 7 Aug version itemised
// every field. This one says what kind of thing is held, why, who sees it,
// where it is, and what you can do — one short paragraph each.
//
// ⚠️ THE LOAD-BEARING SENTENCES ARE PINNED BY tests/account-deletion.test.jsx,
// because each is a fact the policy once got wrong or could easily omit:
//   - that it is held by providers on the club's instructions (the region
//     was named until 23 Aug 2026; Jay asked for "secure providers" instead);
//   - that YOUNGER children do not sign in, and that OLDER players (U13 up)
//     may hold their own account — the 23 Aug text said "a child does not
//     sign in", full stop, and that was FALSE: self-registration for U13+
//     has been live since 11 Aug (teams.self_registration_allowed, measured
//     against the live table on 30 Aug — U13 and every squad above it allow
//     it, U12 and below do not). Corrected 30 Aug 2026, Jay's report;
//   - that squad members see each other's names, photographs and
//     availability (the 7 Aug policy said "own children only", which was
//     false) — "minimal" must not become "misleading";
//   - the security section's claims, each of which is a real measure (RLS in
//     the database, club approval before any access, encrypted transit, daily
//     backups, live monitoring) — added 30 Aug 2026 at Jay's request. If a
//     measure is ever switched off, this section must change in the same
//     commit, for the same reason the rest of the policy must;
//   - the link to /delete-account, because the policy promises it.
// ⚠️ AND TWO THINGS CHANGED SINCE 7 Aug that the old text contradicted: Sentry
// error reporting is live (so "no third-party scripts" was no longer true),
// and the app now sends push notifications you opt into and holds chat
// messages you post.
const LAST_UPDATED = '30 August 2026'

function H2({ children }) {
  return (
    <h2 className="mb-2 mt-7 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
      {children}
    </h2>
  )
}

function P({ children }) {
  return <p className="mb-2.5 text-[14px] leading-relaxed text-ink-muted">{children}</p>
}

export default function Privacy() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[640px] px-4 py-8">
      <h1 className="text-[22px] font-extrabold tracking-[-0.2px] text-ink">
        Privacy policy
      </h1>
      <p className="mt-1 text-[13px] font-semibold text-ink-muted">
        Quins Club Hub · last updated {LAST_UPDATED}
      </p>

      <H2>Who we are</H2>
      <P>
        Quins Club Hub is run by Abu Dhabi Harlequins Rugby Football Club to
        organise its own squads. The club is responsible for the information
        here. Questions or requests:{' '}
        <a className="font-bold text-brand-ink underline" href="mailto:admin@adhquins-clubhub.com">
          admin@adhquins-clubhub.com
        </a>
        .
      </P>

      <H2>What we hold, and why</H2>
      <P>
        The details needed to run a rugby club: your name and contact details,
        the players in your family and which squad they play in, an optional
        photograph, availability for fixtures and training, and anything you
        post in the club chat. We use it for club business only — fixtures,
        selection, safety and keeping in touch. We do not sell it, share it
        outside the club, advertise, or track you.
      </P>

      <H2>Children</H2>
      <P>
        Most players are under 18. Younger children do not sign in — their
        accounts are held by parents, guardians, coaches and club staff. From
        U13 upwards, players are allowed to hold their own accounts, and a
        parent or carer is still kept on record for them. Every account,
        whoever holds it, sees nothing until the club has approved it.
        Photographs are optional and can be removed at any time on request.
      </P>

      <H2>Who can see what</H2>
      <P>
        Access is by role and limited to your own squads. Contact details for a
        child are visible to that child&apos;s family and to the squad&apos;s
        coaches and managers. Everyone in a squad can see the names,
        photographs and availability of the rest of that squad, which is what
        makes a team sheet work. Player photographs are never public.
      </P>

      <H2>Where it is kept</H2>
      {/* "Tokyo, Japan" named the region until 23 Aug 2026 — Jay: "we don't
          need to mention Tokyo, we will just say secure providers". The
          region is still a fact anyone can ask the club about; it is just
          not a sentence this policy needs. */}
      <P>
        With secure, reputable hosting and email providers who act on the
        club&apos;s instructions only. If the app breaks, an error report goes
        to a monitoring service so it can be fixed. If you sign in with
        Google, Google will know you did.
      </P>

      {/* ⚠️ EVERY CLAIM BELOW IS A REAL, LIVE MEASURE, checked 30 Aug 2026:
          RLS on every table enforced in Postgres itself; the pending-approval
          model (memberships start 'pending' and read policies require
          'active'); HTTPS via Netlify; daily backups (Supabase Pro, 13 Aug);
          Better Stack uptime monitors and Sentry error reporting, both live
          (claude/runbooks/monitoring.md). If any of these is switched off,
          this section changes in the same commit. No guarantees are made on
          purpose — "how we protect it", never "cannot be breached". */}
      <H2>How we protect it</H2>
      <P>
        Security was built into this app from the start, not added on. Every
        request is checked inside the database itself against who you are and
        which squad you belong to — not just in the app — so no screen can
        show you information you are not entitled to. A new account sees
        nothing at all until the club has approved it. Everything travels
        encrypted, the database is backed up every day, and independent
        monitoring alerts the club the moment anything breaks. If you ever
        notice something that does not look right, tell us at the address
        above.
      </P>

      <H2>Notifications and your device</H2>
      <P>
        Push notifications are only sent if you turn them on, and you can turn
        them off in the app or your phone&apos;s settings. The app keeps a
        sign-in token on your device so you stay signed in; signing out
        removes it. There are no advertising or tracking cookies.
      </P>

      <H2>Your choices</H2>
      <P>
        Sign in to see and correct what is held about you and your children.
        You can{' '}
        <Link to="/delete-account" className="font-bold text-brand-ink underline">
          delete your account
        </Link>{' '}
        at any time. To have the club remove your family&apos;s details from
        its records as well, email the address above. Information is kept only
        while you or your players are part of the club.
      </P>

      <H2>Changes</H2>
      <P>
        If this policy changes, the date above changes with it.
      </P>

      <p className="mt-8 border-t border-line pt-4 text-center text-[13px] text-ink-muted">
        <Link to="/delete-account" className="font-bold underline">
          Delete your account
        </Link>
      </p>
    </main>
  )
}
