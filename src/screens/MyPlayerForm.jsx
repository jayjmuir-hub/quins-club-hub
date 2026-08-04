import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import PhotoField from '../components/PhotoField.jsx'
import ParentsEditor from '../components/ParentsEditor.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import { getPlayerContact, upsertContact } from '../data/players.js'
import { listParents, saveParents } from '../data/parents.js'
import { deletePlayerPhoto, forgetPhotoUrl, setOwnPlayerPhoto, uploadPlayerPhoto } from '../data/photos.js'
import { allowsOwnContact } from '../lib/ageGroup.js'
import { joinPhone, splitPhone } from '../lib/phone.js'

// The self-service form: what a PARENT or the PLAYER themselves can change on
// their own record (Jay's scope, 4 Aug 2026) — the photo, the player's own
// contact details, and the parent/carer rows.
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
  const showOwnContact = allowsOwnContact(team?.name)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [photoFile, setPhotoFile] = useState(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  // Phone is stored E.164 and edited as country + national digits, the same
  // split PlayerForm and the parent rows use (see src/components/PhoneInput.jsx).
  const [phoneCountry, setPhoneCountry] = useState(() => splitPhone('').country)
  const [phoneNational, setPhoneNational] = useState('')
  const [email, setEmail] = useState('')
  const [parents, setParents] = useState([])

  useEffect(() => {
    let mounted = true
    setLoading(true)

    // allSettled: a missing contact row is the NORMAL case (and for an
    // under-13 it is withheld by design), so a rejection here must not stop
    // someone editing their parent rows.
    Promise.allSettled([listParents(player.id), showOwnContact ? getPlayerContact(player.id) : null])
      .then(([parentsResult, contactResult]) => {
        if (!mounted) return
        if (parentsResult.status === 'fulfilled') setParents(parentsResult.value ?? [])
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
  }, [player.id, showOwnContact])

  async function handleSubmit(event) {
    event.preventDefault()
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
        if (previousPath && previousPath !== nextPath) {
          forgetPhotoUrl(previousPath)
          deletePlayerPhoto(previousPath)
        }
      }

      if (showOwnContact) {
        await upsertContact({
          player_id: player.id,
          phone: joinPhone(phoneCountry, phoneNational),
          email: email || null,
        })
      }

      await saveParents(player.id, parents)

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
              className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
            >
              {error}
            </p>
          )}

          {/* Says what is NOT editable here, once, rather than rendering the
              club-controlled fields as disabled boxes. A greyed-out "Age
              group" invites someone to try to change it and then wonder why
              they can't. */}
          <p className="mb-4 text-[12.5px] leading-relaxed text-ink-muted">
            You can update the photo, contact details and parents here. Name, position and age
            group are set by the club — ask a coach if any of those are wrong.
          </p>

          <PhotoField
            player={player}
            file={photoFile}
            removed={photoRemoved}
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
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-surface-mute disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
