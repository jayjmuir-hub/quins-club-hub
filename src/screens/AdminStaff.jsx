import { useCallback, useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import PhotoPositioner, {
  PhotoDropZone,
  DEFAULT_FOCUS,
  clampFocus,
  focusToObjectPosition,
} from '../components/PhotoPositioner.jsx'
import PersonCard from '../components/PersonCard.jsx'
import PersonName from '../components/PersonName.jsx'
import { listSquadStaff, setMembershipTitle, setMembershipHeadCoach } from '../data/staff.js'
import { useAuth } from '../lib/auth.jsx'
import { deleteStaffPhoto, setStaffPhoto, signStaffPhotoUrl, uploadStaffPhoto } from '../data/photos.js'
import { initials } from '../lib/playerFormat.js'
import { STAFF_TITLES, labelForRole, canHoldHeadCoachFlag } from '../lib/scope.js'

// The Staff tab of /admin — every squad, and who looks after it.
//
// ⚠️ THIS SCREEN EXISTS BECAUSE OF A MEASUREMENT, NOT BECAUSE OF A FEATURE
// REQUEST. Jay asked for age groups to see their coaches on the Home screen.
// Measured first (13 Aug 2026): twelve of fifteen squads had no coach, manager
// or medic attached at all. So the member-facing card would have shipped EMPTY
// to 80% of the club, and there would have been no way to see why. This screen
// is the half that is useful while the data is still missing — and it stops
// being interesting the day the club is fully staffed, which is the point.
//
// ⚠️ THE EMPTY SQUADS ARE THE CONTENT. A directory that listed only squads WITH
// staff would hide exactly the rows somebody needs to act on, and would read as
// "all good". src/data/staff.js builds from `teams` outward for this reason.
//
// Mounted under AdminDashboard, which has already checked isAdmin(), so this
// file does not re-gate — the same arrangement AdminClub.jsx documents. RLS is
// what actually decides which rows come back.
//
// ⚠️ NOBODY IS ATTACHED TO A SQUAD FROM HERE, DELIBERATELY. Creating a
// membership is the grant flow in src/screens/Accounts.jsx, a 1,612-line file
// that claude/plans/2026-08-13-accounts-screen-redesign.md also wants to
// change. Pulling it in here would collide with that work and triple this
// change. This screen tells you WHERE the gaps are; Accounts is where you fill
// them.

// The monogram's gradient, keyed to role — the same three tokens
// SquadStaffCard uses on Home, so a coach is the same colour in both places.
// Decorative: the role is written in words beside every bubble that carries it.
const TONE = {
  coach: 'bg-monogram-coach',
  manager: 'bg-monogram-manager',
  medic: 'bg-monogram-medic',
}

/**
 * A person, as a circle.
 *
 * ⚠️ ALWAYS THE INITIALS, NEVER THE PHOTO, IN THE COLLAPSED ROW. Two of the
 * club's staff have a photo; a row that mixed faces and monograms would read as
 * broken rather than as partly-filled, and the photo has a job lower down where
 * it is large enough to recognise anybody by.
 */
function Bubble({ member, size = 'h-9 w-9', text = 'text-[11px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${size} shrink-0 place-items-center rounded-full ${text} font-extrabold text-ink-invert ${TONE[member.role] ?? 'bg-monogram-manager'}`}
    >
      {initials(member.name)}
    </span>
  )
}

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

/**
 * One person's row.
 *
 * ⚠️ THE TITLE SAVES ON BLUR, AND A FAILED SAVE MUST NOT LEAVE THE TYPED VALUE
 * ON SCREEN LOOKING SAVED. On failure the input is put back to what the
 * database last confirmed, and the reason is shown next to it — the same
 * principle as every write in src/data/: a refusal that renders as success is
 * worse than an error.
 */

/**
 * The photo control on a staff row.
 *
 * ⚠️ IT EXISTS BECAUSE A RULING WAS REVERSED, AND THE REVERSAL IS THE REASON
 * THIS SCREEN IS THE RIGHT HOME FOR IT. Staff photos were own-photo-only until
 * 15 Aug 2026; two of the club's fifteen staff had one and most were never
 * going to log in to change that. See
 * claude/decisions/2026-08-15-admin-may-set-staff-photos.md.
 *
 * ⚠️ IT UPLOADS IMMEDIATELY, LIKE MyPhotoField AND UNLIKE PhotoField. There is
 * no form here to defer to, so the upload IS the action — and the order matters
 * for the same reason MyPhotoField documents: the object lands first, and if
 * RECORDING it then fails the just-uploaded object is deleted, so a failure
 * leaves no file that nothing points at.
 *
 * ⚠️ THE POSITION IS SAVED WITH THE KEY, IN ONE CALL. `set_staff_photo` takes
 * both, so there is no window where a photo exists with nobody having said
 * where the face is.
 */
function StaffPhoto({ member, onPhoto }) {
  const [file, setFile] = useState(null)
  const [localUrl, setLocalUrl] = useState(null)
  const [focus, setFocus] = useState(clampFocus(member.focus))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  // ⚠️ "REPLACING" IS A SEPARATE STATE FROM "HAS NO PHOTO", AND LEAVING IT OUT
  // WAS A BUG JAY HIT WITHIN MINUTES: with a photo already saved, opening the
  // editor always showed the POSITIONER, because the stored URL was truthy —
  // so "Change photo" opened a panel with no way to choose a file, and
  // "Choose a different photo" cleared only the local preview and was
  // immediately overruled by the stored one. Nothing happened, twice.
  const [replacing, setReplacing] = useState(false)

  function take(chosen) {
    setError(null)
    setReplacing(false)
    setFile(chosen)
    // ⚠️ REVOKED, not merely replaced. Choosing three photos in a row would
    // otherwise leak two object URLs for as long as the screen is open.
    setLocalUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(chosen)
    })
    setFocus(DEFAULT_FOCUS)
  }

  // ⚠️ THE ORDERING HERE IS MyPhotoField'S, COPIED WITH ITS REASONING, AND THE
  // FIRST VERSION OF THIS FUNCTION HAD NEITHER HALF. Every "Change photo" was
  // stranding the PREVIOUS object in the bucket forever — a private bucket
  // holding photographs of real people — and a failure after the upload landed
  // stranded the NEW one. Found in review, not by a test: the suite mocks the
  // data layer, so an orphaned storage object is invisible to it.
  //
  // Upload, record, and only then delete the old object — deleting first
  // would, on a failed record, leave the profile pointing at a file that no
  // longer exists. On failure, delete the just-uploaded object. Both deletes
  // are best-effort: an orphan is untidy, and must never turn a good save into
  // a visible error.
  async function save() {
    setBusy(true)
    setError(null)
    const previous = member.photoPath
    let key = null
    try {
      if (file) {
        key = await uploadStaffPhoto(member.profileId, file)
      }
      const nextPath = key ?? member.photoPath
      const saved = await setStaffPhoto(member.profileId, nextPath, focus)
      if (previous && previous !== nextPath) {
        deleteStaffPhoto(previous)
      }
      onPhoto(member.membershipId, saved)
      close()
    } catch (err) {
      if (key) deleteStaffPhoto(key)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ⚠️ REMOVE EXISTS BECAUSE THE RPC ALWAYS ALLOWED IT AND THE UI NEVER OFFERED
  // IT — an admin who put the wrong photo on the wrong person could only fix it
  // by overwriting with another photo. Row first, object second, for the reason
  // MyPhotoField.remove() records: the row is the only thing anyone reads, so
  // clearing it is what makes the photo gone; a failed object delete then
  // leaves an unreferenced file rather than a profile pointing at a missing one.
  async function removePhoto() {
    setBusy(true)
    setError(null)
    const previous = member.photoPath
    try {
      const saved = await setStaffPhoto(member.profileId, null, null)
      if (previous) deleteStaffPhoto(previous)
      onPhoto(member.membershipId, saved)
      close()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setReplacing(false)
    setFile(null)
    setLocalUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  // ⚠️ WHILE REPLACING, THE STORED PHOTO MUST NOT WIN. Falling back to it is
  // what made "Choose a different photo" a no-op.
  const shown = replacing ? localUrl : (localUrl ?? member.photoUrl)

  if (!open) {
    return (
      <button
        type="button"
        data-testid="staff-photo-open"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[10px] border border-line px-2 py-1 text-[12.5px] font-bold text-ink-muted hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-brand/10 text-[11px] font-extrabold text-danger-ink">
          {member.photoUrl ? (
            <img
              src={member.photoUrl}
              alt=""
              style={{ objectPosition: focusToObjectPosition(member.focus) }}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(member.name)
          )}
        </span>
        {member.photoUrl ? 'Change photo' : 'Add photo'}
      </button>
    )
  }

  return (
    <div data-testid="staff-photo-editor" className="w-full rounded-card border border-line bg-surface-mute p-3">
      {shown ? (
        <PhotoPositioner url={shown} focus={focus} onFocusChange={setFocus} disabled={busy} />
      ) : (
        <PhotoDropZone onFile={take} disabled={busy} label={`Add a photo for ${member.name}`} />
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-bold text-brand-ink">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || (!file && (replacing || !member.photoPath))}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        {member.photoPath && !replacing && (
          <Button variant="ghost" onClick={removePhoto} disabled={busy} data-testid="staff-photo-remove">
            Remove photo
          </Button>
        )}
        {shown && !busy && (
          <button
            type="button"
            data-testid="staff-photo-replace"
            onClick={() => {
              setReplacing(true)
              setFile(null)
              setLocalUrl((old) => {
                if (old) URL.revokeObjectURL(old)
                return null
              })
            }}
            className="text-[12.5px] font-semibold text-brand-ink underline"
          >
            Choose a different photo
          </button>
        )}
      </div>
    </div>
  )
}

function StaffRow({ member, onSaved, onHeadCoachSaved, onPhoto, onOpenCard = null, selfId = null }) {
  const [title, setTitle] = useState(member.title ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [headCoach, setHeadCoach] = useState(member.isHeadCoach === true)
  const [headBusy, setHeadBusy] = useState(false)
  const [headError, setHeadError] = useState(null)

  const roleLabel = labelForRole(member.role)

  // ⚠️ THE BOX GOES BACK ON A FAILURE, and that is the whole point of doing
  // this here rather than letting the checkbox own its own state. The commonest
  // failure is the unique index refusing a SECOND head coach — the write fails,
  // the squad is unchanged, and a box left ticked would say otherwise.
  async function saveHeadCoach(next) {
    setHeadCoach(next)
    setHeadBusy(true)
    setHeadError(null)
    try {
      const saved = await setMembershipHeadCoach({
        membershipId: member.membershipId,
        isHeadCoach: next,
      })
      setHeadCoach(saved.is_head_coach === true)
      onHeadCoachSaved(member.membershipId, saved.is_head_coach === true)
    } catch (err) {
      setHeadCoach(member.isHeadCoach === true)
      setHeadError(err.message)
    } finally {
      setHeadBusy(false)
    }
  }

  async function save() {
    const next = title.trim()
    if (next === (member.title ?? '')) return
    setBusy(true)
    setError(null)
    try {
      const saved = await setMembershipTitle({ membershipId: member.membershipId, title: next })
      setTitle(saved.title ?? '')
      onSaved(member.membershipId, saved.title ?? null)
    } catch (err) {
      // Back to the last value the database confirmed, not to the typed one.
      setTitle(member.title ?? '')
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0" data-testid="staff-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* The person card (claude/plans/2026-08-26-person-card.md): the name
            is a door — the exact gap Jay screenshotted on this screen. */}
        <PersonName
          profileId={member.profileId}
          selfId={selfId}
          onOpen={onOpenCard}
          className="text-[15px] font-bold text-ink"
        >
          {member.name}
        </PersonName>
        {roleLabel && (
          <span className="rounded-[8px] border border-line px-2 py-0.5 text-[12px] font-bold text-ink-muted">
            {roleLabel}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-ink-muted">
        {/* ⚠️ Said out loud rather than left as a gap: "no phone number" is a
            thing an admin has to chase, so it must be readable, not absent. */}
        <span>{member.email ?? 'No email'}</span>
        <span>{member.phone ?? 'No phone number'}</span>
      </div>

      <div className="mt-2">
        <StaffPhoto member={member} onPhoto={onPhoto} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] font-bold text-ink-muted" htmlFor={`title-${member.membershipId}`}>
          Title
        </label>
        <input
          id={`title-${member.membershipId}`}
          list="staff-titles"
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={save}
          placeholder="e.g. Head Coach"
          className="w-[190px] rounded-[8px] border border-line px-2.5 py-1 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        {busy && <span className="text-[12.5px] text-ink-faint">Saving…</span>}
        {error && (
          <span role="alert" className="text-[12.5px] font-bold text-brand-ink">
            {error}
          </span>
        )}
      </div>

      {/* ⚠️ THE FLAG, WHICH IS NOT THE TITLE ABOVE IT, and the two are separate
          on purpose. The title is a label — it reads nicely on the squad card
          and grants nothing. THIS decides who is e-mailed when a parent
          registers a child for this squad. A squad can read "Head Coach" and
          not carry the flag, which is precisely the drift the flag was added to
          end, so both are shown together rather than one standing for the other.

          ⚠️ COACHES ONLY. The database refuses the flag on anything else
          (memberships_head_coach_is_a_squad_coach), so offering it to a manager
          or a medic would be offering a control that always fails.

          ⚠️ NOT A RADIO GROUP, DELIBERATELY. One head coach per squad is
          enforced by a unique index, so moving the job is unticking one person
          and ticking another — two explicit actions. A radio would have to
          clear-then-set behind the scenes, and a half-failed pair would leave
          the squad with NO head coach and nobody told about it. */}
      {canHoldHeadCoachFlag(member.role) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink-muted">
            <input
              type="checkbox"
              checked={headCoach}
              disabled={headBusy}
              onChange={(event) => saveHeadCoach(event.target.checked)}
              className="h-4 w-4 rounded-[4px] border-line text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            Head coach — gets the approval emails for this squad
          </label>
          {headBusy && <span className="text-[12.5px] text-ink-faint">Saving…</span>}
          {headError && (
            <span role="alert" className="text-[12.5px] font-bold text-brand-ink">
              {headError}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One squad, collapsed to a line — and its staff underneath when opened.
 *
 * ⚠️ AN INDEX THAT EXPANDS, RATHER THAN FIFTEEN CARDS. Jay picked this shape on
 * 16 Aug 2026 from three options, and the reason it wins is what this screen is
 * usually LOOKING at: most squads have nobody attached, so a card each produced
 * a page of near-identical empty boxes that had to be scrolled past to find the
 * two that were filled. Collapsed, every squad fits on one screen and the gaps
 * are the thing that stands out.
 *
 * ⚠️ IT EXPANDS IN PLACE AND SEVERAL MAY BE OPEN AT ONCE — also Jay's call, over
 * a squad detail screen and over an accordion that closes the last one. Opening
 * a squad must not cost you sight of the others, because the task is a sweep:
 * "who is missing" is answered by comparing rows, not by visiting them.
 *
 * ⚠️ THE EXPANDED ROWS KEEP EVERY CONTROL VISIBLE. This screen is an EDITOR —
 * the title field and the photo uploader live on each person — and the Home
 * contacts card it borrows its look from is read-only. Moving editing behind a
 * second tap would have made it prettier and worse.
 */
function SquadRow({ squad, open, onToggle, onSaved, onHeadCoachSaved, onPhoto, onOpenCard = null, selfId = null }) {
  const panelId = `squad-panel-${squad.id}`
  const missing = squad.staff.length === 0
  // ⚠️ THE TITLE, FALLING BACK TO THE ROLE — Jay, 16 Aug 2026: "should be Head
  // Coach, Assistant Coach, Team Manager, Medic". The membership ROLE is the
  // permission ('coach'); the TITLE is the job somebody actually does, and a
  // squad with a head coach and an assistant reads as "Coach · Coach" if you
  // summarise by role. The title is the more specific true thing, so it wins
  // where it is set — and a squad staffed by somebody who never got one still
  // says "Coach" rather than nothing.
  //
  // ⚠️ DISTINCT, NOT ONE ENTRY PER PERSON. Two assistant coaches read as
  // "Assistant Coach · Assistant Coach", which says nothing the bubbles beside
  // it do not already show.
  const roleSummary = [
    ...new Set(
      squad.staff.map((member) => member.title?.trim() || labelForRole(member.role) || ''),
    ),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="border-b border-line last:border-b-0" data-testid="squad-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-extrabold text-ink">{squad.name}</span>
          {/* ⚠️ THE GAP IS SAID IN WORDS AND IN COLOUR, never colour alone —
              claude/specs/accessibility.md. */}
          <span
            className={`block text-[12px] font-semibold ${missing ? 'text-brand-ink' : 'text-ink-muted'}`}
          >
            {missing ? 'No coach, manager or medic' : roleSummary}
          </span>
        </span>

        {missing ? (
          <span className="shrink-0 rounded-[8px] bg-danger-bg px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
            Gap
          </span>
        ) : (
          // ⚠️ OVERLAPPED, AND CAPPED AT FOUR. A squad with six staff would
          // otherwise push the chevron off a 320px screen — the exact way this
          // app has made the whole document wider than the viewport before.
          <span className="flex shrink-0 -space-x-2">
            {squad.staff.slice(0, 4).map((member) => (
              <span key={member.membershipId} className="rounded-full ring-2 ring-surface-card">
                <Bubble member={member} />
              </span>
            ))}
            {squad.staff.length > 4 && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-mute text-[11px] font-extrabold text-ink-muted ring-2 ring-surface-card">
                +{squad.staff.length - 4}
              </span>
            )}
          </span>
        )}

        <Chevron open={open} />
      </button>

      {/* ⚠️ UNMOUNTED WHEN CLOSED, NOT HIDDEN. Each staff row holds an input
          with its own state and a photo uploader; keeping fifteen squads'
          worth mounted would put every one of them in the document, and a
          `hidden` input is still focusable by a screen reader. */}
      {open && (
        <div id={panelId} className="border-t border-line bg-surface-sunk">
          {missing ? (
            <p className="px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-muted">
              No coach, team manager or medic yet. Attach one from the{' '}
              <strong className="text-ink">Accounts</strong> tab — this screen shows who is
              attached, it cannot grant access.
            </p>
          ) : (
            squad.staff.map((member) => (
              <StaffRow
                key={member.membershipId}
                member={member}
                onSaved={onSaved}
                onHeadCoachSaved={onHeadCoachSaved}
                onPhoto={onPhoto}
                onOpenCard={onOpenCard}
                selfId={selfId}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminStaff() {
  const { user } = useAuth()
  const selfId = user?.id ?? null
  const [squads, setSquads] = useState(null)
  const [error, setError] = useState(null)
  // The tapped person's profile id, or null — one card for the whole screen.
  const [cardFor, setCardFor] = useState(null)
  // ⚠️ A SET, AND SEVERAL MAY BE OPEN AT ONCE — Jay's choice, 16 Aug 2026, over
  // an accordion that closes the last one. The task this screen serves is a
  // SWEEP: "which squads have nobody" is answered by comparing rows, and an
  // accordion that shuts the previous squad makes comparing two of them
  // impossible without remembering the first.
  //
  // ⚠️ NOTHING IS OPEN ON ARRIVAL. Fifteen open squads is the wall of cards this
  // redesign replaced, and the collapsed list IS the answer to the question the
  // screen is usually asked.
  const [openIds, setOpenIds] = useState(() => new Set())

  const toggle = useCallback((id) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      setSquads(await listSquadStaff())
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ⚠️ PATCHED IN PLACE RATHER THAN REFETCHED. A full reload after every title
  // edit would move focus and re-order nothing, for one changed string — and on
  // a screen where somebody is typing several titles in a row it would fight
  // them.
  const onSaved = useCallback((membershipId, title) => {
    setSquads((current) =>
      (current ?? []).map((squad) => ({
        ...squad,
        staff: squad.staff.map((member) =>
          member.membershipId === membershipId ? { ...member, title } : member,
        ),
      })),
    )
  }, [])

  // ⚠️ ONLY THE SAVED ROW MOVES, and it must not try to be clever. One head
  // coach per squad is enforced by a unique index, so it is tempting to clear
  // the flag on every other member here the moment one is ticked. That would be
  // a LIE whenever the write failed: the index refuses the second write, so the
  // previous head coach still IS one, and the screen would show a squad with
  // nobody. The row the database confirmed is the only row that changes.
  const onHeadCoachSaved = useCallback((membershipId, isHeadCoach) => {
    setSquads((current) =>
      (current ?? []).map((squad) => ({
        ...squad,
        staff: squad.staff.map((member) =>
          member.membershipId === membershipId ? { ...member, isHeadCoach } : member,
        ),
      })),
    )
  }, [])

  // ⚠️ PATCHED IN PLACE FOR THE SAME REASON, AND WITH ONE EXTRA CARE: the URL
  // has to be re-signed. `staff-photos` is a private bucket, so the row's
  // `photoUrl` is a SIGNED url that the RPC's return value does not carry — it
  // returns the profile row, which holds only the key. Reusing the local object
  // URL would show the right face until the next reload and then break; asking
  // for a fresh signature keeps what is on screen and what is stored the same
  // thing.
  const onPhoto = useCallback(async (membershipId, profile) => {
    const url = profile?.photo_path ? await signStaffPhotoUrl(profile.photo_path) : null
    setSquads((current) =>
      (current ?? []).map((squad) => ({
        ...squad,
        staff: squad.staff.map((member) =>
          member.membershipId === membershipId
            ? {
                ...member,
                photoPath: profile?.photo_path ?? null,
                photoUrl: url,
                focus:
                  profile?.photo_focus_x == null && profile?.photo_focus_y == null
                    ? null
                    : { x: profile.photo_focus_x, y: profile.photo_focus_y },
              }
            : member,
        ),
      })),
    )
  }, [])

  if (error) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-2 text-sm font-bold text-brand-ink underline"
        >
          Try again
        </button>
      </Card>
    )
  }

  if (!squads) return <Spinner />

  const unstaffed = squads.filter((squad) => squad.staff.length === 0).length

  return (
    <div>
      {/* One <datalist> for the whole screen — the suggestions are identical on
          every row, and one per row would put fifteen copies in the document. */}
      <datalist id="staff-titles">
        {STAFF_TITLES.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>

      <SectionTitle>Squad staff</SectionTitle>

      {/* ⚠️ THE HEADLINE IS THE GAP COUNT, NOT THE STAFF COUNT. "30 staff" reads
          as a healthy club; "12 squads have nobody" is the fact that needs
          acting on, and it is the reason this screen was built first. */}
      <p className="mb-3 text-sm text-ink-muted" data-testid="staff-summary">
        {unstaffed === 0
          ? `Every squad has someone. ${squads.length} squads.`
          : `${unstaffed} of ${squads.length} squads have nobody attached yet.`}
      </p>

      {squads.length === 0 ? (
        <Empty message="This club has no squads yet." />
      ) : (
        // ⚠️ ONE CARD FOR THE WHOLE LIST, NOT ONE PER SQUAD. The card-each layout
        // is what made fifteen squads a page of near-identical boxes; a single
        // bordered list is what lets the eye run down the names and stop on the
        // gaps.
        <Card className="overflow-hidden">
          {squads.map((squad) => (
            <SquadRow
              key={squad.id}
              squad={squad}
              open={openIds.has(squad.id)}
              onToggle={() => toggle(squad.id)}
              onSaved={onSaved}
              onHeadCoachSaved={onHeadCoachSaved}
              onPhoto={onPhoto}
              onOpenCard={setCardFor}
              selfId={selfId}
            />
          ))}
        </Card>
      )}

      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />
    </div>
  )
}
