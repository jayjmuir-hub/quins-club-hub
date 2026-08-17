import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { getPlayerContact, upsertContact, upsertPlayer } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { POSITIONS } from '../lib/positions.js'
import { isMinisTeam } from '../lib/minis.js'
import { listPlayerGrades, listPlayerPositions, savePlayerPositions, setPlayerGrade, TIERS } from '../data/playerTiers.js'
import { listParents, saveParents } from '../data/parents.js'
import { deletePlayerPhoto, forgetPhotoUrl, uploadPlayerPhoto } from '../data/photos.js'
import { allowsOwnContact } from '../lib/ageGroup.js'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { parentNameProblem, toEditorRows, toSaveRows } from '../lib/parentRows.js'
import ParentsEditor from '../components/ParentsEditor.jsx'
import PhotoField from '../components/PhotoField.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import Segmented from '../components/Segmented.jsx'
import {
  GENDERS,
  genderRequiredMessage,
  squadMismatch,
  squadRequiresGender,
} from '../lib/gender.js'

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

// The segmented control moved to src/components/Segmented.jsx on 7 Aug 2026,
// when the gender buttons needed the identical control in MyPlayerForm. Its
// design-system.md §4.18 reasoning — real focusable radio, label/span rather
// than button — moved with it and is stated there.

// POSITIONS moved to src/lib/positions.js when the bulk importer arrived and
// needed to validate pasted positions against exactly the same set this form
// offers. The original reasoning still holds and is restated there: this is
// the list of choices, NOT Roster.jsx's FORWARDS/BACKS grouping rule, which
// buckets positions that may not be on this list.

function inputClasses(invalid) {
  return [INPUT_BASE, invalid ? 'border-brand-deep' : 'border-line'].join(' ')
}

// The player half of the form's initial state, derived once per mount. The
// contact half is not here: it arrives asynchronously from a second table
// (see the contact effect below), and for a new player there is nothing to
// fetch.
function initialValues(player, editableTeams) {
  const fallbackTeamId = editableTeams[0]?.id ?? ''

  return {
    // ⚠️ TWO BOXES SINCE 17 Aug 2026, AND THEY ARE WRITTEN STRAIGHT TO
    // first_name / last_name RATHER THAN JOINED INTO full_name.
    // PlayerRegistrationForm joins, because register_my_player takes one
    // `p_full_name` parameter and widening a public signature was the larger
    // change. This form writes the table directly, so it does not have to —
    // and MUST NOT, because the split is lossy in one direction: the trigger
    // takes the LAST word as the family name, so "Anna van der Berg" joined and
    // re-split comes back as first "Anna van der", last "Berg". Writing both
    // columns takes the trigger's names-win branch and nothing is guessed.
    //
    // ⚠️ NO CLIENT-SIDE SPLIT OF full_name AS A FALLBACK, DELIBERATELY. It is
    // tempting and it would be a second copy of a rule that has already been
    // got backwards once (20260808 sync_profile_name_single_word: a one-word
    // name is a FIRST name, and the opposite is invisible until somebody sorts
    // a roster). The backfill filled every existing row and its migration
    // ABORTS if any row is left with a full_name and no first_name, so an empty
    // box here means an empty column, which is the truth.
    firstName: player?.first_name ?? '',
    lastName: player?.last_name ?? '',
    position: player?.position ?? '',
    unit: player?.unit ?? '',
    // ⚠️ BOTH LOAD ASYNCHRONOUSLY and so start empty rather than from `player`.
    // player_positions and player_grades are separate tables — the roster row
    // this form is opened from carries neither. See the effect below.
    positions: [],
    tier: '',
    // An existing player's own squad wins, even if the editable list hasn't
    // loaded yet — see the reconciliation note in the component for why
    // falling through to "the first team" is not acceptable here.
    teamId: player ? player.team_id : fallbackTeamId,
    isCaptain: player?.is_captain === true,
    // ⚠️ null, not '' and not a default choice. players.gender is nullable
    // and almost every existing player has no value; defaulting the buttons
    // to Male would silently record an answer nobody gave the first time a
    // coach opened any player to fix a phone number.
    gender: player?.gender ?? null,
    // The player's own number is held split (country + national) for the same
    // reason the parent rows are — see src/components/PhoneInput.jsx.
    phoneCountry: splitPhone('').country,
    phoneNational: '',
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

  // Parent rows. Loaded alongside the contact row and behind the same gate:
  // player_parents has the same read policy as player_contacts, so a user who
  // may not edit this squad must not cause the query at all.
  const [parents, setParents] = useState([])
  const [parentsStatus, setParentsStatus] = useState(editing ? 'loading' : 'ready')

  // The photo is three pieces of state, not one: the file just chosen (not
  // yet uploaded), whether the existing one is being removed, and the path
  // already stored on the player row. Keeping "chosen" separate from "saved"
  // is what lets the form be abandoned without leaving an orphaned photo of a
  // child in the bucket.
  const [photoFile, setPhotoFile] = useState(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  // ⚠️ SEEDED FROM THE PLAYER, AND A NEW FILE RESETS IT. Keeping a point chosen
  // for a different picture is worse than the centre, because it looks
  // deliberate rather than unset.
  const [photoFocus, setPhotoFocus] = useState(
    player?.photo_focus_x == null && player?.photo_focus_y == null
      ? null
      : { x: player?.photo_focus_x, y: player?.photo_focus_y },
  )

  // Guards against a double submit landing two inserts: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  // The contact prefill. Runs only when editing, and only when the form is
  // not gated — a user who may not edit this squad must not cause a
  // player_contacts read at all, let alone see its result.
  // ⚠️ POSITIONS AND GRADE LOAD SEPARATELY FROM THE PLAYER ROW, because they are
  // separate tables and the roster row this form opens from carries neither.
  //
  // ⚠️ allSettled, NOT all: the GRADE read can legitimately come back empty or
  // refused — `player_grades` is coach-only and most players are ungraded — and
  // that must not stop somebody editing a phone number. A failure here leaves
  // both fields at their defaults rather than taking the form down.
  useEffect(() => {
    if (!editing || gated) return undefined
    let mounted = true

    Promise.allSettled([listPlayerPositions([player.id]), listPlayerGrades([player.id])]).then(
      ([positionsResult, gradesResult]) => {
        if (!mounted) return
        setValues((current) => ({
          ...current,
          positions:
            positionsResult.status === 'fulfilled'
              ? positionsResult.value.get(player.id) ?? []
              : current.positions,
          tier:
            gradesResult.status === 'fulfilled'
              ? gradesResult.value.get(player.id)?.tier ?? ''
              : current.tier,
        }))
      },
    )

    return () => {
      mounted = false
    }
  }, [editing, gated, player?.id])

  useEffect(() => {
    if (!editing || gated) return undefined

    let mounted = true
    setContactStatus('loading')
    setContactError(null)

    getPlayerContact(player.id)
      .then((row) => {
        if (!mounted) return
        setHadContact(Boolean(row))
        // Split the stored E.164 number across the country picker and the
        // number box. splitPhone keeps a legacy free-form number's digits
        // rather than discarding them (see src/lib/phone.js).
        const { country, national } = splitPhone(row?.phone)
        setValues((current) => ({
          ...current,
          phoneCountry: country,
          phoneNational: national,
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

  // Parent rows prefill. Same gate and same shape as the contact effect
  // above. A failure here is NOT treated the way a failed contact read is:
  // saveParents replaces the whole set, so saving after a failed read would
  // delete rows the coach never saw. So a failed read leaves the editor
  // empty AND marks the status 'error', and the submit handler skips the
  // parent write entirely on that status.
  useEffect(() => {
    if (!editing || gated) return undefined

    let mounted = true
    setParentsStatus('loading')

    listParents(player.id)
      .then((rows) => {
        if (!mounted) return
        // Was inline here. Moved to src/lib/parentRows.js on 9 Aug 2026 —
        // MyPlayerForm needed the identical conversion, did not have it, and
        // silently wrote `phone: null` over the club's own record as a result.
        setParents(toEditorRows(rows))
        setParentsStatus('ready')
      })
      .catch(() => {
        if (!mounted) return
        setParents([])
        setParentsStatus('error')
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

    const firstName = values.firstName.trim()
    const lastName = values.lastName.trim()
    const team = editableTeams.find((candidate) => candidate.id === teamId)

    // ⚠️ THE FAMILY NAME IS REQUIRED, EXCEPT ON A ROW THAT ARRIVED WITHOUT ONE.
    //
    // Requiring it outright is what Jay asked for and is right for a NEW
    // player: "Sarah" is not enough for a coach to recognise a child, and one
    // box getting one word is the bug this whole item exists to fix.
    //
    // But this form also edits rows that already exist, and at least one live
    // row has a first name and nothing else. Demanding a family name there
    // would mean a coach fixing a typo in a position is blocked until they
    // invent a surname they may not know — the same trap the "at least one
    // parent is a WARNING, never a block" ruling names in ParentsEditor. So the
    // requirement is grandfathered: it binds unless the stored row was already
    // blank, and nobody can blank one that exists.
    const lastNameWasBlank = editing && !String(player?.last_name ?? '').trim()
    const lastNameMissing = !lastName && !lastNameWasBlank

    // ⚠️ CHECKED HERE, BEFORE ANY WRITE, AND NOT INSIDE ParentsEditor. The
    // editor is presentational and the parent rows are written LAST — a
    // half-named parent caught after the player, the photo and the contact had
    // already been saved would refuse a save that had mostly happened. The rule
    // itself lives in src/lib/parentRows.js because MyPlayerForm needs the
    // identical one.
    const parentProblem = parentsStatus === 'ready' ? parentNameProblem(parents) : null

    // ⚠️ GENDER IS REQUIRED ON A SINGLE-GENDER SQUAD (Jay, 9 Aug 2026).
    // Read from the SELECTED squad, so switching the dropdown to U16G Contact
    // makes the field required immediately rather than at save time.
    //
    // This is the only half of the rule that is enforced. A CONTRADICTORY
    // gender still saves with a warning — see `mismatch` below. Blank does
    // not, because leaving the question unanswered is otherwise the easiest
    // way to defeat the warning, and most players have no gender recorded.
    const genderMissing = squadRequiresGender(team?.name) && !values.gender

    const nextInvalid = {
      firstName: !firstName,
      lastName: lastNameMissing,
      teamId: !teamId,
      gender: genderMissing,
    }
    setInvalid(nextInvalid)

    if (parentProblem && !Object.values(nextInvalid).some(Boolean)) {
      setErrorStage('validation')
      setError(new Error(parentProblem))
      return
    }

    if (Object.values(nextInvalid).some(Boolean)) {
      setErrorStage('validation')
      // Named specifically. "Fill in the highlighted fields" is useless for a
      // radio pair that has no highlight of its own, and the person needs to
      // know it is the SQUAD that made the field mandatory — otherwise it
      // reads as the app arbitrarily demanding something it didn't want a
      // moment ago.
      //
      // The family name gets its own sentence for the same reason: the box is
      // filled in as far as the coach is concerned (they typed a name), so a
      // highlight alone reads as the form breaking rather than as a rule.
      setError(
        new Error(
          genderMissing && firstName && !lastNameMissing && teamId
            ? genderRequiredMessage(team.name)
            : lastNameMissing && firstName && teamId
              ? 'Add a family name too — a first name alone is not enough for a coach to know which child this is.'
              : 'Fill in the highlighted fields before saving.',
        ),
      )
      return
    }

    const playerPayload = {
      ...(savedPlayerId ? { id: savedPlayerId } : null),
      ...(team?.club_id ? { club_id: team.club_id } : null),
      team_id: teamId,
      // ⚠️ ALL THREE, AND full_name IS NOT A SECOND SOURCE OF TRUTH. The
      // trigger's names-win branch recomputes it as concat_ws(' ', first, last)
      // — byte-identical to the join below — and then overwrites whatever was
      // sent. Sending it anyway means a row written while the trigger was
      // somehow absent still carries the display name every reader wants,
      // rather than silently keeping the old one.
      first_name: firstName,
      last_name: lastName || null,
      full_name: [firstName, lastName].filter(Boolean).join(' '),
      // ⚠️ STILL THE PRIMARY, AND KEPT IN STEP WITH THE FIRST SELECTED POSITION.
      // Six things read players.position (the roster meta line and its inline
      // editor, YourPlayers, PlayerDetail, the importer, the forwards/backs
      // fallback) and none of them were rewritten — see the player_positions
      // migration. When the coach has picked positions, the first one wins; the
      // single-select below is kept for the players who only ever have one.
      // Parenthesised because `??` and `||` cannot be mixed bare — and the
      // grouping matters: a ticked position wins, otherwise the single-select
      // falls back to null when it is ''.
      position: values.positions[0] ?? (values.position || null),
      // '' means nobody has decided, which is a real answer and stays NULL.
      unit: values.unit || null,
      is_captain: values.isCaptain,
      // `?? null` rather than `|| null` so the value is written through
      // exactly as held. Both happen to behave the same for the two strings
      // and null this field can hold, but `||` would also convert a future
      // falsy-but-meaningful value, and this is a column with a CHECK
      // constraint that refuses ''.
      gender: values.gender ?? null,
    }

    const phone = joinPhone(values.phoneCountry, values.phoneNational)
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

      // Recorded before the later attempts, so a retry after any of them
      // updates this player instead of inserting them again.
      if (saved?.id) setSavedPlayerId(saved.id)

      // --- photo ------------------------------------------------------
      // Done AFTER the player row exists, because the object key is built
      // from the player id (the storage policies read the squad out of it),
      // and a brand-new player has no id until now.
      //
      // The old object is deleted only once the new path is safely recorded
      // on the player row. Doing it the other way round would, on a failed
      // update, leave a player pointing at a file that no longer exists.
      const previousPath = player?.photo_path ?? null
      if (photoFile || photoRemoved) {
        try {
          const nextPath = photoFile ? await uploadPlayerPhoto(saved.id, photoFile) : null
          // ⚠️ THE FOCAL POINT GOES IN THE SAME WRITE AS THE PATH. Two writes
          // would leave a window where a photo exists with a position chosen
          // for the previous one — and this form already treats the photo as
          // part of the save rather than as its own action.
          saved = await upsertPlayer({
            id: saved.id,
            photo_path: nextPath,
            photo_focus_x: nextPath ? (photoFocus?.x ?? null) : null,
            photo_focus_y: nextPath ? (photoFocus?.y ?? null) : null,
          })
          if (previousPath && previousPath !== nextPath) {
            forgetPhotoUrl(previousPath)
            // Best-effort: an orphaned file in a private bucket is untidy,
            // not harmful, and must not turn a good save into an error.
            deletePlayerPhoto(previousPath)
          }
          setPhotoFile(null)
          setPhotoRemoved(false)
        } catch (err) {
          onSaved?.(saved)
          setErrorStage('photo')
          setError(err)
          return
        }
      }

      if (writeContact) {
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
      }

      // --- parents ----------------------------------------------------
      // Skipped outright when the prefill failed: saveParents replaces the
      // whole set, so writing an empty editor over rows that exist but were
      // never loaded would delete them.
      if (parentsStatus === 'ready') {
        try {
          // toSaveRows joins the two phone fields back into one E.164 string.
          // sort_order is still applied here because it is a property of THIS
          // list's order, which the shared mapper has no business knowing.
          await saveParents(
            saved.id,
            toSaveRows(parents).map((row, index) => ({ ...row, sort_order: index })),
          )
        } catch (err) {
          onSaved?.(saved)
          setErrorStage('parents')
          setError(err)
          return
        }
      }

      // --- positions and grade ----------------------------------------
      // ⚠️ LAST, AND THE ORDER IS THE WHOLE POINT. These were briefly written
      // straight after the player row, which meant a refused position write
      // RETURNED EARLY and the CONTACT DETAILS were never saved — a phone number
      // lost to a secondary table. Ten tests caught it. Every write in this
      // sequence blocks the ones after it, so the order has to run from most
      // important to least: player, photo, contact, parents, then these.
      //
      // ⚠️ AFTER THE PLAYER ROW EXISTS, like the photo: both tables key on the
      // player id, and a brand-new player has none until upsertPlayer returns.
      //
      // ⚠️ NEITHER FAILURE MAY LOSE THE PLAYER, so each reports its own stage.
      if (saved?.id) {
        try {
          await savePlayerPositions(saved.id, values.positions)
        } catch (err) {
          onSaved?.(saved)
          setErrorStage('positions')
          setError(err)
          return
        }
        try {
          await setPlayerGrade(saved.id, values.tier || null)
        } catch (err) {
          onSaved?.(saved)
          setErrorStage('grade')
          setError(err)
          return
        }
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
  const parentsLoading = parentsStatus === 'loading'

  // The U13 rule keys off the SELECTED squad, not the player's stored one, so
  // moving a U12 up to U13 in this form reveals the player-contact fields
  // immediately rather than only after a save-and-reopen. allowsOwnContact
  // fails closed on an unknown squad name.
  const selectedTeam = editableTeams.find((candidate) => candidate.id === teamId)
  const ownContactAllowed = allowsOwnContact(selectedTeam?.name)

  // Advisory only, and computed from the SELECTED squad rather than the
  // player's stored one so switching the age-group dropdown updates the note
  // straight away. squadMismatch returns null for an unrecorded gender and
  // for every Tag / Mixed Contact squad — see src/lib/gender.js.
  //
  // ⚠️ Deliberately NOT wired into `invalid` or the submit guard, and that is
  // Jay's explicit ruling of 9 Aug 2026, not an oversight: a CONTRADICTORY
  // gender warns and saves; only a BLANK one is refused. The club has had four
  // women in "Senior Men 2nd XV"; making this block a save would have left
  // those four players uneditable by anybody, including whoever was trying to
  // correct them.
  const mismatch = squadMismatch(values.gender, selectedTeam?.name)

  // Whether the squad makes the field mandatory. Drives the asterisk and the
  // aria-required below; the actual refusal happens in handleSubmit.
  const genderRequired = squadRequiresGender(selectedTeam?.name)

  // ══ U10 AND BELOW ═══════════════════════════════════════════════════════
  //
  // No grade, no forward-or-back, no positions. There is no league below U11,
  // so there is no tier to grade anybody for; and at tag rugby "prop" is not a
  // thing a six-year-old is yet. Confirmed by the club's youth section, 15 Aug
  // 2026 — src/lib/minis.js.
  //
  // ⚠️ KEYED ON THE SELECTED SQUAD, exactly like the U13 contact rule six lines
  // above and for the same reason: moving a child from U10 to U11 in this form
  // must reveal the fields there and then, not after a save and a reopen.
  //
  // ⚠️ THE VALUES ARE LEFT ALONE, NOT CLEARED. `values.tier`, `values.unit` and
  // `values.positions` still hold whatever was loaded, and the submit still
  // writes them — so hiding the controls rewrites nothing. A U8 player who was
  // graded before today keeps their row until somebody moves them up and clears
  // it deliberately. Blanking on render would be a destructive write triggered
  // by opening a form, which is the one thing a form must never do.
  const minisPlayer = isMinisTeam(selectedTeam?.name)

  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit player' : 'Add player'}>
      {/* noValidate: this form does its own validation and reports it in a
          role="alert" region, which a screen reader announces — the native
          bubble is neither announced reliably nor visible to the browser
          check. */}
      <form onSubmit={handleSubmit} noValidate>
        {/* ⚠️ TWO BOXES, NOT ONE. A single box gets a single word — that is how
            a child reached the live roster with a first name and nothing else,
            and it is the whole reason players.first_name / last_name exist.
            Keep the ids: `player-name` was the old one and nothing outside this
            file used it, but `player-first-name` / `player-last-name` are what
            the tests and the label pairs hang off now. */}
        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-first-name">
            First name
          </label>
          <input
            id="player-first-name"
            type="text"
            value={values.firstName}
            onChange={setFromInput('firstName')}
            aria-invalid={invalid.firstName ? 'true' : undefined}
            placeholder="e.g. Tom"
            className={inputClasses(invalid.firstName)}
          />
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-last-name">
            Family name
          </label>
          <input
            id="player-last-name"
            type="text"
            value={values.lastName}
            onChange={setFromInput('lastName')}
            aria-invalid={invalid.lastName ? 'true' : undefined}
            placeholder="e.g. Fletcher"
            className={inputClasses(invalid.lastName)}
          />
        </div>

        <PhotoField
          player={player}
          file={photoFile}
          removed={photoRemoved}
          focus={photoFocus}
          onFocusChange={setPhotoFocus}
          disabled={saving}
          onFileChange={(file) => {
            setPhotoFile(file)
            // Choosing a new photo cancels a pending removal.
            if (file) setPhotoRemoved(false)
          }}
          onRemove={() => {
            setPhotoFile(null)
            setPhotoRemoved(true)
          }}
        />

        {/* ⚠️ ABOVE POSITION, AND THAT ORDER IS THE POINT. This is the coarse
            answer a coach has first — a player is plainly a forward months
            before anyone decides between prop and lock — and Position below is
            the detail that may never be filled in. Asking for the detail first
            is what pushed those players into "Other" on the roster.
            ⚠️ AUTHORITATIVE OVER Position WHERE THEY DISAGREE (Jay, 14 Aug
            2026). The form does not stop you saying "back" and "Flanker"; that
            combination is a data error for a human to notice, not something the
            app reconciles. */}
        {/* ⚠️ THE THREE SELECTION FIELDS BELOW — unit, positions and tier — ARE
            ALL OFF FOR U10 AND BELOW. See the `minisPlayer` block above for why,
            and for why the stored values are deliberately untouched. */}
        {!minisPlayer && (
        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-unit">
            Forward or back
          </label>
          <select
            id="player-unit"
            value={values.unit}
            onChange={setFromInput('unit')}
            className={inputClasses(false)}
          >
            <option value="">Not set</option>
            <option value="forward">Forward</option>
            <option value="back">Back</option>
          </select>
        </div>
        )}

        {/* ⚠️ EVERY POSITION THIS PLAYER CAN COVER (Jay, 14 Aug 2026: "the option
            to add multiple positions in case there are players who play
            different positions sometimes").
            ⚠️ THE FIRST ONE TICKED BECOMES players.position, which is still the
            PRIMARY and is what six other screens read — see the player_positions
            migration. Order is the order of POSITIONS, not the order of ticking,
            because a checkbox list has no memory of which was pressed first and
            pretending otherwise would make the primary depend on invisible
            state. */}
        {!minisPlayer && (
        <fieldset className={FIELD}>
          <legend className={LABEL}>Positions they can play</legend>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((position) => {
              const on = values.positions.includes(position)
              return (
                <label key={position}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setValues((current) => ({
                        ...current,
                        positions: on
                          ? current.positions.filter((p) => p !== position)
                          : POSITIONS.filter(
                              (p) => p === position || current.positions.includes(p),
                            ),
                      }))
                    }
                    className="peer sr-only"
                  />
                  <span
                    className={[
                      'block cursor-pointer select-none rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2',
                      on
                        ? 'border-brand bg-surface-mute font-bold text-brand-deep'
                        : 'border-line font-semibold text-ink',
                    ].join(' ')}
                  >
                    {position}
                  </span>
                </label>
              )
            })}
          </div>
          {values.positions.length > 1 && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              {values.positions[0]} is their main position — it is the one shown on the
              roster and in lists.
            </p>
          )}
        </fieldset>
        )}

        {/* ⚠️ COACH AND MANAGER ONLY, AND THE DATABASE IS WHAT ENFORCES IT — the
            `player grade manage` policy on `player_grades` is can_edit_team on
            BOTH read and write, with no wider read arm, so a parent cannot see
            their own child's grade either. This form is already coach-only (see
            the `gated` check above), so the control is simply here.
            ⚠️ IT MUST NEVER REACH THE SHARED LINEUP IMAGE. That PNG leaves the
            app and can be forwarded on; a judgement about a child's ability must
            not travel with it. */}
        {!minisPlayer && (
        <div className={FIELD}>
          <label className={LABEL} htmlFor="player-tier">
            Tier
          </label>
          <select
            id="player-tier"
            value={values.tier}
            onChange={setFromInput('tier')}
            className={inputClasses(false)}
          >
            <option value="">Not graded</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            Which league tier they play at. Only coaches and managers can see this —
            it is not shown to parents and never appears on a shared team sheet.
          </p>
        </div>
        )}

        {!minisPlayer && (
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
        )}

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

        {/* Sits directly under Age group so the mismatch note below lands
            next to the squad it is talking about. No "Not set" option: Jay
            chose two buttons, so an existing player with no gender recorded
            shows both OFF and there is no way back to null from this form
            once one is picked. That is the accepted trade — see the null
            discussion in db/migrations/20260807_player_gender.sql. */}
        {/* "(required)" goes in the LEGEND rather than beside it, because a
            fieldset's legend is what a screen reader announces with every
            radio in the group — a separate asterisk next to it is announced
            once, or not at all, depending on the reader. */}
        <Segmented
          legend={genderRequired ? 'Gender (required)' : 'Gender'}
          name="player-gender"
          options={GENDERS}
          value={values.gender}
          onChange={set('gender')}
          disabled={saving}
          className="mb-2"
        />

        {/* Says WHY it is required, before they hit Save rather than after.
            The person has usually just changed the age group, and a field
            that silently becomes mandatory reads as the app malfunctioning. */}
        {genderRequired && !values.gender && (
          <p className="mb-3.5 rounded-[11px] bg-surface px-3 py-2.5 text-[12.5px] text-ink-muted">
            {selectedTeam.name} is a single-gender squad, so this one has to be
            answered.
          </p>
        )}

        {/* Advisory, never blocking. bg-warn-bg (not danger) and phrased as a
            check rather than a correction, because a woman in a men's squad
            is a real arrangement at this club and not an error to fix. */}
        {mismatch && (
          <p className="mb-3.5 rounded-[11px] bg-warn-bg px-3 py-2.5 text-[12.5px] text-ink">
            {mismatch}
          </p>
        )}

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

        {contactStatus === 'ready' && ownContactAllowed && (
          <>
            <div className={FIELD}>
              <PhoneInput
                id="player-phone"
                label="Player phone"
                country={values.phoneCountry}
                national={values.phoneNational}
                disabled={saving}
                onCountryChange={set('phoneCountry')}
                onNationalChange={set('phoneNational')}
              />
            </div>

            <div className={FIELD}>
              <label className={LABEL} htmlFor="player-email">
                Player email
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

        {/* Below U13 the player's own contact fields are not rendered at all,
            and this says why — otherwise their absence reads as a bug to a
            coach who has just seen them on an older squad. It replaces the
            fields rather than sitting beside them. */}
        {contactStatus === 'ready' && !ownContactAllowed && (
          <p className="mb-3.5 rounded-[11px] bg-surface-mute px-3 py-2.5 text-[12.5px] text-ink-muted">
            Players under 13 don&apos;t have their own contact details in the app. Use the parent
            details below.
          </p>
        )}

        {parentsStatus === 'error' && (
          <p role="alert" className="mb-3.5 rounded-[11px] bg-warn-bg px-3 py-2.5 text-sm text-ink">
            We couldn&apos;t load this player&apos;s parent details, so they can&apos;t be edited
            right now. Saving will leave them exactly as they are.
          </p>
        )}

        {parentsStatus === 'ready' && (
          <ParentsEditor parents={parents} onChange={setParents} disabled={saving} />
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
            {errorStage === 'photo' && (
              <span className="block">The player was saved, but the photo was not.</span>
            )}
            {errorStage === 'parents' && (
              <span className="block">
                The player was saved, but the parent details were not.
              </span>
            )}
            {/* ⚠️ NAMED SEPARATELY rather than folded into one "something else
                failed" line. `savePlayerPositions` deletes before it inserts, so
                a refusal can leave a player with NO positions — a coach needs to
                know which of the two to check. */}
            {errorStage === 'positions' && (
              <span className="block">
                The player was saved, but their positions were not — they may now have
                none. Check them and save again.
              </span>
            )}
            {errorStage === 'grade' && (
              <span className="block">The player was saved, but their tier was not.</span>
            )}
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          full
          // Disabled until the existing contact row has settled: a submit
          // before then would write the still-blank fields over real details.
          disabled={saving || contactLoading || parentsLoading}
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add player'}
        </Button>
      </form>
    </Sheet>
  )
}
