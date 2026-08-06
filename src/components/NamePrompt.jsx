import { useEffect, useState } from 'react'
import Sheet from './Sheet.jsx'
import { getMyProfile, updateProfileNames } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'

// The sign-in name gate: first name and family name, asked once, before the
// app is usable.
//
// ⚠️ THIS USED TO BE A SKIPPABLE PROMPT AND IS NOW A HARD GATE (6 Aug 2026,
// claude/decisions/2026-08-06-roster-auto-onboarding.md). The old header
// promised "it never blocks the app"; that promise is deliberately broken and
// the reasons are worth keeping:
//
//   1. Roster onboarding brings ~279 parents in at once with nobody vetting
//      them one at a time. A skippable prompt gets skipped, and a club of
//      "Unnamed member" rows cannot be administered at all.
//   2. A name is now load-bearing for coaches, not decoration.
//
// WHY EVERYONE SEES IT, NOT JUST THE UNNAMED — this is the part that is easy
// to get wrong. private.handle_new_user() seeds full_name from Google's
// metadata, and private.sync_profile_name() splits it, so a Google sign-up
// arrives with first_name and last_name ALREADY POPULATED. Gating on "is the
// name empty" would therefore skip every Google user — about half the club.
//
// And those are exactly the names most likely to be wrong. Google supplied
// "Jason Muir" for an account whose owner is known at this club as "Jay Muir".
// The name was present, populated, and not what anyone would search for. So
// the gate opens on `name_confirmed_at is null` — has this person told US
// their name — and prefills whatever we already think it is, making it a
// two-second confirmation for the people who have nothing to correct.
//
// Rules that still hold from the original:
//   - A failed profile READ does not open the gate. If we cannot tell whether
//     the name is confirmed, locking someone out of the app on a network blip
//     is far worse than asking again next load.
//   - Nothing about this lives in localStorage. The old version suppressed
//     itself with a per-device key, which a hard gate cannot use: it would be
//     escapable by opening the app on a phone, and would re-nag someone who
//     had already answered on their laptop. `profiles.name_confirmed_at` is
//     the state, and it is per-person, not per-device.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

export default function NamePrompt() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [profileId, setProfileId] = useState(null)
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return undefined

    let active = true
    getMyProfile(userId)
      .then((profile) => {
        if (!active || !profile) return
        // The single condition. Not "is the name blank" — see the header.
        if (profile.name_confirmed_at) return
        setProfileId(profile.id)
        // Prefill with whatever we already hold, so a Google user confirms
        // rather than retypes. Blank for a magic-link user, who types both.
        setFirstName(String(profile.first_name ?? ''))
        setLastName(String(profile.last_name ?? ''))
        setOpen(true)
      })
      .catch(() => {
        // Deliberately silent, and deliberately leaves the gate CLOSED.
      })

    return () => {
      active = false
    }
  }, [userId])

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    const first = firstName.trim()
    if (!first) {
      setError(new Error('Enter your first name.'))
      return
    }

    setSaving(true)
    setError(null)
    // Family name is intentionally NOT required. Plenty of people have one
    // name, and a gate nobody can pass is worse than a sortable list.
    updateProfileNames({ profileId, firstName: first, lastName: lastName.trim() })
      .then(() => {
        setOpen(false)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  if (!open) return null

  return (
    // No onClose: dismissible={false} removes the X, Escape and the backdrop
    // click, so nothing can call it. Passing a no-op rather than omitting it
    // keeps Sheet's internals from having to handle undefined.
    <Sheet open dismissible={false} onClose={() => {}} title="What should we call you?">
      <form onSubmit={handleSubmit} noValidate>
        <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
          Coaches and admins see this name on team sheets and squad lists, so
          it&apos;s worth it being the one people know you by.
        </p>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="name-prompt-first-name">
            First name
          </label>
          <input
            id="name-prompt-first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(domEvent) => {
              setFirstName(domEvent.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? 'true' : undefined}
            placeholder="e.g. Jay"
            className={INPUT}
          />
        </div>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="name-prompt-last-name">
            Family name <span className="font-semibold normal-case">(optional)</span>
          </label>
          <input
            id="name-prompt-last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(domEvent) => setLastName(domEvent.target.value)}
            placeholder="e.g. Muir"
            className={INPUT}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that name. Try again."}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-[11px] bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </Sheet>
  )
}
