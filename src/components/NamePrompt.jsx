import { useEffect, useState } from 'react'
import Sheet from './Sheet.jsx'
import { getMyProfile, updateProfileName } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'

// First-login display-name prompt (plan Task C:
// claude/plans/2026-08-03-pending-access.md).
//
// Magic-link sign-up collects no name and nothing else in the app ever sets
// one, so every account starts with `full_name = ''` and shows up to admins
// (Accounts) and to everyone else (any place a profile name is rendered) as
// an unnamed row. This asks once, on the first load after sign-in, using the
// app's own Sheet — browser modal dialogs (prompt/alert/confirm) are not used
// anywhere in this codebase.
//
// Three rules it must not break:
//   1. It never blocks the app. It is skippable, the write failing is not
//      fatal, and a failed *read* is swallowed entirely — a cosmetic prompt
//      must not turn a transient network blip into an error screen.
//   2. It does not reappear in a loop. Skipping records the user's id in
//      localStorage; the read effect keys on the user id, so a re-render (or
//      a re-mount from routing) can't re-open it. Saving a name clears the
//      flag instead — the profile itself is then non-blank, so the prompt
//      stays away for the right reason, and it re-arms if the name is ever
//      blanked again.
//   3. It is not a database column. Nothing about "I dismissed a prompt"
//      belongs in `profiles`; the blank name is the real state, localStorage
//      is only the this-device nag suppressor.
//
// AppShell renders this only once memberships have loaded and are non-empty,
// so a signed-up-but-unattached user gets the "you're signed in, ask an
// admin" screen on its own without a name prompt stacked on top.

const SKIP_KEY = 'quins.namePromptSkipped'

// Same try/catch convention as readStoredViewAs in src/lib/memberships.jsx —
// Safari private mode and some locked-down browsers throw on localStorage
// access, and a thrown storage error must not take the app down.
function readSkipped() {
  try {
    return window.localStorage.getItem(SKIP_KEY)
  } catch {
    return null
  }
}

function writeSkipped(userId) {
  try {
    if (userId) window.localStorage.setItem(SKIP_KEY, userId)
    else window.localStorage.removeItem(SKIP_KEY)
  } catch {
    // Ignore: the worst case is being asked again next load.
  }
}

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

export default function NamePrompt() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [profileId, setProfileId] = useState(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) return undefined
    if (readSkipped() === userId) return undefined

    let active = true
    getMyProfile(userId)
      .then((profile) => {
        if (!active || !profile) return
        // Blank OR whitespace-only counts as unnamed — `updateProfileName`
        // trims before writing, but a name set some other way (a direct SQL
        // fix, an admin edit in an older build) might not have been.
        if (String(profile.full_name ?? '').trim()) return
        setProfileId(profile.id)
        setOpen(true)
      })
      .catch(() => {
        // Deliberately silent: see rule 1 above.
      })

    return () => {
      active = false
    }
  }, [userId])

  function handleSkip() {
    writeSkipped(userId)
    setOpen(false)
  }

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    const trimmed = name.trim()
    if (!trimmed) {
      setError(new Error('Enter your name, or choose Not now.'))
      return
    }

    setSaving(true)
    setError(null)
    updateProfileName({ profileId, fullName: trimmed })
      .then(() => {
        writeSkipped(null)
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
    <Sheet open onClose={handleSkip} title="What should we call you?">
      <form onSubmit={handleSubmit} noValidate>
        <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
          Your sign-in link didn&apos;t carry a name, so coaches and admins currently
          see your email address instead. Adding it takes a second.
        </p>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="name-prompt-full-name">
            Your name
          </label>
          <input
            id="name-prompt-full-name"
            type="text"
            value={name}
            onChange={(domEvent) => {
              setName(domEvent.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? 'true' : undefined}
            placeholder="e.g. Jay Muir"
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
          {saving ? 'Saving…' : 'Save name'}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="mt-2 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-ink transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Not now
        </button>
      </form>
    </Sheet>
  )
}
