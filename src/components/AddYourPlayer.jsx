import Button from './Button.jsx'
import PlayerRegistrationForm from './PlayerRegistrationForm.jsx'

// What a signed-in account with NO membership sees FIRST: add your player.
//
// Under roster auto-onboarding the primary path was "your squads appear by
// themselves"; under parent self-registration (Jay's ruling 8 Aug 2026, spec
// claude/decisions/2026-08-08-parent-self-registration.md) there is no seeded
// roster to match against, so every parent arrives here and registers their
// own child. RequestAccess — "tell the club who you are and wait" — is still
// mounted alongside this, but as the SECONDARY route, for someone who is not
// registering a child at all: a coach, a committee member, a volunteer.
//
// ⚠️ THE FIELDS THEMSELVES MOVED TO PlayerRegistrationForm.jsx ON 13 AUG 2026,
// when a parent gained the ability to register more than one child. This file
// keeps what is specific to the zero-membership moment — the shell, the copy
// about approval, and the way out to RequestAccess — and nothing else. The form
// is the SAME component /more opens, so there is one implementation of the one
// function a person with no membership may call.
//
// ⚠️ WHAT THIS FORM CREATES IS NOT ACCESS. register_my_player writes a
// membership with status='pending', which attaches the person to the squad's
// FIXTURES and to their own child, and to nothing else — private.can_see_team
// requires status='active'. That is the entire point of the pending design:
// without it, anyone who signs up and types "U13" reads every U13 child's name
// and photo, because `player read` is squad-wide. Measured live on 8 Aug 2026:
// a single new membership row on U16 returned 6 players. Do not "simplify"
// this into an immediate grant.
//
// ❌ THIS BLOCK CLAIMED THE AGE-GROUP LIST IS NORMALLY EMPTY HERE. IT IS NOT,
// AND HAS NOT BEEN SINCE 8 Aug 2026. It quoted `team read` as
//
//     EXISTS (SELECT 1 FROM memberships m
//              WHERE m.profile_id = auth.uid() AND m.club_id = teams.club_id)
//
// and said the migration that widens it was "written but NOT applied". Both
// halves are wrong. Measured on production 17 Aug 2026, straight from
// pg_policy: `team read` is `(SELECT auth.uid()) IS NOT NULL`. It was applied as
// `20260808164111 teams_readable_before_registration`, RESTORE.md has recorded
// the corrected version since 9 Aug, and src/components/RequestAccess.jsx had
// the identical stale claim in its own header until 16 Aug — where believing it
// cost a whole SECURITY DEFINER function, written and dropped the same hour.
// This is the third copy of one rotted sentence.
//
// So a signed-in account with zero memberships reads EVERY squad, and the
// provider's plain `from('teams').select('*')` returns them. The empty branch
// below is now a genuine failure case — a read that failed — rather than the
// expected state, and it stays for that reason and no other.

function Shell({ title, children }) {
  return (
    <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 shadow-card">
      <h2 className="text-center text-lg font-extrabold text-ink">{title}</h2>
      {children}
    </div>
  )
}

/**
 * `teams` comes from the membership provider, which already loads them — this
 * component never queries. `onRegistered` must reload that provider: the new
 * pending membership is what makes the app render at all, and nothing else
 * tells the provider it exists.
 *
 * `onAskForAccess` switches to RequestAccess. `children` is the sign-out
 * control, passed in from AppShell exactly as RequestAccess takes it — someone
 * who cannot get in must always be able to get out.
 */
export default function AddYourPlayer({ teams = [], onRegistered, onAskForAccess, children }) {
  const secondary = (
    <Button variant="secondary" full onClick={onAskForAccess} className="mt-4">
      I&apos;m not adding a player
    </Button>
  )

  // Reached only when the teams read actually failed — see the header. The copy
  // already said "we couldn't load", which was the honest wording for a state
  // the comment above it was describing as normal.
  if (teams.length === 0) {
    return (
      <Shell title="Let&apos;s get you connected">
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
          We couldn&apos;t load the club&apos;s age groups, so there&apos;s nothing to
          pick from yet. Tell the club who you are instead and someone will connect
          you.
        </p>
        {secondary}
        {children}
      </Shell>
    )
  }

  return (
    <Shell title="Add your player">
      <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
        Tell us who you&apos;re here for and we&apos;ll put them in front of the
        club. You&apos;ll be able to see their fixtures and set their availability
        straight away.
      </p>

      {/* ⚠️ SAID UP FRONT, NOT AFTER THEY SUBMIT. Someone who registers a child
          and then finds the roster empty will assume the app is broken; being
          told in advance that the squad list waits for approval turns the same
          screen into the expected outcome.

          The second sentence is new with multi-child registration (13 Aug
          2026): a parent of three arriving at a form with one name box has no
          way of knowing the other two are catered for, and the obvious guess —
          "I suppose I need an account each" — is the expensive one to undo. */}
      <p className="mt-3 rounded-[11px] bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink-muted">
        A coach or admin checks every new player, so the rest of the squad stays
        hidden until they&apos;ve approved you. That usually takes a day or two.
        Got more than one child at the club? Add them all here — one account covers
        the family.
      </p>

      <PlayerRegistrationForm teams={teams} onDone={onRegistered} submitLabel="Add my player" />

      {/* The old route, kept and kept working. Not everyone signing in is a
          parent — a coach, a team manager or a committee member has no child to
          register and would otherwise be stuck on a form that does not describe
          them. */}
      {secondary}

      {children}
    </Shell>
  )
}
