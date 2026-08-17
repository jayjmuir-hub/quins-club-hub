import { useState } from 'react'
import Button from './Button.jsx'
import Segmented from './Segmented.jsx'
import { GENDERS, genderRequiredMessage, squadRequiresGender } from '../lib/gender.js'
import { MISMATCH, PLAY_UP, ageGradeCheck } from '../lib/ageGrade.js'
import { registerMyPlayer, updateProfileNames } from '../data/members.js'
import { setPlayerDob } from '../data/players.js'
import useMyProfile, { primeMyProfileCache } from '../lib/useMyProfile.js'

// A parent registers ONE OR MORE children in one go.
//
// ⚠️ EXTRACTED FROM AddYourPlayer.jsx ON 13 Aug 2026, AND THE EXTRACTION IS THE
// POINT. Before this, self-registration existed in exactly one place — the
// zero-membership screen — which AppShell renders only while
// `memberships.length === 0`. The moment a parent registered their first child
// the form vanished for good, so a second child could ONLY be added by an admin
// on the desktop Accounts screen. The database never had that limitation:
// `register_my_player`'s rate limit counts PENDING rows precisely so that "an
// approved parent adding a second child later is normal and must not be blocked
// by their own history" (db/migrations/20260808_register_my_player.sql).
//
// So the form lives here, owns no chrome, and is rendered by BOTH callers:
//   AddYourPlayer  — the zero-membership shell, at sign-up
//   YourPlayers    — inside a Sheet on /more, for every child after the first
//
// One component, one code path. Two copies of a form that calls the one
// function a person with no membership may call would be two places to get a
// guard wrong.
//
// ⚠️ THE ROWS ARE SAVED SEQUENTIALLY, NOT CONCURRENTLY, and that is a decision
// rather than an oversight. `register_my_player` takes one player per call, so
// three children are three round trips whatever happens. Firing them at once
// makes a partial failure unreportable — you get three settled promises and no
// way to tell a parent WHICH child is missing. Register.jsx's touchline sweep
// already made this call for the same reason; see its `remaining.reduce` chain.
//
// ⚠️ AND A PARTIAL FAILURE KEEPS WHAT WORKED. Each call is its own committed
// transaction — child one exists the instant it returns — so "roll it all back"
// is not on the table without a delete path that does not exist. What this does
// instead is name the ones that landed, leave the failure and anything untried
// on screen, and let the parent fix just that row.
//
// ⚠️ IT ALSO ASKS FOR THE REGISTRANT'S OWN NAME, AND THAT IS A FIX FOR A RACE
// RATHER THAN AN EXTRA FIELD FOR ITS OWN SAKE — 13 Aug 2026, reported by Jay
// watching a real registration land in the approval queue with no name on it.
//
// `NamePrompt` is the only thing that captures a person's own name, and
// AppShell mounts it inside the `ready` branch, which requires
// `memberships.length > 0`. The membership is ALSO what puts the person into an
// admin's approval queue. So the order was forced and backwards: the queue row
// existed before the name did, every single time. Measured on the live database
// for one real registration — membership at 08:35:50, name at 08:38:33, a gap
// of 2m 43s during which an admin was being asked to approve somebody the
// screen could not name.
//
// ⚠️ AND THE GAP DOES NOT ALWAYS CLOSE. NamePrompt is skippable, so a person
// who taps past it stays nameless indefinitely.
//
// Asking here removes the race at its source: the name is written BEFORE the
// first `register_my_player` call, so by the time a membership exists the
// profile already carries a name. ⚠️ **Asked only when we do not already have
// one** (`name_confirmed_at` is null) — a parent adding a second child from
// /more has long since answered, and asking again would be a form interrogating
// somebody about a fact it is already holding.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

// Mirrors the two client-side-checkable guards inside register_my_player (blank
// name, over 80 characters). The database is what actually enforces them —
// these exist so the common typo does not cost a round trip and come back as a
// code this screen then has to translate.
const NAME_MAX = 80

// Today, ISO. Bounds the date input so the obvious typo is caught before a
// round trip. ⚠️ The database refuses a future date independently
// (player_private_dob_sane), so this is convenience and not the rule.
const TODAY = new Date().toISOString().slice(0, 10)

// ⚠️ THE SAME 5 THE DATABASE ENFORCES, AND IT IS A CEILING ON ROWS ON SCREEN,
// not a count of children the parent has. `register_my_player` refuses a 6th
// PENDING membership per profile (errcode 42901), so a parent with three
// already waiting can only add two more — the server will say so, and the
// partial-failure path below reports it properly. Capping the list here just
// stops somebody building seven rows and losing the last two to a refusal they
// could have been told about before they typed.
export const MAX_ROWS = 5

// ⚠️ "My child" FIRST, and it is the default. Registering a child is the
// overwhelmingly common case, and a default of "I'm the player" would have a
// distracted parent register themselves as a twelve-year-old.
const WHO_OPTIONS = [
  { value: 'child', label: 'My child' },
  { value: 'self', label: "I'm the player" },
]

let nextRowKey = 0
function blankRow() {
  nextRowKey += 1
  return {
    // A stable identity per row. It is the React key, and it is also what the
    // field `id`/`htmlFor` pairs are built from, so every row's label points at
    // that row's own input for the whole life of the row.
    //
    // ⚠️ THIS COMMENT CLAIMED SOMETHING FALSE UNTIL IT WAS TESTED, 13 Aug 2026.
    // It said index keys would leave "row 3's typed name sitting in row 2's
    // input" after a removal. That is the textbook index-key bug and it does NOT
    // happen here: every field is CONTROLLED from `rows` state, so React
    // re-renders the reused DOM node with the correct value either way. The
    // fault was injected on purpose — `key={index}` — and the removal test went
    // green, which is how the claim was caught.
    //
    // The stable key stays, because the `id` attributes derived from it would
    // otherwise be reassigned between rows on every removal, and because a
    // future uncontrolled field here WOULD hit the classic bug. But it is a
    // guard against something that has not happened, not a fix for something
    // that did — and no test in this repo discriminates on it.
    key: `row-${nextRowKey}`,
    // ⚠️ TWO FIELDS SINCE 16 Aug 2026, AND THE SPLIT IS THE FIX RATHER THAN
    // TIDINESS. Jay: "children name and any other name should be two blocks
    // First Name and Last Name, this will stop people only putting a first
    // name". One box got one word, and the live roster has a child on it with a
    // first name and nothing else — nothing to sort by and nothing for a coach
    // to recognise.
    //
    // ⚠️ THE DATABASE STILL HOLDS `full_name` AS THE DISPLAY VALUE, kept in step
    // both ways by private.sync_person_name (20260816_split_player_and_parent_names).
    // So these two are joined on the way out and around thirty readers of
    // full_name are untouched. Do NOT "simplify" this by sending first/last to
    // register_my_player — its signature is public and already carries six
    // parameters, and the trigger makes the join lossless.
    firstName: '',
    lastName: '',
    // ISO yyyy-mm-dd, straight off <input type="date">.
    //
    // ⚠️ IT IS WRITTEN BY A SECOND CALL, NOT BY register_my_player. It lives in
    // public.player_private, whose whole purpose is that a column on `players`
    // would be readable by every parent in the squad — see
    // db/migrations/20260816_player_private_dob.sql. Widening the RPC's
    // signature to take it would have put a sensitive value through a function
    // that returns a membership, and the failure modes are handled per row
    // below instead.
    dob: '',
    teamId: '',
    // null, not '' — matches players.gender, which is nullable and has a CHECK
    // that refuses the empty string. Most squads never ask for it.
    gender: null,
    // "Am I the player?" — false is the historic behaviour and stays the
    // default, so someone who never sees the question registers exactly as
    // before.
    selfRegister: false,
    // ⚠️ WHICH REFUSAL THIS ROW IS CURRENTLY ARGUING WITH, and the tick that
    // answers it. Added 14 Aug 2026 with the duplicate guards — see
    // db/migrations/20260814_registration_duplicate_guards.sql.
    //
    // null | 'duplicate' | 'selfName'. Set from the server's errcode, never
    // guessed here: the matching rule lives in SQL and nowhere else, because
    // the registering parent CANNOT SEE the squad's roster (their membership is
    // pending, so `player read` returns nothing) and any client-side attempt at
    // "is this a duplicate?" would confidently answer no, every time.
    needsConfirm: null,
    confirmDuplicate: false,
    confirmSelfName: false,
    // ⚠️ THE PARENT'S SAY-SO FOR PLAYING UP AN AGE GROUP (17 Aug 2026). Only
    // ever asked for when the birthday and the squad make it a play-up under
    // UAERF rules — see src/lib/ageGrade.js. It is a recorded DECISION, not a
    // derived fact: the dates say a play-up is possible, the tick says somebody
    // chose it.
    playUpConsent: false,
  }
}

// The sentence and the tick for each refusal. The SERVER's message is what is
// shown above these — it names the squad and says what to do instead — so
// these are only the label on the override.
const CONFIRM_LABELS = {
  duplicate: 'This is a different player who happens to have the same name.',
  selfName: 'This really is my child, and they have the same name as me.',
}

// The two errcodes the guards raise. Kept next to the labels so adding a third
// guard has one obvious place to land.
const CONFIRM_FOR_CODE = {
  42710: 'duplicate',
  42809: 'selfName',
}

/**
 * How a row is described when something is wrong with it. Uses the name if
 * there is one, because "Check Rory's age group" beats "Check player 3" for a
 * parent looking at three boxes — and falls back to the position when the row
 * is the blank one they have not filled in yet.
 */
function rowLabel(row, index) {
  const name = joinName(row)
  return name || `player ${index + 1}`
}

/**
 * The two boxes as the one value the database takes.
 *
 * ⚠️ `concat_ws`-shaped rather than a plain template: a missing family name must
 * produce "Kwame", never "Kwame " with a trailing space, because the trigger
 * splits on whitespace and a trailing space would make the last name an empty
 * string rather than null.
 */
function joinName(row) {
  return [row.firstName, row.lastName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * One child's fields. Split out so the conditional gender and self-registration
 * controls stay per-row: both answers are about the individual child, not about
 * the family, and a single-gender squad in row 2 must not make row 1 ask.
 */
/**
 * `askingOwnName` is the "About you" fieldset's presence, and it exists here for
 * exactly one reason.
 *
 * ⚠️ SPLITTING THE NAME INTO TWO BOXES CREATED A LABEL COLLISION THAT DID NOT
 * EXIST BEFORE. A self-registering player's field used to be "Your full name"
 * while the registrant fieldset asked "Your first name" — different strings. As
 * two boxes they both want to be "Your first name", and two identically
 * labelled inputs on one form is a screen-reader ambiguity as well as an
 * untestable one.
 *
 * Resolved by construction rather than by inventing a clumsier label: the warm
 * wording is used only when the fieldset is absent, which is the common case —
 * anybody who has already told us their name. When both would be on screen the
 * row goes back to "Player's first name", and the "Who are you registering?"
 * control immediately above it is what says the player is them.
 */
function PlayerRow({ row, index, total, teams, disabled, askingOwnName, onChange, onRemove }) {
  const selfNamed = row.selfRegister && !askingOwnName
  const selectedTeam = teams.find((team) => team.id === row.teamId)
  const genderRequired = squadRequiresGender(selectedTeam?.name)
  // ⚠️ THE SQUAD DECIDES, AND IT COMES FROM A COLUMN —
  // teams.self_registration_allowed, never the squad's name.
  // 20260806_claim_roster_access.sql ruled that a rename must not be able to
  // hand an account a role it shouldn't have, and parsing "U13" out of the text
  // here would do exactly that. The database refuses it independently; this
  // only decides whether to ASK.
  const canSelfRegister = selectedTeam?.self_registration_allowed === true

  // Silent until BOTH answers are on screen, so nobody is questioned about a
  // squad they have not picked yet.
  //
  // ⚠️ `squadNames` IS WHAT LETS THE MESSAGE NAME A REAL SQUAD — "That is U12
  // Mixed" rather than "That is U12" (Jay, 17 Aug 2026). It is the list the
  // dropdown is already built from, so the squad it names is always one the
  // parent can actually pick. Passing nothing degrades to the band, which is
  // why this is an option and not a required argument.
  const ageCheck = ageGradeCheck(selectedTeam?.name, row.dob, undefined, {
    squadNames: teams.map((team) => team.name),
  })

  const firstId = `register-player-first-${row.key}`
  const lastId = `register-player-last-${row.key}`
  const dobId = `register-player-dob-${row.key}`
  const teamId = `register-player-team-${row.key}`

  return (
    <li data-testid="player-row" className={index === 0 ? '' : 'mt-5 border-t border-line pt-4'}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={firstId} className={`${LABEL} mb-0`}>
          {/* Follows the answer below: a 16-year-old filling in "Player's first
              name" about themselves reads as a form written for somebody else.
              Numbered only once there is more than one row — "Player 1's first
              name" on a lone field is bureaucratic noise. */}
          {selfNamed
            ? 'Your first name'
            : total === 1
              ? "Player's first name"
              : `Player ${index + 1}'s first name`}
        </label>
        {/* Never on the first row: a list you can empty is a form with no
            fields, and "add a player" with nothing to fill in is a dead end. */}
        {index > 0 && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${rowLabel(row, index)}`}
            className="rounded-[8px] px-2 py-1 text-xs font-bold text-ink-muted transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remove
          </button>
        )}
      </div>

      <input
        id={firstId}
        name="playerFirstName"
        type="text"
        autoComplete="off"
        maxLength={NAME_MAX}
        value={row.firstName}
        disabled={disabled}
        // ⚠️ EDITING EITHER NAME WITHDRAWS THE CONFIRMATION, and that is not
        // tidiness. The tick means "yes, THIS name is deliberate" — carrying it
        // across a rewrite would let somebody confirm a warning about one name
        // and then submit a different one with the guard already switched off.
        // Both boxes clear it, because either one changes who this is.
        onChange={(event) =>
          onChange({
            firstName: event.target.value,
            needsConfirm: null,
            confirmDuplicate: false,
            confirmSelfName: false,
          })
        }
        className={FIELD}
      />

      {/* ⚠️ REQUIRED, AND NOT MARKED OPTIONAL — unlike the family-name box on
          NamePrompt and the You card, which say so and mean it. The argument
          firstProblem() already makes for the REGISTRANT's own name applies with
          more force to a child: this name is how a coach tells one twelve-year-old
          from another on a team sheet, and "Marco" does not do that. */}
      <label htmlFor={lastId} className={`${LABEL} mt-4`}>
        {selfNamed
          ? 'Your family name'
          : total === 1
            ? "Player's family name"
            : `Player ${index + 1}'s family name`}
      </label>
      <input
        id={lastId}
        name="playerLastName"
        type="text"
        autoComplete="off"
        maxLength={NAME_MAX}
        value={row.lastName}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            lastName: event.target.value,
            needsConfirm: null,
            confirmDuplicate: false,
            confirmSelfName: false,
          })
        }
        className={FIELD}
      />

      {/* Only ever rendered because the SERVER refused this row and said why.
          The message itself is in the alert above the list — it names the
          squad and gives the correct action — so this is just the way past it
          for the case where the person really does know better. */}
      {row.needsConfirm && (
        <label className="mt-2 flex items-start gap-2 rounded-[11px] bg-danger-bg px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed text-brand-deep">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            checked={
              row.needsConfirm === 'duplicate' ? row.confirmDuplicate : row.confirmSelfName
            }
            disabled={disabled}
            onChange={(event) =>
              onChange(
                row.needsConfirm === 'duplicate'
                  ? { confirmDuplicate: event.target.checked }
                  : { confirmSelfName: event.target.checked },
              )
            }
          />
          <span>{CONFIRM_LABELS[row.needsConfirm]}</span>
        </label>
      )}

      {/* ⚠️ ABOVE THE AGE GROUP, DELIBERATELY. The date is the fact; the squad is
          a decision made from it. Asking for the squad first invites a guess and
          then makes the date look like paperwork confirming it. */}
      <label htmlFor={dobId} className={`${LABEL} mt-4`}>
        {selfNamed ? 'Your date of birth' : total === 1 ? 'Date of birth' : `Player ${index + 1}'s date of birth`}
      </label>
      <input
        id={dobId}
        name="playerDob"
        type="date"
        value={row.dob}
        disabled={disabled}
        // The database refuses a future date and anything before 1900
        // (player_private_dob_sane). These bounds only save a round trip.
        max={TODAY}
        min="1900-01-02"
        onChange={(event) => onChange({ dob: event.target.value })}
        className={FIELD}
      />

      <label htmlFor={teamId} className={`${LABEL} mt-4`}>
        {total === 1 ? 'Age group' : `Player ${index + 1}'s age group`}
      </label>
      <select
        id={teamId}
        name="teamId"
        value={row.teamId}
        disabled={disabled}
        onChange={(event) => {
          const nextId = event.target.value
          const next = teams.find((team) => team.id === nextId)
          // ⚠️ CLEAR THE ANSWER WHEN THE QUESTION DISAPPEARS. Tick "this is me"
          // on U18B, then change your mind to U10 Mixed, and without this the
          // flag survives on a squad that never showed the control. The database
          // would refuse it, but the person would be reading an error about a
          // question they can no longer see.
          onChange({
            teamId: nextId,
            selfRegister: next?.self_registration_allowed === true ? row.selfRegister : false,
          })
        }}
        className={FIELD}
      >
        {/* An empty first option, not a pre-selected squad: a default that
            happens to be right for one family is wrong for every other one, and
            a wrong age group is a row an admin has to notice and fix. */}
        <option value="">Choose an age group…</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>

      {/* ⚠️ TWO DIFFERENT ANSWERS, AND THE DIFFERENCE IS THE FEATURE.
          A MISMATCH warns and still saves — the club's standing ruling for this
          picker, the same asymmetry as the gender rule, which refuses a BLANK
          and permits a CONTRADICTION. A PLAY-UP is not a mistake at all: it is
          allowed under UAERF rules with the parent's consent, so it asks for
          that consent rather than warning about it.

          ⚠️ THE AGE IS TAKEN AT THE 31 AUGUST CUT-OFF, NEVER TODAY. A U13 squad
          is mostly twelve-year-olds for most of the season. See
          src/lib/ageGrade.js before touching any of this. */}
      {ageCheck.status === MISMATCH && (
        <p
          role="status"
          className="mt-2 rounded-[11px] bg-warn-bg px-3 py-2.5 text-sm leading-relaxed text-ink"
        >
          {ageCheck.message}
        </p>
      )}

      {ageCheck.status === PLAY_UP && (
        <div className="mt-2 rounded-[11px] bg-warn-bg px-3 py-2.5">
          <p role="status" className="text-sm leading-relaxed text-ink">
            {ageCheck.message}
          </p>
          {/* ⚠️ AN EXPLICIT TICK, NOT AN INFERENCE FROM THE DATES. Playing up is
              the parent's decision to make and the club's to know about; a
              consent nobody gave is not a consent. The tournament site takes the
              same tick for the same reason. */}
          <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={row.playUpConsent === true}
              disabled={disabled}
              onChange={(event) => onChange({ playUpConsent: event.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--maroon)]"
            />
            Yes, I&apos;m happy for them to play up an age group.
          </label>
        </div>
      )}

      {/* ⚠️ CONDITIONAL on the SQUAD's column, and it appears ABOVE the gender
          field on purpose: "who is this?" changes the meaning of every question
          under it, so being asked it after naming the player reads as an
          afterthought. Squads below U13 never see it. */}
      {canSelfRegister && (
        <Segmented
          legend="Who are you registering?"
          name={`register-who-${row.key}`}
          options={WHO_OPTIONS}
          value={row.selfRegister ? 'self' : 'child'}
          onChange={(next) => onChange({ selfRegister: next === 'self' })}
          disabled={disabled}
          className="mt-4"
        />
      )}

      {/* ⚠️ CONDITIONAL, not always-on. Asking every parent in the club for
          their child's gender when only seven of the eighteen squads need it is
          a question most families should never see — and an optional question
          on a sign-up form is one people answer wrongly to get past it. It
          appears when the squad demands it, and says why. */}
      {genderRequired && (
        <>
          <p className="mt-4 rounded-[11px] bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
            {selectedTeam.name} is a single-gender squad, so we need this one.
          </p>
          <Segmented
            legend="Gender (required)"
            name={`register-player-gender-${row.key}`}
            options={GENDERS}
            value={row.gender}
            onChange={(next) => onChange({ gender: next })}
            disabled={disabled}
            className="mt-2"
          />
        </>
      )}
    </li>
  )
}

/**
 * `teams` comes from the membership provider, which already loads them — this
 * component never queries.
 *
 * `onDone` must reload that provider. At sign-up the new pending membership is
 * what makes the app render at all, and nothing else tells the provider it
 * exists; on /more it is what puts the new child into the list behind the
 * sheet. It is called on a full success, and on the escape hatch a parent takes
 * when they give up on a row that keeps being refused.
 *
 * `submitLabel` differs by caller ("Add my player" at sign-up reads wrong as
 * the label on a sheet opened from a list of children you already have).
 */
/**
 * ⚠️ `defaultSelfRegister` APPLIES TO THE FIRST ROW ONLY, AND IT IS AN ANSWER
 * CARRIED IN RATHER THAN A PREFERENCE. The roll-call asks "do you play here
 * yourself?" before this form is ever rendered; without this the tick would
 * change nothing and the person would be asked the same question again, per row,
 * by a control they have already answered. A row ADDED afterwards is a different
 * person and defaults to false, which is why this is not simply the new default.
 *
 * ⚠️ IT CANNOT SMUGGLE A SELF-REGISTRATION PAST A SQUAD THAT FORBIDS ONE. The
 * squad decides, from `teams.self_registration_allowed`: choosing one that
 * forbids it clears the flag (the select's onChange), and the submit forces
 * `canSelfRegister && row.selfRegister` again on the way out. Both guards
 * predate this prop and are what make it safe to set before a squad is picked.
 */
export default function PlayerRegistrationForm({
  teams = [],
  onDone,
  submitLabel = 'Add my player',
  defaultSelfRegister = false,
}) {
  const [rows, setRows] = useState(() => [
    { ...blankRow(), selfRegister: Boolean(defaultSelfRegister) },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // The registrant's own name — see the header note. `profile` resolves
  // asynchronously, so `needsName` is false on the first render and becomes
  // true when the row arrives; that is the right way round, because a field
  // that appears is better than one that vanishes under a thumb mid-typing.
  const { profile } = useMyProfile()
  const needsName = Boolean(profile?.id) && !profile.name_confirmed_at
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // The children that were saved before something went wrong, by name. Held
  // separately from `error` because it is good news and is worded as such —
  // and because a parent who then fixes the failing row must not see the first
  // batch reported twice.
  const [saved, setSaved] = useState([])

  // sort_order then name, the same ordering every other age-group list in the
  // app uses (Accounts, InviteForm, AccessBuilder). A parent scanning for "U13"
  // should find it where they expect it, not in insertion order.
  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

  function updateRow(key, patch) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  /**
   * The client-side half of the guards, run over every row BEFORE any request
   * goes out. Returns a sentence, or null when the list is good.
   *
   * ⚠️ ALL ROWS ARE CHECKED, NOT JUST THE FIRST BAD ONE — or rather, the first
   * bad one is reported but every row is reachable, because validating only the
   * row being submitted would let a parent fix row 1, resubmit, and be told
   * about row 2 on the next trip. One message per attempt, but the attempt
   * costs nothing.
   */
  function firstProblem() {
    // ⚠️ CHECKED FIRST, because it is written first. A list that saved two
    // children and then refused on a blank "your name" would have created the
    // exact nameless queue rows this field exists to prevent.
    if (needsName && !firstName.trim()) {
      return 'Enter your own first name, so the club knows who is registering.'
    }
    // ⚠️ BOTH NAMES ARE REQUIRED HERE, AND THAT DEPARTS FROM THE REST OF THE
    // APP ON PURPOSE — Jay, 13 Aug 2026.
    //
    // NamePrompt, RequestAccess and the You card all make the family name
    // optional, and NamePrompt states the reason: "plenty of people have one
    // name, and a gate nobody can pass is worse than a sortable list." That
    // principle is sound for those fields, which exist so the app has A name
    // for somebody — a greeting, an initial, a sortable list.
    //
    // This field exists for one purpose only: so a coach can identify a
    // STRANGER asking to join a children's squad. "Sarah" does not do that, and
    // the club has enough families that it will not do it more than once.
    //
    // Measured before changing it, rather than argued: of 13 adults with a
    // confirmed name, ZERO have no family name, and zero of 9 players have a
    // single-word name. The exemption was protecting nobody here. Jay's call
    // was to require it outright and skip the "I have only one name" escape
    // that was offered — so a genuine mononym would have to put something in
    // the box. ⚠️ If that person ever turns up, THIS is the line to revisit,
    // and the escape hatch is the fix, not deleting the requirement.
    if (needsName && !lastName.trim()) {
      return 'Enter your family name too — a first name alone is not enough for a coach to know who you are.'
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const first = row.firstName.trim()
      const last = row.lastName.trim()
      const name = joinName(row)
      const team = sortedTeams.find((candidate) => candidate.id === row.teamId)

      if (!first) {
        return rows.length === 1
          ? "Enter your player's first name."
          : `Enter a first name for player ${index + 1}.`
      }
      // ⚠️ THE FAMILY NAME IS REQUIRED HERE TOO, AND THE REASONING IS THE SAME
      // ONE THE REGISTRANT'S OWN NAME CARRIES ABOVE — with more force, not less.
      // A coach approving this is being asked to recognise a CHILD they may
      // never have met, from a squad of children whose first names repeat. The
      // live roster already carries one player with a first name and nothing
      // else, which is the row that caused this change.
      //
      // ⚠️ IF A GENUINE MONONYM EVER REGISTERS, THIS IS THE LINE TO REVISIT AND
      // AN ESCAPE HATCH IS THE FIX, NOT DELETING THE REQUIREMENT. Same ruling as
      // the registrant field. Measured before it was imposed there: zero of the
      // club's adults and zero of its players had a single-word name by choice.
      if (!last) {
        return rows.length === 1
          ? "Enter your player's family name — a first name alone isn't enough for a coach to tell one child from another."
          : `Enter a family name for player ${index + 1}.`
      }
      // ⚠️ REQUIRED. A youth club that cannot say how old a child is cannot
      // check the age group they were put in, and the squad name has been the
      // only age signal in this app until now (src/lib/ageGroup.js).
      if (!row.dob) {
        return rows.length === 1
          ? "Enter your player's date of birth."
          : `Enter a date of birth for ${rowLabel(row, index)}.`
      }
      if (row.dob > TODAY) {
        return `${rowLabel(row, index)}'s date of birth cannot be in the future.`
      }
      if (name.length > NAME_MAX) {
        return `${name.slice(0, 20)}… is too long — ${NAME_MAX} characters at most.`
      }
      if (!row.teamId) {
        return `Choose an age group for ${rowLabel(row, index)}.`
      }
      // ⚠️ Gender is required only when the SQUAD is single-gender (Jay, 9 Aug
      // 2026). Mirrors the guard inside register_my_player, which is what
      // actually enforces it.
      //
      // Note the asymmetry with the mismatch rule: a gender that CONTRADICTS
      // the squad is allowed through here and everywhere else. Only a blank is
      // refused. Do not "tighten" this into a match check.
      if (team && squadRequiresGender(team.name) && !row.gender) {
        return genderRequiredMessage(team.name)
      }
      // ⚠️ A PLAY-UP NEEDS THE PARENT TO SAY SO, AND THIS IS A REFUSAL WHERE THE
      // MISMATCH BESIDE IT IS ONLY A WARNING. The difference is what each one
      // means: a mismatch is probably a typo, and blocking typos would block
      // genuine dispensations too. A play-up is not a mistake — it is a real
      // decision, permitted under UAERF rules WITH consent, and the club is
      // about to be told a child is playing outside their own age group. A
      // consent nobody gave is not a consent.
      if (team && ageGradeCheck(team.name, row.dob).status === PLAY_UP && !row.playUpConsent) {
        return rows.length === 1
          ? 'Tick to confirm you are happy for them to play up an age group.'
          : `Tick to confirm ${rowLabel(row, index)} may play up an age group.`
      }
    }
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const problem = firstProblem()
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setSaved([])
    setSubmitting(true)

    // ⚠️ THE NAME GOES FIRST, AND THE ORDER IS THE ENTIRE FIX. Writing it after
    // the children would leave the same race in place — the membership, and so
    // the admin's queue row, would exist before the profile had a name.
    //
    // A failure here stops everything: it is one round trip, nothing has been
    // created yet, and carrying on would produce precisely the nameless row
    // this is here to avoid. updateProfileNames reads the row back and throws
    // on a refusal rather than reporting a silent zero-row success.
    if (needsName) {
      try {
        const updated = await updateProfileNames({
          profileId: profile.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
        // The masthead initial and the dashboard greeting read this cache and
        // it is never invalidated by itself — priming it is the documented
        // escape hatch (see useMyProfile's header). Without this the person
        // has just told us their name and the app keeps showing "?" until a
        // reload.
        primeMyProfileCache(profile.id, updated)
      } catch (err) {
        setError(err?.message || "We couldn't save your name. Try again in a moment.")
        setSubmitting(false)
        return
      }
    }

    // Saved in order, stopping at the first refusal. See the header note: one
    // player per call is the RPC's shape, and sequential is what makes a
    // partial failure something we can describe.
    const done = []
    // Children who registered but whose birthday did not save. Deliberately not
    // an error — see the note at the write below.
    const missedDob = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const team = sortedTeams.find((candidate) => candidate.id === row.teamId)
      // The two boxes as the one value register_my_player takes. The database
      // splits it straight back apart — see joinName and the sync_person_name
      // trigger — so nothing is lost by joining here.
      const name = joinName(row)
      try {
        // ⚠️ `canSelfRegister &&` is not belt-and-braces, it is the guard. The
        // reset in the select's onChange covers changing squad; this covers the
        // case where `teams` reloads underneath the form and the squad's
        // permission changes while the answer is still held in state.
        const canSelfRegister = team?.self_registration_allowed === true
        // eslint-disable-next-line no-await-in-loop -- sequential is the design;
        // see the header note on partial failure.
        const created = await registerMyPlayer(name, row.teamId, row.gender, canSelfRegister && row.selfRegister, {
          confirmDuplicate: row.confirmDuplicate === true,
          confirmSelfName: row.confirmSelfName === true,
        })
        // ⚠️ THE BIRTHDAY IS A SECOND WRITE, AND A FAILURE HERE MUST NOT LOOK
        // LIKE A FAILED REGISTRATION. The child exists the moment the call above
        // returns — its transaction is committed and there is no delete path —
        // so throwing out of here would tell a parent their child was not added
        // when it was, and the obvious response is to submit again.
        //
        // The player id comes off the membership register_my_player returns;
        // there is no other way to learn it, because a pending parent cannot
        // read `players` by name.
        if (created?.player_id && row.dob) {
          try {
            // ⚠️ THE PLAY-UP RIDES WITH THE BIRTHDAY, ON THE SAME WRITE. It is
            // the only place both facts are known at once: the trigger that
            // emails the squad fires on the membership INSERT above, before this
            // row exists, so nothing server-side can derive it at that moment.
            //
            // ⚠️ AND THE CHECK IS RE-RUN RATHER THAN TRUSTING THE TICK ALONE. A
            // parent can tick the box and then change the squad or the date to
            // one that is no longer a play-up; the tick would survive in state
            // and record a consent for something that is not happening.
            await setPlayerDob(created.player_id, row.dob, {
              playsUp:
                row.playUpConsent === true &&
                ageGradeCheck(team?.name, row.dob).status === PLAY_UP,
            })
          } catch {
            // Swallowed on purpose, and recorded rather than surfaced: the
            // registration succeeded and the queue row is correct. A coach can
            // add the date, and the completeness card (plan item 6) is what is
            // meant to chase it. Turning this into an alert would train parents
            // to re-submit a child who is already registered.
            missedDob.push(name)
          }
        }
        done.push(name)
      } catch (err) {
        // registerMyPlayer has already turned the RPC's error code into a
        // sentence (see REGISTER_MESSAGES in src/data/members.js). Anything
        // still without a message is a network-level failure.
        const reason = err?.message || "We couldn't add that player. Try again in a moment."
        setSaved(done)
        // ⚠️ THE TWO GUARD CODES GET A TICK RATHER THAN A DEAD END. Both
        // refusals describe something that is USUALLY a mistake and
        // OCCASIONALLY correct — two boys with the same name in one squad, or a
        // child named after their father. A hard stop would be idiot-proof and
        // also wrong for those families, with no route left but ringing the
        // club. The tick is offered on the failing row only, and editing the
        // name withdraws it.
        const confirm = CONFIRM_FOR_CODE[err?.code] ?? null
        // What is left on screen is the row that failed and anything after it.
        // The saved ones are gone from the list because they are no longer
        // something to submit — leaving them would let a parent resubmit a
        // child who is already in, creating a duplicate the club has to spot.
        const remaining = rows.slice(index)
        setRows(
          confirm
            ? remaining.map((candidate, offset) =>
                offset === 0 ? { ...candidate, needsConfirm: confirm } : candidate,
              )
            : remaining,
        )
        setError(done.length > 0 ? `${rowLabel(row, index)} wasn't added — ${reason}` : reason)
        setSubmitting(false)
        return
      }
    }

    // ⚠️ NO SUCCESS STATE HERE ON PURPOSE. At sign-up, reloading the provider
    // gives this person a membership, so AppShell stops rendering the caller
    // entirely and shows them the app; on /more the caller closes its sheet. A
    // "Registered!" card would be a screen nobody ever sees, or worse, one that
    // lingers if either caller's reload were ever made conditional.
    await onDone?.()
  }

  const atCap = rows.length >= MAX_ROWS

  return (
    <form className="mt-5" onSubmit={handleSubmit} noValidate>
      {/* Good news and bad news are two elements, not one string. The saved
          list is a `status` — nothing went wrong with those children and a
          parent should not have to read an alert to find that out. */}
      {saved.length > 0 && (
        <p
          role="status"
          data-testid="registered-so-far"
          className="mb-3 rounded-[11px] bg-accent-bg px-3 py-2 text-sm font-semibold text-accent-ink"
        >
          {saved.length === 1
            ? `${saved[0]} is registered.`
            : `${saved.slice(0, -1).join(', ')} and ${saved[saved.length - 1]} are registered.`}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
        >
          {error}
        </p>
      )}

      {/* ⚠️ ABOVE THE CHILDREN, and that is deliberate. "Who are you?" before
          "who are you registering?" is the order a person expects, and it is
          also the order the submit runs in. A field asked after the thing it
          precedes reads as an afterthought and gets skipped.

          Absent entirely once we hold a confirmed name, so a parent adding a
          second child from /more never sees it. */}
      {needsName && (
        <fieldset className="mb-5 rounded-[11px] bg-surface px-3 py-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
            About you
          </legend>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            The coach approving this needs to know who asked. This is your name, not
            your child&apos;s.
          </p>

          <label htmlFor="register-your-first-name" className={`${LABEL} mt-3`}>
            Your first name
          </label>
          <input
            id="register-your-first-name"
            name="yourFirstName"
            type="text"
            autoComplete="given-name"
            value={firstName}
            disabled={submitting}
            onChange={(event) => setFirstName(event.target.value)}
            className={FIELD}
          />

          {/* ⚠️ NOT marked optional, unlike every other family-name field in
              the app. See the guard in firstProblem() for why this one is
              different and what to revisit if a mononym ever registers. */}
          <label htmlFor="register-your-last-name" className={`${LABEL} mt-3`}>
            Your family name
          </label>
          <input
            id="register-your-last-name"
            name="yourLastName"
            type="text"
            autoComplete="family-name"
            value={lastName}
            disabled={submitting}
            onChange={(event) => setLastName(event.target.value)}
            className={FIELD}
          />
        </fieldset>
      )}

      <ul>
        {rows.map((row, index) => (
          <PlayerRow
            key={row.key}
            row={row}
            index={index}
            total={rows.length}
            teams={sortedTeams}
            disabled={submitting}
            askingOwnName={needsName}
            onChange={(patch) => updateRow(row.key, patch)}
            onRemove={() => removeRow(row.key)}
          />
        ))}
      </ul>

      {/* ⚠️ NOT `type="submit"`. A bare <button> inside a form defaults to
          submit, so without this an "Add another child" tap would register the
          list instead of extending it. */}
      <Button
        type="button"
        variant="secondary"
        full
        disabled={submitting || atCap}
        onClick={() => setRows((current) => [...current, blankRow()])}
        className="mt-4"
      >
        Add another child
      </Button>

      {atCap && (
        <p className="mt-2 text-center text-[12.5px] leading-relaxed text-ink-faint">
          That&apos;s {MAX_ROWS} — the most you can add at once. Add these, and you can
          add more once the club has approved them.
        </p>
      )}

      <Button type="submit" full disabled={submitting} className="mt-3">
        {submitting
          ? 'Adding…'
          : rows.length === 1
            ? submitLabel
            : `Add these ${rows.length} players`}
      </Button>

      {/* ⚠️ THE ESCAPE HATCH, AND IT ONLY EXISTS AFTER A PARTIAL FAILURE. Two
          children saved and the third refused for a reason the parent cannot
          fix from here — a squad that has stopped accepting registrations, say
          — would otherwise strand them on this form with real access waiting on
          the other side of it. This takes them through with what worked. */}
      {saved.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          full
          disabled={submitting}
          onClick={() => onDone?.()}
          className="mt-2"
        >
          Continue without them
        </Button>
      )}
    </form>
  )
}
