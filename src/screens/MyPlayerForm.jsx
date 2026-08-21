import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import Button from '../components/Button.jsx'
import PhotoField from '../components/PhotoField.jsx'
import ParentsEditor from '../components/ParentsEditor.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import Segmented from '../components/Segmented.jsx'
import {
  getPlayerContact,
  getPlayerDob,
  setOwnPlayerGender,
  updatePlayerDob,
  upsertContact,
} from '../data/players.js'
import { GENDERS, genderRequiredMessage, squadRequiresGender } from '../lib/gender.js'
import { listParents, saveParents } from '../data/parents.js'
import {
  deletePlayerPhoto,
  forgetPhotoUrl,
  setOwnPlayerPhoto,
  setOwnPlayerPhotoFocus,
  uploadPlayerPhoto,
} from '../data/photos.js'
import useOwnContactGate from '../lib/useOwnContactGate.js'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { parentNameProblem, toEditorRows, toSaveRows } from '../lib/parentRows.js'

// The self-service form: what a PARENT or the PLAYER themselves can change on
// their own record — the photo, the player's own contact details, the
// parent/carer rows (Jay's scope, 4 Aug 2026), and gender (added 7 Aug 2026).
//
// Gender is the odd one out and is worth naming: it is a column on
// public.players, the same table holding the club-controlled fields this
// screen refuses to show. It is editable here anyway because Jay scoped it
// that way, and it is safe because it does not travel through this table's
// RLS at all — see the setOwnPlayerGender note in handleSubmit.
//
// Deliberately a separate screen from PlayerForm rather than a "restricted
// mode" flag on it. PlayerForm edits name, position, age group and captaincy;
// none of those are self-editable, and a form that renders fields it must then
// refuse to save is a form that will eventually save them. Here the
// club-controlled fields do not exist in the component at all, so there is no
// path — not a disabled input, not a hidden one — through which they could be
// written.
//
// That separation is a convenience, NOT the security boundary. The boundary is
// in the database: player_contacts and player_parents get owner policies
// scoped by private.is_own_player, and players.photo_path moves through
// public.set_own_player_photo() because RLS grants access to rows, not
// columns — an owner-update policy on public.players would hand a parent
// team_id along with photo_path. See
// db/migrations/20260804_self_service_profile.sql.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

export default function MyPlayerForm({ player, team, onClose, onSaved }) {
  // ⚠️ THE BIRTHDAY NARROWS THE SQUAD'S ANSWER, AND CAN ONLY NARROW IT (17 Aug
  // 2026, the re-point). The squad name decides whether to ask at all; the
  // birthday can then take the fields away from a child playing up in a squad
  // old enough to have them. It can never grant them — a parent writes their own
  // child's birthday, so the other direction is a family unlocking a field the
  // club forbids. One hook, shared with PlayerForm and PlayerDetail, because
  // three copies of this is three chances for one of them to fail open.
  const { allowed: showOwnContact, settled: gateSettled } = useOwnContactGate(
    player.id,
    team?.name,
  )

  // ⚠️ Fails OPEN on a missing team, unlike showOwnContact directly above it,
  // which fails CLOSED. The asymmetry is deliberate and worth the two lines:
  // if the team row failed to load, refusing every save would leave a parent
  // with a form that cannot be submitted and no way to find out why, whereas
  // withholding a child's own contact fields costs nothing.
  const genderRequired = squadRequiresGender(team?.name)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [photoFile, setPhotoFile] = useState(null)
  const [photoFocus, setPhotoFocus] = useState(
    player?.photo_focus_x == null && player?.photo_focus_y == null
      ? null
      : { x: player?.photo_focus_x, y: player?.photo_focus_y },
  )
  const [photoRemoved, setPhotoRemoved] = useState(false)
  // Phone is stored E.164 and edited as country + national digits, the same
  // split PlayerForm and the parent rows use (see src/components/PhoneInput.jsx).
  const [phoneCountry, setPhoneCountry] = useState(() => splitPhone('').country)
  const [phoneNational, setPhoneNational] = useState('')
  const [email, setEmail] = useState('')
  const [parents, setParents] = useState([])
  // Seeded from the row the roster already loaded — unlike the contact
  // details, gender is on public.players itself and came back with the
  // player, so there is nothing to fetch. null when never recorded, which is
  // most players; Segmented renders that as both buttons off.
  const [gender, setGender] = useState(player.gender ?? null)
  // ⚠️ THE FIRST PLACE AN EXISTING FAMILY CAN CORRECT A BIRTHDAY — 17 Aug 2026.
  // Until now the ONLY screen in the app that could write one was
  // PlayerRegistrationForm, which a child passes through once. Jay: "last time i
  // checked there wasn't anywhere to enter them", and he was right — the
  // completeness card on /more has been telling families to add a birthday
  // "from the buttons below" while the button below opened this form, which had
  // no such field.
  const [dob, setDob] = useState('')
  // What was on file when the sheet opened, so the save can tell an edit from an
  // untouched field. Held separately rather than compared against `player`,
  // which does not carry the birthday at all — it lives in player_private.
  const [dobOnFile, setDobOnFile] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)

    // allSettled: a missing contact row is the NORMAL case (and for an
    // under-13 it is withheld by design), so a rejection here must not stop
    // someone editing their parent rows.
    //
    // ⚠️ `gateSettled`, NOT `showOwnContact`, AND THE DIFFERENCE IS THE POINT.
    // The gate answers optimistically with the SQUAD's verdict while the
    // birthday is still in flight, so acting on it here would fetch a child's
    // own email and phone and only afterwards discover they may not have one.
    // Hiding the boxes would still be correct; leaving the row in the component
    // for the next person to render would not. Waiting costs one extra round
    // trip behind a spinner that is already on screen.
    if (!gateSettled) return undefined

    // ⚠️ THE BIRTHDAY IS READ HERE RATHER THAN TAKEN FROM useOwnContactGate,
    // which already fetches one. That hook reads it ONLY when the squad already
    // allows own contact (U13+) and returns { allowed, settled } rather than the
    // date — so for a U10 family, the squad this matters most for, it never
    // fetches at all. Borrowing it would work on exactly the squads that need it
    // least.
    Promise.allSettled([
      listParents(player.id),
      showOwnContact ? getPlayerContact(player.id) : null,
      getPlayerDob(player.id),
    ])
      .then(([parentsResult, contactResult, dobResult]) => {
        if (!mounted) return
        // ⚠️ null IS BOTH "none on file" AND "you may not see it", and
        // getPlayerDob's header says the caller must not tell them apart. A
        // parent looking at their OWN child can always see it, so for this
        // screen an empty box means the club has none — which is the thing the
        // family is being asked to fill in.
        if (dobResult.status === 'fulfilled') {
          setDob(dobResult.value ?? '')
          setDobOnFile(dobResult.value ?? '')
        }
        // !! toEditorRows, NOT the raw rows. ParentsEditor holds a phone as
        // phoneCountry + phoneNational; handing it the database's single
        // `phone` string rendered the field BLANK for a parent who had one on
        // file. See src/lib/parentRows.js for the whole bug.
        if (parentsResult.status === 'fulfilled') setParents(toEditorRows(parentsResult.value))
        if (contactResult.status === 'fulfilled' && contactResult.value) {
          const split = splitPhone(contactResult.value.phone ?? '')
          setPhoneCountry(split.country)
          setPhoneNational(split.national)
          setEmail(contactResult.value.email ?? '')
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [player.id, showOwnContact, gateSettled])

  async function handleSubmit(event) {
    event.preventDefault()

    // ⚠️ CHECKED BEFORE `saving` is set, so a refusal leaves the form exactly
    // as it was rather than flickering into a saving state and back. Nothing
    // has been written at this point — the photo upload below is the first
    // side effect, and it is irreversible from this screen.
    if (genderRequired && !gender) {
      setError(genderRequiredMessage(team.name))
      return
    }

    // ⚠️ THE SAME RULE PlayerForm ENFORCES, FROM THE SAME FUNCTION. Two screens
    // write player_parents and they are the only two things that do; a second
    // copy of "both names" here would be a rule free to disagree with the
    // other, and the one nobody tested would be the one that let a one-word
    // name through. Checked before `saving` is set, for the reason above: the
    // photo upload below is the first irreversible side effect.
    const parentProblem = parentNameProblem(parents)
    if (parentProblem) {
      setError(parentProblem)
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Photo first and on its own path. The upload writes to storage, then
      // the RPC records the key; the OLD object is deleted only after the new
      // key is safely recorded, so a failure mid-swap loses nothing — the same
      // ordering PlayerForm uses.
      const previousPath = player.photo_path ?? null
      if (photoFile || photoRemoved) {
        const nextPath = photoFile ? await uploadPlayerPhoto(player.id, photoFile) : null
        await setOwnPlayerPhoto(player.id, nextPath)
        // ⚠️ A SECOND CALL, WHERE THE COACH FORM MANAGES ONE. That form writes
        // the row directly and can carry both columns in a single upsert; a
        // parent has no such reach and goes through `set_own_player_photo`,
        // scoped by `private.is_own_player`. The focal point follows the same
        // route rather than inventing a third place for the rule to live.
        //
        // ⚠️ AFTER the path, and awaited: if this fails the photo is still
        // saved and the position is merely the centre, which is the same
        // trade the staff card makes.
        await setOwnPlayerPhotoFocus(player.id, nextPath ? photoFocus : null)
        if (previousPath && previousPath !== nextPath) {
          forgetPhotoUrl(previousPath)
          deletePlayerPhoto(previousPath)
        }
      }

      // Gender goes through its own RPC, and only when it actually changed.
      //
      // ⚠️ NOT upsertPlayer. The caller here holds no write on public.players
      // — `player edit` is gated on can_edit_team — so an ordinary update
      // would affect zero rows and be reported as a permission refusal. The
      // RPC is SECURITY DEFINER with a hard-coded column list, so it cannot
      // be talked into writing team_id. See setOwnPlayerGender in
      // src/data/players.js and db/migrations/20260807_player_gender.sql.
      //
      // The equality guard is not just an optimisation: without it, every
      // save by a parent whose child has no gender recorded would send null
      // and pointlessly exercise a privileged write path.
      if ((player.gender ?? null) !== (gender ?? null)) {
        await setOwnPlayerGender(player.id, gender)
      }

      // ⚠️ updatePlayerDob, NEVER setPlayerDob. The latter also writes
      // `plays_up_confirmed_at`, defaulting it to null — so saving this form to
      // fix a typo would erase a parent's recorded play-up consent. Measured on
      // production in a rolled-back transaction: the old writer erased it, this
      // one keeps it. See updatePlayerDob's header.
      //
      // Sent only when it changed, the same guard the gender write above uses
      // and for the same reason: an unchanged save should not exercise a write
      // path at all.
      if ((dobOnFile ?? '') !== (dob ?? '')) {
        await updatePlayerDob(player.id, dob || null)
      }

      if (showOwnContact) {
        await upsertContact({
          player_id: player.id,
          phone: joinPhone(phoneCountry, phoneNational),
          email: email || null,
        })
      }

      // ⚠️ toSaveRows, NOT the editor rows. This line used to pass them
      // straight through, and toRow() in src/data/parents.js reads
      // `parent.phone`. On a NEW editor row that key does not exist, so null
      // was written; on an EXISTING row it still held the OLD value, so the
      // parent's edit was discarded in favour of what was already there.
      // Either way the save reported success. See src/lib/parentRows.js for a
      // precise account of what it did and did not do.
      await saveParents(player.id, toSaveRows(parents))

      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err.message || "We couldn't save those changes. Try again.")
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Update ${player.full_name}`}>
      {loading ? (
        <div className="py-10">
          <Spinner label="Loading details…" />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
            >
              {error}
            </p>
          )}

          {/* Says what is NOT editable here, once, rather than rendering the
              club-controlled fields as disabled boxes. A greyed-out "Age
              group" invites someone to try to change it and then wonder why
              they can't. */}
          {/* Lists exactly what this form writes. Kept in step with the
              fields below on purpose: it is the only thing telling a parent
              why "Age group" isn't here, and a stale list would have them
              hunting for a field that doesn't exist. */}
          <p className="mb-4 text-[12.5px] leading-relaxed text-ink-muted">
            You can update the photo, gender, contact details and parents here. Name, position and
            age group are set by the club — ask a coach if any of those are wrong.
          </p>

          <PhotoField
            player={player}
            file={photoFile}
            removed={photoRemoved}
            focus={photoFocus}
            onFocusChange={setPhotoFocus}
            onFileChange={(file) => {
              setPhotoFile(file)
              setPhotoRemoved(false)
            }}
            onRemove={() => {
              setPhotoFile(null)
              setPhotoRemoved(true)
            }}
            disabled={saving}
          />

          {/* Still no squad-MISMATCH note, and the original reasoning holds:
              this form cannot change the squad, so the only thing a parent
              could do about a mismatch is un-answer the question, and the
              arrangement is the club's business rather than theirs to be
              warned about.

              ⚠️ The REQUIREMENT is different and is enforced here (Jay, 9 Aug
              2026). A blank gender on a single-gender squad is refused, and it
              has to be refused on this form too — this is the form the parents
              in the pilot actually use, so exempting it would mean the rule
              applies to everyone except the people filling in the data. */}
          <div className="mt-5">
            <Segmented
              legend={genderRequired ? 'Gender (required)' : 'Gender'}
              name="my-player-gender"
              options={GENDERS}
              value={gender}
              onChange={setGender}
              disabled={saving}
              className="mb-0"
            />
          </div>

          {genderRequired && !gender && (
            <p className="mt-2 rounded-[11px] bg-surface px-3 py-2.5 text-[12.5px] text-ink-muted">
              {team.name} is a single-gender squad, so this one has to be answered
              before you can save.
            </p>
          )}

          {/* ⚠️ THE FIELD THAT DID NOT EXIST — 17 Aug 2026. Until now the only
              screen in the whole app that could write a birthday was the
              registration form, which a family passes through once. So a date
              entered wrongly was permanent, and the completeness card on /more
              has been asking families to add one "from the buttons below" while
              the button below opened this form, which had no such field. Jay
              spotted the gap: "last time i checked there wasn't anywhere to
              enter them".

              ⚠️ IT IS NOT REQUIRED HERE, deliberately, unlike gender above.
              This form is opened to change a photo or a parent's phone number,
              and refusing to save any of that because the club is also missing a
              birthday would block an unrelated edit. The sign-in gate is what
              actually collects it; this is where it gets corrected.

              ⚠️ AND IT NEVER TOUCHES plays_up_confirmed_at — see the write in
              handleSubmit. Saving this form must not be able to withdraw a
              consent nobody was asked about. */}
          <div className="mt-5">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Date of birth
              </span>
              <input
                type="date"
                data-testid="my-player-dob"
                value={dob}
                disabled={saving}
                onChange={(event) => setDob(event.target.value)}
                className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition focus:border-brand"
              />
            </label>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              The club uses this to put {player.full_name} in the right age group.
            </p>
          </div>

          {/* The U13 rule (src/lib/ageGroup.js): an under-13 has no direct
              contact route in the app, so these fields are absent rather than
              empty. allowsOwnContact fails closed on an unknown squad. */}
          {showOwnContact && (
            <div className="mt-5">
              <h4 className="mb-3 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
                Player contact
              </h4>

              <PhoneInput
                id="my-phone"
                country={phoneCountry}
                national={phoneNational}
                onCountryChange={setPhoneCountry}
                onNationalChange={setPhoneNational}
                disabled={saving}
              />

              <label htmlFor="my-email" className={`${LABEL} mt-4`}>
                Email
              </label>
              <input
                id="my-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={saving}
                className={FIELD}
              />
            </div>
          )}

          <div className="mt-5">
            <ParentsEditor parents={parents} onChange={setParents} disabled={saving} />
          </div>

          <div className="mt-6 flex gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
