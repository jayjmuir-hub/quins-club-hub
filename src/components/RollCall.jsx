import { useEffect, useState, useRef } from 'react'
import Button from './Button.jsx'
import AddYourPlayer from './AddYourPlayer.jsx'
import RequestAccess from './RequestAccess.jsx'
import { createAccessRequest, getMyAccessRequest } from '../data/accessRequests.js'
import { getMyProfile, requestStaffRole, updateProfileNames } from '../data/members.js'
import { primeMyProfileCache } from '../lib/useMyProfile.js'

// What a signed-in account with NO membership sees: who are you, and what
// brings you to the Quins? Item 5 of
// claude/plans/2026-08-16-account-creation-redesign.md.
//
// ══ WHAT IT REPLACES, AND WHY THAT WAS THE BUG ═══════════════════════════
//
// AppShell used to render AddYourPlayer with a secondary button — "I'm not
// adding a player" — that swapped in RequestAccess. They were MUTUALLY
// EXCLUSIVE, and the branch a person picked in their first ten seconds decided
// what the club knew about them from then on:
//
//   Add your player          -> a parent membership. Nothing, anywhere, ever
//                               asked whether they also coach.
//   I'm not adding a player  -> a staff request. Nothing asked whether they
//                               have children here (until 16 Aug).
//
// Jay: "i have coaches signing up without adding their kids, its chaotic right
// now". This is that fix: every answer that is true, asked once, and all of
// them can be true at the same time.
//
// ⚠️ NOTHING IS PRE-SELECTED, AND THAT IS DELIBERATE RATHER THAN TIDY.
// Defaulting to "Parent" would be right most of the time, which is exactly the
// problem — every coach who does not read the screen files as a parent, which is
// the same "no idea who they are" bug wearing a more confident face. A box left
// empty here is a RECORDED CLAIM, not an absence.
//
// ══ ⚠️ THE THREE THINGS THAT MAKE THIS WORK, AND ALL THREE ARE INVISIBLE ══
//
// 1. THE RELOAD GOES LAST, EXACTLY ONCE. AppShell renders this while
//    `memberships.length === 0`, and that array only changes when something
//    calls the provider's `reload()`. register_my_player and request_staff_role
//    both create rows WITHOUT telling the provider — which is what lets this
//    screen write several answers and stay put. Wire `reload` to a section's
//    own onDone (as AddYourPlayer's caller did until today) and the screen
//    unmounts the instant the first answer lands, taking every remaining
//    question with it. Silently, with no error and nothing on screen to notice.
//
// 2. THE NAME IS ASKED BEFORE ANY WRITE. request_staff_role creates a pending
//    membership that a coach sees in an approval queue rendered from
//    profiles.full_name — so somebody who never gave a name arrives there as
//    "Unnamed member", which is a request nobody can act on. Asking here also
//    makes PlayerRegistrationForm's own "About you" fieldset correctly
//    disappear: it is gated on `name_confirmed_at`, and this stamps it.
//
// 3. RequestAccess KEEPS OWNING EVERYTHING ABOUT AN ACCESS REQUEST — the form,
//    "Request sent", and "Access not approved". This must never grow its own
//    copies of those three states. Somebody who asked yesterday and signs in
//    today has to meet them rather than the ticks again, which is what the
//    mount check below is for.

const ANSWERS = [
  {
    key: 'child',
    label: 'I have a child playing here',
    hint: 'You’ll add them on the next screen.',
  },
  {
    key: 'self',
    label: 'I play here myself',
    hint: 'Senior and older youth squads only.',
  },
  {
    // ⚠️ MEDIC BELONGS HERE, WITH COACH AND MANAGER, NOT UNDER "another way".
    // It is squad-scoped staff, it is in REQUESTABLE_ROLES, it is in
    // private.can_edit_team, and request_staff_role accepts it. The first draft
    // of the plan filed it under "another way" and was wrong.
    key: 'staff',
    label: 'I coach, manage or medic a squad',
    hint: 'A coach or admin approves this before you see the squad.',
  },
  {
    key: 'helper',
    label: 'I help the club another way',
    hint: 'Committee, volunteer, anything else.',
  },
]

// The order the sections are worked through. Staff first because it is two
// dropdowns and the players form is long — asking "and which squad do you
// coach?" after somebody has just registered three children reads as the app
// moving the goalposts. Helper is last because it is TERMINAL: RequestAccess
// ends on its own confirmation and there is nothing to come back to.
const SECTION_ORDER = ['staff', 'players', 'helper']

const NO_SQUAD_CHOSEN =
  'Choose at least one squad — it is how the club knows who to send your request to.'

const STAFF_ROLES = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team manager' },
  { value: 'medic', label: 'Medic or physio' },
]

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition focus:border-brand'

function Shell({ title, children }) {
  return (
    <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 shadow-card">
      <h2 className="text-center text-lg font-extrabold text-ink">{title}</h2>
      {children}
    </div>
  )
}

export const NOTHING_TICKED =
  'Tick at least one, so the club knows who you are. If none of them fit, tick “I help the club another way”.'

/** sort_order then name — the ordering every age-group list in the app uses. */
function sortTeams(teams) {
  return [...(teams ?? [])].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return String(a.name).localeCompare(String(b.name))
  })
}

/**
 * `teams` and `onDone` come from AppShell: the provider's team list, and its
 * `reload`. `children` is the sign-out control — someone who cannot get in must
 * always be able to get out, so every branch below renders it.
 */
export default function RollCall({ teams = [], userId, email, onDone, children }) {
  // 'checking' | 'ask' | 'staff' | 'players' | 'helper'
  const [step, setStep] = useState('checking')
  const [answers, setAnswers] = useState({})
  const [needsName, setNeedsName] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // ⚠️ THE SQUADS ARE ASKED ON THE FIRST SCREEN AS OF 20 Aug 2026, and the
  // reason is a measurement, not a preference. The name used to be saved on
  // screen one and what the person actually WANTED on screen two, so anybody
  // who stopped in between left a named profile and nothing else: three people
  // were waiting in that exact state, two of them named. Asking here means the
  // one mandatory submit already carries an answer an admin can act on.
  const [squadIds, setSquadIds] = useState([])
  const [staffRole, setStaffRole] = useState('')
  const [staffTeamId, setStaffTeamId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Guards the one write against a re-submit — the sections can send somebody
  // back here, and the UNIQUE key would refuse a second insert anyway.
  const alreadyAsked = useRef(false)

  // ⚠️ TWO READS, AND NEITHER MAY STOP THE SCREEN RENDERING. Somebody locked
  // out of the club must never meet a page that will not load.
  //
  // The access request decides whether to skip straight to RequestAccess: a
  // volunteer who asked yesterday and signs in today has to meet "Request sent",
  // not the ticks again — re-filing would hit the UNIQUE key on profile_id and
  // surface as a database error to somebody who did nothing wrong.
  //
  // The profile decides whether to ask for a name. A failure there means we ask
  // for one we may already have, which is mildly annoying and always safe; the
  // opposite default would put "Unnamed member" in a coach's approval queue.
  useEffect(() => {
    if (!userId) {
      setStep('ask')
      return undefined
    }

    let active = true
    Promise.allSettled([getMyAccessRequest(userId), getMyProfile(userId)]).then(
      ([requestResult, profileResult]) => {
        if (!active) return

        if (profileResult.status === 'fulfilled' && profileResult.value) {
          const profile = profileResult.value
          setNeedsName(!profile.name_confirmed_at)
          setFirstName(String(profile.first_name ?? ''))
          setLastName(String(profile.last_name ?? ''))
        } else {
          setNeedsName(true)
        }

        const asked = requestResult.status === 'fulfilled' && requestResult.value
        // ⚠️ A REQUEST IS NO LONGER PROOF THERE IS NOTHING LEFT TO DO, and
        // reading it that way turned this screen into a DEAD END the same day
        // the first screen started writing one. Until 20 Aug only the "I help
        // another way" tick created a request, so `asked` really did mean
        // "waiting on an admin, nothing more to ask". Now every first submit
        // writes one — so a parent who chose their squads and closed the tab
        // came back to RequestAccess, which is TERMINAL, and could never add
        // their child.
        //
        // ⚠️ 'volunteer' IS THE ONLY JOURNEY THAT ENDS HERE, and the reason is
        // structural rather than a preference. Registering a child and claiming
        // a squad BOTH write a membership row, and this whole screen is gated on
        // `memberships.length === 0` — so anybody still looking at it has
        // finished no section at all. A volunteer is the one case with nothing
        // further to do: their request IS the whole ask.
        const askedAsVolunteer = Boolean(asked) && asked.requested_role === 'volunteer'
        setStep(askedAsVolunteer ? 'helper' : 'ask')
      },
    )

    return () => {
      active = false
    }
  }, [userId])

  /**
   * Moves to the next section that was ticked, or finishes.
   *
   * ⚠️ `onDone` — the provider reload — IS CALLED HERE AND NOWHERE ELSE. See
   * the header. `helper` never reaches this: RequestAccess is terminal.
   */
  function advance(after) {
    const remaining = SECTION_ORDER.slice(SECTION_ORDER.indexOf(after) + 1)
    const next = remaining.find((section) =>
      section === 'players' ? answers.child || answers.self : answers[section],
    )
    if (next) {
      setError(null)
      setStep(next)
      return
    }
    onDone?.()
  }

  function toggle(key) {
    setAnswers((current) => ({ ...current, [key]: !current[key] }))
    if (error) setError(null)
  }

  function handleAsk(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    const ticked = ANSWERS.some((answer) => answers[answer.key])
    if (!ticked) {
      setError(new Error(NOTHING_TICKED))
      return
    }

    const first = firstName.trim()
    const last = lastName.trim()
    if (needsName && !first) {
      setError(new Error('Enter your first name, so the club knows who is asking.'))
      return
    }
    // ⚠️ BOTH NAMES, WHICH IS *NOT* THE RULE NamePrompt APPLIES, AND THE
    // DIFFERENCE IS DELIBERATE. NamePrompt confirms the name of somebody the
    // club already holds a membership for, and leaves the family name optional
    // because plenty of people have one name and a gate nobody can pass is worse
    // than a sortable list. This is a STRANGER asking to reach a children's
    // squad, and a coach has to recognise them from the row in the queue:
    // "Sarah" does not do that. PlayerRegistrationForm's firstProblem() made
    // exactly this call for exactly this person, and moving the question up here
    // must not quietly relax it.
    if (needsName && !last) {
      setError(
        new Error(
          'Enter your family name too — a first name alone is not enough for a coach to know who you are.',
        ),
      )
      return
    }

    // ⚠️ AT LEAST ONE SQUAD, ALWAYS. This is the whole point of moving the
    // question here: without it the submit records that somebody exists and
    // nothing about what they need, which is the state this change exists to
    // end.
    // ⚠️ REQUIRED ONLY WHEN THERE IS SOMETHING TO CHOOSE. AddYourPlayer
    // already has a branch for "we could not load the club's age groups" and
    // offers a way onward; demanding a squad when the list came back EMPTY
    // would strand that person on the first screen with no control that could
    // ever satisfy it — the dead-affordance defect this codebase has shipped
    // once already. Caught by tests/parent-self-registration.test.jsx, which
    // renders exactly that case.
    if (teams.length > 0 && squadIds.length === 0) {
      setError(new Error(NO_SQUAD_CHOSEN))
      return
    }
    // ⚠️ AND THE STAFF ROLE, WHEN THEY CLAIM ONE. access_requests.requested_role
    // is CHECKed against a fixed list and the INSERT policy requires it, so
    // "staff" alone cannot be written — coach, manager and medic are three
    // different answers and guessing one would put a wrong claim in front of
    // whoever approves it.
    if (answers.staff && !staffRole) {
      setError(new Error('Choose whether you coach, manage or medic.'))
      return
    }

    setSaving(true)
    setError(null)

    // ⚠️ THE NAME AND THE REQUEST GO TOGETHER OR NOT AT ALL — that is the fix.
    // `recordAsk` runs after the name save (which stamps name_confirmed_at, the
    // thing request_staff_role is gated on) and before the sections, so the
    // club learns what this person wants even if they close the tab on the very
    // next screen.
    const finish = () => {
      recordAsk()
        .then(() => startSections())
        .catch((err) => setError(err))
        .finally(() => setSaving(false))
    }

    // Nothing to save: they already told us their name, so go straight on.
    if (!needsName) {
      finish()
      return
    }

    updateProfileNames({ profileId: userId, firstName: first, lastName: last })
      .then((updated) => {
        // ⚠️ THE CACHE IS MODULE-LEVEL AND NEVER INVALIDATES ITSELF, so without
        // this PlayerRegistrationForm would read the row as it was BEFORE this
        // save and ask for the name a second time on the very next screen.
        // NamePrompt primes it after its own save for exactly this reason.
        primeMyProfileCache(userId, updated)
        setNeedsName(false)
        finish()
      })
      .catch((err) => {
        setError(err)
        setSaving(false)
      })
  }

  /**
   * Writes the "this is what I am asking for" row, once.
   *
   * ⚠️ A DUPLICATE IS NOT AN ERROR. access_requests carries UNIQUE
   * (profile_id), and somebody who asked yesterday and signs in again today
   * reaches this path a second time. Postgres answers 23505; there is nothing
   * to fix and nothing to tell them, so it resolves. Any OTHER failure is
   * surfaced — a silent catch here would recreate the exact hole this change
   * closes.
   */
  function recordAsk() {
    if (alreadyAsked.current) return Promise.resolve(null)
    const role = claimedRole()
    if (!role) return Promise.resolve(null)
    return createAccessRequest({
      profileId: userId,
      role,
      teamIds: squadIds,
    })
      .then((row) => {
        alreadyAsked.current = true
        return row
      })
      .catch((err) => {
        if (err?.code === '23505') {
          alreadyAsked.current = true
          return null
        }
        throw err
      })
  }

  /**
   * Which single role to record, from ticks that allow several.
   *
   * ⚠️ THE ORDER IS THE CLUB'S PRIORITY, NOT A TIE-BREAK. A person who both
   * has a child here and coaches is, to whoever approves them, a coach first:
   * the staff claim is the one that needs a decision, and the parent claim
   * resolves itself when they register the child. `requested_role` holds one
   * value by CHECK constraint, so something has to choose, and this is the
   * choice — written down rather than left to whichever tick came first.
   */
  function claimedRole() {
    if (answers.staff) return staffRole || null
    if (answers.child) return 'parent'
    if (answers.self) return 'player'
    if (answers.helper) return 'volunteer'
    return null
  }

  function startSections() {
    const first = SECTION_ORDER.find((section) =>
      section === 'players' ? answers.child || answers.self : answers[section],
    )
    setError(null)
    setStep(first ?? 'ask')
  }

  function handleStaff(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    if (!staffRole) {
      setError(new Error('Choose whether you coach, manage or medic.'))
      return
    }
    if (!staffTeamId) {
      setError(new Error('Choose which squad.'))
      return
    }

    setSaving(true)
    setError(null)
    requestStaffRole(staffTeamId, staffRole)
      .then(() => advance('staff'))
      .catch((err) => setError(err))
      .finally(() => setSaving(false))
  }

  if (step === 'checking') {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink-faint">Loading…</p>
      </div>
    )
  }

  if (step === 'players') {
    return (
      <AddYourPlayer
        teams={teams}
        selfRegistering={Boolean(answers.self)}
        // ⚠️ NOT `onDone`/reload — see rule 1 in the header. This means "that
        // section is finished", and the staff or helper question may still be
        // waiting behind it.
        onRegistered={() => advance('players')}
      >
        {children}
      </AddYourPlayer>
    )
  }

  if (step === 'helper') {
    // RequestAccess owns the form AND both terminal states. It re-reads the
    // request row itself, which duplicates the mount check above — one indexed
    // lookup on a UNIQUE column, on a screen nobody sees twice, and the price of
    // not having a second implementation of "Access not approved".
    return (
      <RequestAccess userId={userId} email={email}>
        {children}
      </RequestAccess>
    )
  }

  if (step === 'staff') {
    const sortedTeams = sortTeams(teams)

    return (
      <Shell title="Which squad do you look after?">
        <form className="mt-4" onSubmit={handleStaff} noValidate>
          {/* ⚠️ SAID BEFORE THEY ASK, NOT AFTER. Somebody who claims a squad and
              then finds its roster empty will assume the app is broken.
              request_staff_role writes a PENDING membership: it attaches them to
              the squad's fixtures and to nothing else, because
              private.can_see_team requires status = 'active'. */}
          <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
            A coach, manager or admin for that squad approves this. Until they do you&apos;ll see
            the squad&apos;s fixtures and nothing else — not the players, not any family&apos;s
            details.
          </p>

          {error && (
            <p
              role="alert"
              className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
            >
              {error.message || "We couldn't send that. Try again."}
            </p>
          )}

          <div className="mb-3.5">
            <label className={LABEL} htmlFor="roll-call-staff-role">
              What do you do
            </label>
            <select
              id="roll-call-staff-role"
              className={INPUT}
              value={staffRole}
              disabled={saving}
              onChange={(event) => {
                setStaffRole(event.target.value)
                if (error) setError(null)
              }}
            >
              {/* No preselected role, for the reason the whole screen states. */}
              <option value="">Choose one…</option>
              {STAFF_ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <label className={LABEL} htmlFor="roll-call-staff-team">
              Which squad
            </label>
            <select
              id="roll-call-staff-team"
              className={INPUT}
              value={staffTeamId}
              disabled={saving || sortedTeams.length === 0}
              onChange={(event) => {
                setStaffTeamId(event.target.value)
                if (error) setError(null)
              }}
            >
              <option value="">
                {sortedTeams.length === 0 ? 'Loading squads…' : 'Choose one…'}
              </option>
              {sortedTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              More than one? Ask for this one now — a coach can add the rest once you&apos;re in.
            </p>
          </div>

          <Button type="submit" size="lg" full disabled={saving}>
            {saving ? 'Sending…' : 'Ask to be approved'}
          </Button>

          {/* ⚠️ A WAY PAST IT, AND IT IS NOT OPTIONAL POLISH. Somebody who ticked
              this by mistake, or whose squad is not on the list, would otherwise
              be stranded here with their other answers — the children they came
              to register — permanently out of reach behind it. It writes
              nothing, so the mirror gate (NamePrompt) asks again next sign-in. */}
          <Button
            variant="secondary"
            size="lg"
            full
            className="mt-2.5"
            disabled={saving}
            onClick={() => advance('staff')}
          >
            Skip this for now
          </Button>
        </form>

        {children}
      </Shell>
    )
  }

  return (
    <Shell title="Welcome to the Quins">
      <form className="mt-2" onSubmit={handleAsk} noValidate>
        <p className="mb-4 text-center text-sm leading-relaxed text-ink-faint">
          Tell us how you fit in and we&apos;ll set you up. Tick everything that&apos;s true —
          plenty of people are more than one.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        {needsName && (
          <>
            <div className="mb-3.5">
              <label className={LABEL} htmlFor="roll-call-first-name">
                Your first name
              </label>
              <input
                id="roll-call-first-name"
                type="text"
                autoComplete="given-name"
                className={INPUT}
                value={firstName}
                disabled={saving}
                onChange={(event) => {
                  setFirstName(event.target.value)
                  if (error) setError(null)
                }}
              />
            </div>

            {/* ⚠️ NOT LABELLED OPTIONAL, UNLIKE THE SAME FIELD IN NamePrompt AND
                RequestAccess. It is required here — see the guard in handleAsk
                — and a label saying otherwise is worse than a plain refusal,
                because it invites somebody to skip a field and then tells them
                off for it. */}
            <div className="mb-4">
              <label className={LABEL} htmlFor="roll-call-last-name">
                Your family name
              </label>
              <input
                id="roll-call-last-name"
                type="text"
                autoComplete="family-name"
                className={INPUT}
                value={lastName}
                disabled={saving}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </>
        )}

        {/* Checkboxes, not radios, and not a select. The whole point is that
            several of these are true at once — a control that can only hold one
            answer is the fork this screen replaces, wearing different chrome. */}
        <fieldset className="mb-4 border-0 p-0">
          <legend className={`${LABEL} p-0`}>What brings you to the club?</legend>

          {ANSWERS.map((answer) => (
            <label
              key={answer.key}
              className="mb-2.5 flex cursor-pointer items-start gap-3 rounded-[11px] border border-line bg-surface-mute p-3 transition hover:border-brand"
            >
              <input
                type="checkbox"
                checked={Boolean(answers[answer.key])}
                disabled={saving}
                onChange={() => toggle(answer.key)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]"
              />
              <span>
                <span className="block text-sm font-bold text-ink">{answer.label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">
                  {answer.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* ⚠️ STAFF ROLE ASKED HERE, NOT ONLY ON THE LATER STAFF SCREEN.
            requested_role is required by the INSERT policy and CHECKed against a
            fixed list, so a request cannot be written from the "I coach, manage
            or medic" tick alone. The staff screen still asks — it needs the one
            squad it attaches the pending membership to — and arrives pre-filled
            from here. */}
        {answers.staff && (
          <div className="mb-4">
            <label className={LABEL} htmlFor="roll-call-claimed-role">
              What do you do
            </label>
            <select
              id="roll-call-claimed-role"
              className={INPUT}
              value={staffRole}
              disabled={saving}
              onChange={(event) => {
                setStaffRole(event.target.value)
                if (error) setError(null)
              }}
            >
              <option value="">Choose…</option>
              {STAFF_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ⚠️ MULTI-SELECT, ON JAY'S INSTRUCTION, 20 Aug 2026. "some parents
            have 3, 4 or even 5 children at the club, across different age
            groups" is already on the record against the minis work, and one
            squad per request cannot express it. The first squad ticked is what
            satisfies the INSERT policy; the array carries the rest. */}
        {teams.length > 0 && (
        <fieldset className="mb-4 border-0 p-0">
          <legend className={`${LABEL} p-0`}>
            Which squad? Tick every one that applies
          </legend>
          <div className="max-h-60 overflow-y-auto rounded-[11px] border border-line p-1.5">
            {sortTeams(teams).map((team) => (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2 py-2 transition hover:bg-surface-mute"
              >
                <input
                  type="checkbox"
                  checked={squadIds.includes(team.id)}
                  disabled={saving}
                  onChange={() => {
                    setSquadIds((current) =>
                      current.includes(team.id)
                        ? current.filter((id) => id !== team.id)
                        : [...current, team.id],
                    )
                    if (error) setError(null)
                  }}
                  className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
                />
                <span className="text-sm font-semibold text-ink">{team.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            Not sure which? Pick the closest — an admin can change it.
          </p>
        </fieldset>
        )}

        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </Button>
      </form>

      {children}
    </Shell>
  )
}
