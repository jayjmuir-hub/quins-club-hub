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
const LAST_UPDATED = '7 August 2026'

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

function Bullet({ children }) {
  return (
    <li className="mb-1.5 flex gap-2 text-[14px] leading-relaxed text-ink-muted">
      <span aria-hidden="true" className="text-ink-faint">
        •
      </span>
      <span>{children}</span>
    </li>
  )
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

      <H2>Who holds your information</H2>
      <P>
        Quins Club Hub is run by Abu Dhabi Harlequins Rugby Football Club
        (&ldquo;the club&rdquo;) for managing its own teams. The club decides
        what is stored here and is responsible for it.
      </P>
      <P>
        Questions, corrections, or anything you are unhappy with:{' '}
        <a className="font-bold text-brand underline" href="mailto:admin@adhquins-clubhub.com">
          admin@adhquins-clubhub.com
        </a>
        .
      </P>

      <H2>What we hold</H2>
      <P>
        <span className="font-bold text-ink">Your account.</span> Your email
        address, your first and family name, and when you last signed in. If
        you sign in with Google we receive your email address and the name on
        your Google account — nothing else, and we never see your Google
        password.
      </P>
      <P>
        <span className="font-bold text-ink">Player records.</span> For each
        player: their name, which squad they are in, and optionally a shirt
        number, playing position, whether they are captain, and a photograph.
      </P>
      <P>
        <span className="font-bold text-ink">Contact details.</span> A contact
        email address and phone number for each player, and the names, contact
        details and relationship of parents or guardians.
      </P>
      <P>
        <span className="font-bold text-ink">Availability.</span> Whether a
        player is in, out or unsure for a fixture or training session, and who
        last answered.
      </P>
      <P>
        <span className="font-bold text-ink">Your calendar link.</span> A
        private web address that lets your phone&apos;s calendar app show your
        squad&apos;s fixtures. Anyone who has that address can see those
        fixtures, so do not share it.
      </P>

      <H2>What we do not do</H2>
      <ul className="mb-2.5">
        <Bullet>
          We do not use advertising, analytics or tracking of any kind. The app
          loads no third-party scripts.
        </Bullet>
        <Bullet>We do not sell or share your information with anyone.</Bullet>
        <Bullet>
          We do not use your information to make automated decisions about you.
        </Bullet>
        <Bullet>
          We do not send marketing. The only emails the app sends are sign-in
          links you asked for.
        </Bullet>
      </ul>

      <H2>Children&apos;s information</H2>
      <P>
        Most players in this app are under 18. The app is not designed for
        children to use — accounts are held by parents, guardians, coaches and
        club staff, and a child does not sign in.
      </P>
      <P>
        A parent or guardian can see and correct everything the club holds
        about their own child from inside the app, and can ask for any of it to
        be removed by emailing the address above. Photographs are optional: the
        club does not require one, and you can ask for your child&apos;s to be
        removed at any time.
      </P>
      {/* ⚠️ CORRECTED 7 Aug 2026. This paragraph used to say "A parent sees
          only their own children", which was FALSE and had been live since
          the policy was written.

          What the database actually allows, checked against the RLS policies
          rather than the code: `players`, `events` and `availability` are all
          readable by anyone with a membership row for that squad — so every
          parent in U15 can see all 53 children's names, photos and
          availability answers. Only `player_contacts` and `player_parents`
          are restricted to `is_own_player`, which is where the "only their
          own children" idea came from.

          That sharing is deliberate and is what makes a team sheet work. The
          problem was the policy describing the opposite, which is the
          document a parent would point at if they objected. */}
      <P>
        Who can see what is limited by role. A coach, manager or medic sees
        their own squad, including contact details. A parent or player sees
        the contact details for their own child only — but they also see the
        names, photographs and availability of the rest of that child&apos;s
        squad, which is what makes a team sheet work. Nobody can see another
        family&apos;s phone number, email address or account. Player
        photographs are stored privately and are never publicly readable.
      </P>

      <H2>Where it is stored</H2>
      <P>
        ⚠️ The club&apos;s information is stored on Supabase servers in{' '}
        <span className="font-bold text-ink">Tokyo, Japan</span> — not in the
        UAE. The app itself is delivered by Netlify, and sign-in emails are
        sent by Resend. Those companies process the information on the
        club&apos;s behalf and do not use it for their own purposes.
      </P>
      <P>
        If you sign in with Google, Google will know you signed in to this app.
      </P>

      <H2>How long we keep it</H2>
      <P>
        Account information is kept for as long as you have an account. Player
        and contact records are kept for as long as the player is part of the
        club, and afterwards only as long as the club needs them for its own
        records.
      </P>

      <H2>Your choices</H2>
      <ul className="mb-2.5">
        <Bullet>
          <span className="font-bold text-ink">See it.</span> Sign in and you
          can view everything held about you and your children.
        </Bullet>
        <Bullet>
          <span className="font-bold text-ink">Correct it.</span> You can edit
          your own details and your children&apos;s contact details in the app.
        </Bullet>
        <Bullet>
          <span className="font-bold text-ink">Delete your account.</span>{' '}
          <Link to="/delete-account" className="font-bold text-brand underline">
            Delete it here
          </Link>
          , at any time, without asking anyone.
        </Bullet>
        <Bullet>
          <span className="font-bold text-ink">Ask us to remove more.</span>{' '}
          Deleting your account does not remove the contact details the club
          holds for your family on its roster, so signing in again would set
          your account up again. Email the address above if you want those
          removed too.
        </Bullet>
      </ul>

      <H2>Sign-in and your browser</H2>
      <P>
        When you sign in, the app stores a sign-in token in your browser so you
        do not have to sign in every time. That is the only thing it stores.
        There are no advertising or tracking cookies. Signing out removes it.
      </P>

      <H2>Changes</H2>
      <P>
        If this policy changes, the date at the top changes with it. If the
        change is significant, the club will say so in the app.
      </P>

      <p className="mt-8 border-t border-line pt-4 text-center text-[13px] text-ink-muted">
        <Link to="/delete-account" className="font-bold underline">
          Delete your account
        </Link>
      </p>
    </main>
  )
}
