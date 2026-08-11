import { useState } from 'react'
import { registerMyPlayer } from '../data/members.js'
import Segmented from './Segmented.jsx'
import Button from './Button.jsx'
import { GENDERS, genderRequiredMessage, squadRequiresGender } from '../lib/gender.js'

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
// ⚠️ WHAT THIS FORM CREATES IS NOT ACCESS. register_my_player writes a
// membership with status='pending', which attaches the person to the squad's
// FIXTURES and to their own child, and to nothing else — private.can_see_team
// requires status='active'. That is the entire point of the pending design:
// without it, anyone who signs up and types "U13" reads every U13 child's name
// and photo, because `player read` is squad-wide. Measured live on 8 Aug 2026:
// a single new membership row on U16 returned 6 players. Do not "simplify"
// this into an immediate grant.
//
// ⚠️ THE AGE-GROUP LIST CAN LEGITIMATELY BE EMPTY HERE, and that is a database
// limitation rather than a loading state. `team read` is
//
//     EXISTS (SELECT 1 FROM memberships m
//              WHERE m.profile_id = auth.uid() AND m.club_id = teams.club_id)
//
// — read from the live database on 8 Aug 2026, not from the schema capture —
// so a person with ZERO memberships reads ZERO teams, which is exactly the
// person this screen is for. Until that policy is widened (see
// db/migrations/20260808_teams_readable_before_registration.sql, written but
// NOT applied) the dropdown has nothing to put in it, and the honest thing is
// to say so and hand them the secondary route rather than render an empty
// select that cannot be submitted. RequestAccess's own header comment records
// the same fact from the other side.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

// ⚠️ "My child" FIRST, and it is the default. Registering a child is the
// overwhelmingly common case, and a default of "I'm the player" would have a
// distracted parent register themselves as a twelve-year-old.
const WHO_OPTIONS = [
  { value: 'child', label: 'My child' },
  { value: 'self', label: "I'm the player" },
]

// Mirrors the two client-side-checkable guards inside register_my_player
// (blank name, over 80 characters). The database is what actually enforces
// them — these exist so the common typo does not cost a round trip and come
// back as a code this screen then has to translate.
const NAME_MAX = 80

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
  const [fullName, setFullName] = useState('')
  const [teamId, setTeamId] = useState('')
  // null, not '' — matches players.gender, which is nullable and has a CHECK
  // that refuses the empty string. Most squads never ask for it.
  const [gender, setGender] = useState(null)
  // "Am I the player?" — false is the historic behaviour and stays the default,
  // so someone who never sees the question registers exactly as before.
  const [selfRegister, setSelfRegister] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // sort_order then name, the same ordering every other age-group list in the
  // app uses (Accounts, InviteForm, AccessBuilder). A parent scanning for
  // "U13" should find it where they expect it, not in insertion order.
  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

  // Whether the CHOSEN squad makes gender mandatory, so the field appears the
  // moment they pick U16G Contact rather than after a rejected submit.
  const selectedTeam = sortedTeams.find((team) => team.id === teamId)
  const genderRequired = squadRequiresGender(selectedTeam?.name)

  // ⚠️ THE SQUAD DECIDES, AND IT COMES FROM A COLUMN — teams.self_registration_allowed,
  // never the squad's name. 20260806_claim_roster_access.sql ruled that a
  // rename must not be able to hand an account a role it shouldn't have, and
  // parsing "U13" out of the text here would do exactly that. The database
  // refuses it independently; this only decides whether to ASK.
  const canSelfRegister = selectedTeam?.self_registration_allowed === true

  async function handleSubmit(event) {
    event.preventDefault()

    const name = fullName.trim()
    if (!name) {
      setError("Enter your player's name.")
      return
    }
    if (name.length > NAME_MAX) {
      setError(`That name is too long — ${NAME_MAX} characters at most.`)
      return
    }
    if (!teamId) {
      setError("Choose your player's age group.")
      return
    }

    // ⚠️ Gender is required only when the SQUAD is single-gender (Jay, 9 Aug
    // 2026). Mirrors the guard inside register_my_player, which is what
    // actually enforces it — this exists so the common case does not cost a
    // round trip, exactly like the name checks above.
    //
    // Note the asymmetry with the mismatch rule: a gender that CONTRADICTS the
    // squad is allowed through here and everywhere else. Only a blank is
    // refused. Do not "tighten" this into a match check.
    if (squadRequiresGender(selectedTeam?.name) && !gender) {
      setError(genderRequiredMessage(selectedTeam.name))
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      // ⚠️ `canSelfRegister &&` is not belt-and-braces, it is the guard. The
      // reset in the select's onChange covers changing squad; this covers the
      // case where `teams` reloads underneath the form and the squad's
      // permission changes while the answer is still held in state.
      await registerMyPlayer(name, teamId, gender, canSelfRegister && selfRegister)
      // No success state on purpose: reloading the provider gives this person
      // a membership, so AppShell stops rendering this component entirely and
      // shows them the app with the waiting-to-be-approved banner. A
      // "Registered!" card here would be a screen nobody ever sees, or worse,
      // one that lingers if the reload were ever made conditional.
      await onRegistered?.()
    } catch (err) {
      // registerMyPlayer has already turned the RPC's error code into a
      // sentence (see REGISTER_MESSAGES in src/data/members.js). Anything
      // still without a message is a network-level failure.
      setError(err?.message || "We couldn't add that player. Try again in a moment.")
      setSubmitting(false)
    }
  }

  const secondary = (
    <Button variant="secondary" full onClick={onAskForAccess} className="mt-4">
      I&apos;m not adding a player
    </Button>
  )

  if (sortedTeams.length === 0) {
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

      {/* Said up front, not after they submit. Someone who registers a child
          and then finds the roster empty will assume the app is broken; being
          told in advance that the squad list waits for approval turns the same
          screen into the expected outcome. */}
      <p className="mt-3 rounded-[11px] bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink-muted">
        A coach or admin checks every new player, so the rest of the squad stays
        hidden until they&apos;ve approved you. That usually takes a day or two.
      </p>

      <form className="mt-5" onSubmit={handleSubmit} noValidate>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
          >
            {error}
          </p>
        )}

        <label htmlFor="register-player-name" className={LABEL}>
          {/* Follows the answer above: a 16-year-old filling in "Player's full
              name" about themselves reads as a form written for somebody
              else. */}
          {selfRegister ? 'Your full name' : "Player's full name"}
        </label>
        <input
          id="register-player-name"
          name="playerName"
          type="text"
          autoComplete="off"
          maxLength={NAME_MAX}
          value={fullName}
          disabled={submitting}
          onChange={(event) => setFullName(event.target.value)}
          className={FIELD}
        />

        <label htmlFor="register-player-team" className={`${LABEL} mt-4`}>
          Age group
        </label>
        <select
          id="register-player-team"
          name="teamId"
          value={teamId}
          disabled={submitting}
          onChange={(event) => {
            const nextId = event.target.value
            setTeamId(nextId)
            // ⚠️ CLEAR THE ANSWER WHEN THE QUESTION DISAPPEARS. Tick "this is
            // me" on U18B, then change your mind to U10 Mixed, and without this
            // the flag survives on a squad that never showed the control. The
            // database would refuse it, but the person would be reading an
            // error about a question they can no longer see.
            const next = sortedTeams.find((team) => team.id === nextId)
            if (next?.self_registration_allowed !== true) setSelfRegister(false)
          }}
          className={FIELD}
        >
          {/* An empty first option, not a pre-selected squad: a default that
              happens to be right for one family is wrong for every other one,
              and a wrong age group is a row an admin has to notice and fix. */}
          <option value="">Choose an age group…</option>
          {sortedTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {/* ⚠️ CONDITIONAL on the SQUAD's column, and it appears ABOVE the
            gender field on purpose: "who is this?" changes the meaning of every
            question under it, so being asked it after naming the player reads
            as an afterthought. Squads below U13 never see it and register
            exactly as they did before. */}
        {canSelfRegister && (
          <Segmented
            legend="Who are you registering?"
            name="register-who"
            options={WHO_OPTIONS}
            value={selfRegister ? 'self' : 'child'}
            onChange={(next) => setSelfRegister(next === 'self')}
            disabled={submitting}
            className="mt-4"
          />
        )}

        {/* ⚠️ CONDITIONAL, not always-on. Asking every parent in the club for
            their child's gender when only seven of the eighteen squads need it
            is a question most families should never see — and an optional
            question on a sign-up form is one people answer wrongly to get
            past it. It appears when the squad demands it, and says why. */}
        {genderRequired && (
          <>
            <p className="mt-4 rounded-[11px] bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              {selectedTeam.name} is a single-gender squad, so we need this one.
            </p>
            <Segmented
              legend="Gender (required)"
              name="register-player-gender"
              options={GENDERS}
              value={gender}
              onChange={setGender}
              disabled={submitting}
              className="mt-2"
            />
          </>
        )}

        <Button type="submit" full disabled={submitting} className="mt-4">
          {submitting ? 'Adding…' : 'Add my player'}
        </Button>
      </form>

      {/* The old route, kept and kept working. Not everyone signing in is a
          parent — a coach, a team manager or a committee member has no child to
          register and would otherwise be stuck on a form that does not describe
          them. */}
      {secondary}

      {children}
    </Shell>
  )
}
