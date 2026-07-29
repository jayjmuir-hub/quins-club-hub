import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { getPlayerContact, upsertContact, upsertPlayer } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { POSITIONS } from '../lib/positions.js'

// The player add/edit form (design-system.md §5.8), opened in the shared
// Sheet from Roster's "Add player" button and from PlayerDetail's "Edit".
// Field order is the design system's: full name → position → age group →
// phone → email → player/captain → Save. There is deliberately NO jersey
// field: the club does not use squad numbers (see src/lib/playerFormat.js and
// the §5.8 supersession note).
//
// Access control is NOT enforced here. Two RLS policies are the real
// boundary, and they are separate on purpose:
//   players.“player edit”          ALL, USING + WITH CHECK can_edit_team(team_id)
//   player_contacts.“contact edit” ALL, USING + WITH CHECK can_edit_team(via player_id)
// Everything this screen does with canEditTeam only narrows what it offers,
// so a mistake here can hide a squad the user may edit but can never let a
// write through that the database would refuse.
//
// SAFEGUARDING — the reason this file is not just EventForm with different
// labels:
//
// 1. Contact details live in their own table behind their own policy, and
//    this form writes them with their own statement (upsertPlayer, THEN
//    upsertContact). One combined write would make a refused contact write
//    indistinguishable from a refused player write, and the natural failure
//    mode of that conflation is a contact refusal reported as "saved". They
//    are two calls so a partial failure is reported as a partial failure.
// 2. The form's EXISTENCE is gated, not just its buttons: a user with no
//    editable squad, OR one who can't edit this particular player's squad,
//    gets an explanation and no fields at all — in particular no phone/email
//    boxes, which for a player whose contact row RLS withholds would be
//    exactly the leak player_contacts exists to prevent. The same guard stops
//    the contact read from being issued at all.
// 3. A null contact row here can only mean "nothing recorded yet", never
//    "withheld": this form renders only for someone who passes
//    can_edit_team FOR THIS PLAYER'S TEAM — enforced by the `gated` check
//    below, in this file, not by whoever opened it — and player_contacts'
//    read policy is `can_edit_team(...) OR is_own_player(...)`, so edit
//    access strictly implies read access. That local enforcement is what
//    makes this paragraph true; without it a coach handed a player from
//    another age group would see a null row RLS had withheld and read it as
//    "nothing on file". So blank, editable fields are honest, and there is
//    nothing to hint at. (PlayerDetail's rule — never suggest withheld data
//    exists — is about a screen parents can reach; this one they cannot.)
// 4. A contact read that FAILED is different again, and is the one case that
//    could destroy data: blank fields written back would wipe details the
//    coach never saw. So a failed read hides the contact fields entirely,
//    says so, and skips the contact write — the player's own fields still
//    save.

// design-system.md §4.17, and the same #5c5854 the other screens use for
// --muted on a light fill: #77726e fails AA at this size.
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const FIELD = 'mb-3.5'
const INPUT_BASE =
  'w-full rounded-[11px] border-[1.5px] bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

// design-system.md §4.18, matching EventForm: the radio stays a real,
// focusable input (sr-only, not display:none) and the checked look is driven
// from React state rather than the CSS `:has()` selector.
const SEG_OPTION_BASE =
  'block cursor-pointer select-none rounded-[11px] border-[1.5px] px-2 py-2.5 text-center text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2'
const SEG_OPTION_ON = 'border-brand bg-surface-mute font-bold text-brand-deep'
const SEG_OPTION_OFF = 'border-line font-semibold text-ink'

// POSITIONS moved to src/lib/positions.js when the bulk importer arrived and
// needed to validate pasted positions against exactly the same set this form
// offers. The original reasoning still holds and is restated there: this is
// the list of choices, NOT Roster.jsx's FORWARDS/BACKS grouping rule, which
// buckets positions that may not be on this list.

function inputClasses(invalid) {
  return [INPUT_BASE, invalid ? 'border-brand-deep' : 'border-line'].join(' ')
}

function Segmented({ legend, name, options, value, onChange }) {
  return (
    <fieldset className={FIELD}>
      <legend className={LABEL}>{legend}</legend>
      {/* An explicit flex row of equal-width blocks. The options are
          <label>/<span> pairs rather than <button>s on purpose — a button
          used as a layout box inherits Chromium's UA content-centring,
          which jsdom cannot see. */}
      <div className="flex gap-2">
        {options.map((option) => (
          <label key={option.value} className="flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={[
                SEG_OPTION_BASE,
                value === option.value ? SEG_OPTION_ON : SEG_OPTION_OFF,
              ].join(' ')}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// The player half of the form's initial state, derived once per mount. The
// contact half is not here: it arrives asynchronously from a second table
// (see the contact effect below), and for a new player there is nothing to
// fetch.
function initialValues(player, editableTeams) {
  const fallbackTeamId = editableTeams[0]?.id ?? ''

  return {
    fullName: player?.full_name ?? '',
    position: player?.position ?? '',
    // An existing player's own squad wins, even if the editable list hasn't
    // loaded yet — see the reconciliation note in the component for why
    // falling through to "the first team" is not acceptable here.
    teamId: player ? player.team_id : fallbackTeamId,
    isCaptain: player?.is_captain === true,
    phone: '',
    email: '',
  }
}

export default function PlayerForm({ player = null, onClose, onSaved }) {
  const { memberships, teams } = useMemberships()

  // Teams this user may actually write to. For an admin that is every team;
  // for a coach only the squads they coach. canEditTeam is asked per team
  // rather than inferred from the role, so its deliberate null-team_id
  // refusal applies here too — a team with no resolvable id never becomes a
  // dropdown option.
  const editableTeams = useMemo(
    () => visibleTeams(memberships, teams).filter((team) => canEditTeam(memberships, team.id)),
    [memberships, teams],
  )

  const editing = Boolean(player?.id)

  // Two gates, and the second one is the one this file's safeguarding claims
  // actually rest on.
  //
  //   noEditableTeams — "you can't edit ANY squad". Blocks the add form.
  //   notThisPlayer   — "you can't edit THIS player's squad". Blocks the edit
  //                     form for a player outside your teams.
  //
  // The second used to live only in Roster.jsx (which computes the same check
  // to decide whether to offer an Edit button at all), which meant the
  // invariant this component's header depends on — "a null contact row here
  // can only mean nothing recorded yet, never withheld" — was enforced in a
  // different file from the one asserting it. That is only true if the caller
  // never opens this form for a player it may not edit. Enforced here instead,
  // so the component is self-enforcing whoever opens it: a U12 coach handed a
  // U14 player gets the refusal, not blank contact fields over a null row that
  // RLS actually withheld.
  const noEditableTeams = editableTeams.length === 0
  const notThisPlayer = Boolean(player) && !canEditTeam(memberships, player.team_id)
  const gated = noEditableTeams || notThisPlayer

  const [values, setValues] = useState(() => initialValues(player, editableTeams))
  const [invalid, setInvalid] = useState({})
  const [error, setError] = useState(null)
  // Which of the two writes failed. The distinction is the point: a contact
  // failure means the player IS saved, and saying otherwise would send a
  // coach back to re-enter a player who already exists.
  const [errorStage, setErrorStage] = useState(null)
  const [saving, setSaving] = useState(false)

  // 'ready' the moment there is nothing to fetch (a new player), otherwise
  // 'loading' until the existing contact row lands, then 'ready' or 'error'.
  const [contactStatus, setContactStatus] = useState(editing ? 'loading' : 'ready')
  const [contactError, setContactError] = useState(null)
  // Whether a contact row existed when the form opened. This is what makes
  // "clear the phone number" different from "there was never a phone number":
  // the first has to be written through as nulls, the second is nothing at
  // all and must not leave an empty row behind.
  const [hadContact, setHadContact] = useState(false)

  // The id of the player row this form has already written, if any. Set from
  // the insert's returned row so a retry after a CONTACT failure updates that
  // player rather than inserting a second copy of them.
  const [savedPlayerId, setSavedPlayerId] = useState(player?.id ?? null)

  // Guards against a double submit landing two inserts: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  // The contact prefill. Runs only when editing, and only when the form is
  // not gated — a user who may not edit this squad must not cause a
  // player_contacts read at all, let alone see its result.
  useEffect(() => {
    if (!editing || gated) return undefined

    let mounted = true
    setContactStatus('loading')
    setContactError(null)

    getPlayerContact(player.id)
      .then((row) => {
        if (!mounted) return
        setHadContact(Boolean(row))
        setValues((current) => ({
          ...current,
          phone: row?.phone ?? '',
          email: row?.email ?? '',
        }))
        setContactStatus('ready')
      })
      .catch((err) => {
        if (!mounted) return
        setContactError(err)
        setContactStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [editing, gated, player?.id])

  const set = (key) => (nextValue) => {
    setValues((current) => ({ ...current, [key]: nextValue }))
    // Editing a field drops its invalid highlight immediately, rather than
    // leaving it lit until the next submit re-derives everything.
    setInvalid((current) => (current[key] ? { ...current, [key]: false } : current))
    // ...and any input clears the "fill in the highlighted fields" banner. It
    // is cleared on ANY change rather than only when every field is valid,
    // because the banner's job is to point at the highlights and the
    // highlights are already per-field — a banner that outlives the state it
    // describes is just noise. Only validation errors are cleared this way: a
    // failed WRITE must survive typing, since nothing the user types makes a
    // refused save true again.
    if (errorStage === 'validation') {
      setError(null)
      setErrorStage(null)
    }
  }
  const setFromInput = (key) => (domEvent) => set(key)(domEvent.target.value)

  // Reconcile the chosen squad against the live editable list on every render
  // rather than trusting the stored value — memberships can reload and
  // shrink, and on a first render where teams hadn't loaded the initial value
  // is ''. Either way the select would otherwise show a squad it wasn't
  // actually holding in state.
  //
  // The fallback when editing is the player's OWN squad, never "the first team
  // in the list". Falling through to editableTeams[0] would show, and then on
  // save actually write, a different age group than the one the player is in —
  // moving a child between age groups behind the coach's back. The stakes are
  // what make this different from the same reconciliation on a fixture.
  const teamId = editableTeams.some((team) => team.id === values.teamId)
    ? values.teamId
    : editing
      ? player.team_id
      : editableTeams[0]?.id ?? ''

  // A user who can't write here should not be shown a form whose Save button
  // the database is guaranteed to refuse — and, for this form specifically,
  // should not be shown contact fields at all. Both entry points already gate
  // on the same checks, so this is defensive: it explains rather than
  // apologises. The two reasons get their own wording, because "you coach no
  // squads" and "you don't coach this one" are different problems with
  // different fixes.
  if (gated) {
    return (
      <Sheet open onClose={onClose} title={editing ? 'Edit player' : 'Add player'}>
        <p role="alert" className="rounded-[11px] bg-warn-bg px-4 py-3 text-sm text-ink">
          {noEditableTeams
            ? "You don't have a squad you can add or change players for. Ask a club admin if that looks wrong."
            : "You can't change players in this age group. Ask a club admin if that looks wrong."}
        </p>
      </Sheet>
    )
  }

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (inFlight.current) return

    const fullName = values.fullName.trim()
    const nextInvalid = { fullName: !fullName, teamId: !teamId }
    setInvalid(nextInvalid)

    if (Object.values(nextInvalid).some(Boolean)) {
      setErrorStage('validation')
      setError(new Error('Fill in the highlighted fields before saving.'))
      return
    }

    const team = editableTeams.find((candidate) => candidate.id === teamId)
    const playerPayload = {
      ...(savedPlayerId ? { id: savedPlayerId } : null),
      ...(team?.club_id ? { club_id: team.club_id } : null),
      team_id: teamId,
      full_name: fullName,
      position: values.position || null,
      is_captain: values.isCaptain,
    }

    const phone = values.phone.trim() || null
    const email = values.email.trim() || null
    // Write the contact row when there is something to record, or something
    // to clear. Never when the read failed — those blanks are not the
    // coach's answer, they are the absence of one.
    const writeContact = contactStatus === 'ready' && Boolean(phone || email || hadContact)

    inFlight.current = true
    setSaving(true)
    setError(null)
    setErrorStage(null)

    const run = async () => {
      let saved
      try {
        saved = await upsertPlayer(playerPayload)
      } catch (err) {
        setErrorStage('player')
        setError(err)
        return
      }

      // Recorded before the contact attempt, so a retry after a contact
      // failure updates this player instead of inserting them again.
      if (saved?.id) setSavedPlayerId(saved.id)

      if (!writeContact) {
        onSaved?.(saved)
        onClose?.()
        return
      }

      try {
        await upsertContact({ player_id: saved.id, phone, email })
      } catch (err) {
        // The player really was saved — tell the roster so, and keep the
        // sheet open on the contact problem rather than closing over it.
        onSaved?.(saved)
        setErrorStage('contact')
        setError(err)
        return
      }

      onSaved?.(saved)
      onClose?.()
    }

    run().finally(() => {
      inFlight.current = false
      setSaving(false)
    })
  }

  const contactLoading = contactStatus === 'loading'

  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit player' : 'Add player'}>
      {/* noValidate: this form does its own validation and reports it in a
          role="alert" region, which a screen reader announces — the native
          bubble is neither announced reliably nor visible to the browser
          check. */}
      <form onSubmit={handleSubmit} noValidate>
        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-name">
            Full name
          </label>
          <input
            id="player-name"
            type="text"
            value={values.fullName}
            onChange={setFromInput('fullName')}
            aria-invalid={invalid.fullName ? 'true' : undefined}
            placeholder="e.g. Tom Fletcher"
            className={inputClasses(invalid.fullName)}
          />
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-position">
            Position
          </label>
          {/* Optional: players.position is nullable and most of the club's
              records don't carry one yet, so "Not set" is a real answer
              rather than a placeholder to be got rid of. */}
          <select
            id="player-position"
            value={values.position}
            onChange={setFromInput('position')}
            className={inputClasses(false)}
          >
            <option value="">Not set</option>
            {POSITIONS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-team">
            Age group
          </label>
          <select
            id="player-team"
            value={teamId}
            onChange={setFromInput('teamId')}
            aria-invalid={invalid.teamId ? 'true' : undefined}
            className={inputClasses(invalid.teamId)}
          >
            {editableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        {/* Contact details: a different table, a different policy, a
            different write. See the safeguarding notes at the top. */}
        {contactStatus === 'error' && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-warn-bg px-3 py-2.5 text-sm text-ink"
          >
            We couldn&apos;t load this player&apos;s contact details, so they can&apos;t be edited
            right now. Saving will leave them exactly as they are.
            {contactError?.message ? ` (${contactError.message})` : ''}
          </p>
        )}

        {contactStatus === 'ready' && (
          <>
            <div className={FIELD}>
              <label className={LABEL} htmlFor="player-phone">
                Phone
              </label>
              <input
                id="player-phone"
                type="tel"
                inputMode="tel"
                value={values.phone}
                onChange={setFromInput('phone')}
                placeholder="e.g. +971 50 200 1000"
                aria-describedby="player-contact-note"
                className={inputClasses(false)}
              />
            </div>

            <div className={FIELD}>
              <label className={LABEL} htmlFor="player-email">
                Email
              </label>
              <input
                id="player-email"
                type="email"
                value={values.email}
                onChange={setFromInput('email')}
                placeholder="e.g. guardian@example.com"
                aria-describedby="player-contact-note"
                className={inputClasses(false)}
              />
            </div>

            {/* Says what happens to the data, not what the user must do. For
                a minor these are the guardian's details, and who can read them
                back is the club's safeguarding promise — so this line has to
                match the policy exactly, not approximately. The confirmed
                player_contacts read policy is
                `can_edit_team(...) OR is_own_player(player_id)`: the linked
                player can read their own row too, which an earlier "only
                coaches and club admins" wording quietly misstated. */}
            <p id="player-contact-note" className="-mt-2 mb-3.5 text-[12.5px] text-ink-muted">
              Only coaches, club admins and the player themselves can see these. Leave them blank if
              you don&apos;t have them.
            </p>
          </>
        )}

        <Segmented
          legend="Role"
          name="player-role"
          options={[
            { value: 'player', label: 'Player' },
            { value: 'captain', label: 'Captain' },
          ]}
          value={values.isCaptain ? 'captain' : 'player'}
          onChange={(next) => set('isCaptain')(next === 'captain')}
        />

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {errorStage === 'contact' && (
              <span className="block">
                The player was saved, but their contact details were not.
              </span>
            )}
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        <button
          type="submit"
          // Disabled until the existing contact row has settled: a submit
          // before then would write the still-blank fields over real details.
          disabled={saving || contactLoading}
          className="w-full rounded-[11px] bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add player'}
        </button>
      </form>
    </Sheet>
  )
}
