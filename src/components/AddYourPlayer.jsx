import PlayerRegistrationForm from './PlayerRegistrationForm.jsx'

// The "add your player" SECTION of the roll-call (RollCall.jsx). It was the
// whole zero-membership screen until 17 Aug 2026.
//
// Under roster auto-onboarding the primary path was "your squads appear by
// themselves"; under parent self-registration (Jay's ruling 8 Aug 2026, spec
// claude/decisions/2026-08-08-parent-self-registration.md) there is no seeded
// roster to match against, so a parent registers their own child here.
//
// ❌ IT IS NO LONGER ONE HALF OF A FORK. RequestAccess used to be mounted
// alongside it as "the SECONDARY route", reached by a button saying "I'm not
// adding a player" — and the two were mutually exclusive, which is the bug the
// account-creation plan opens with: a coach who came through this door was
// never asked whether he coaches, and the door he did not pick was never
// mentioned again. This renders when the roll-call was TOLD there is a child
// or a player here, alongside whatever else was true.
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
 * component never queries.
 *
 * ⚠️ `onRegistered` NO LONGER MEANS "RELOAD THE PROVIDER", AND THE DIFFERENCE IS
 * LOAD-BEARING SINCE 17 Aug 2026. This is one SECTION of the roll-call
 * (RollCall.jsx), which may still have questions to ask after this one — so it
 * means "this section is finished" and the roll-call decides when to reload.
 * Reloading here would unmount the entire zero-membership screen the instant the
 * first child was registered, taking every remaining question with it, silently.
 *
 * `children` is the sign-out control, passed in from above — someone who cannot
 * get in must always be able to get out.
 *
 * ❌ `onAskForAccess` AND THE "I'm not adding a player" BUTTON ARE GONE. That
 * button WAS the fork this plan exists to remove: the branch a person picked in
 * their first ten seconds decided what the club knew about them from then on,
 * and neither side ever asked about the other. The roll-call asks once and takes
 * every answer that is true.
 */
export default function AddYourPlayer({
  teams = [],
  onRegistered,
  // Carried through from the roll-call's "I play here myself" tick. See the
  // prop's note in PlayerRegistrationForm: it seeds the FIRST row only, and the
  // squad still decides whether a self-registration is allowed at all.
  selfRegistering = false,
  children,
}) {
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

      <PlayerRegistrationForm
        teams={teams}
        onDone={onRegistered}
        submitLabel="Add my player"
        defaultSelfRegister={selfRegistering}
      />

      {children}
    </Shell>
  )
}
