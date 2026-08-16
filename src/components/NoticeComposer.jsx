import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import { Sheet } from './Sheet.jsx'
import { createNotice } from '../data/announcements.js'

// The "post a notice" composer, as a sheet.
//
// ⚠️ EXTRACTED FROM src/screens/Notices.jsx ON 16 Aug 2026 BECAUSE POSTING IS NO
// LONGER A PLACE YOU GO. Jay: *"need the ability to post the comm from the more
// screen, not a seperate screen"*, and then on Home as well. A coach standing at
// a pitch should not have to find the noticeboard, load it, and then find a
// button — the composer opens where they already are.
//
// It is now mounted from three screens (Notices, More, Home). That is exactly
// the condition this codebase treats as "extract it": one behaviour in three
// places is three copies that drift, and this one owns a scope picker, an expiry
// rule and a write.
//
// ⚠️ THE CALLER DECIDES WHO MAY SEE THE BUTTON, NOT THIS FILE. `canPostNotice`
// and `postableTeams` in src/lib/notices.js answer that, and RLS is the actual
// boundary — "announcement create" in the migration. This component assumes it
// was only rendered for somebody allowed to post, and still surfaces the
// database's refusal if that assumption is ever wrong.

// ⚠️ RELATIVE DURATIONS, NOT A DATE PICKER, AND THAT IS A TIMEZONE DECISION.
// RESTORE.md: every time in this app is Abu Dhabi time, and a naive
// `new Date(\`${d}T${t}\`)` resolves in the BROWSER's zone — so a date input
// would need Dubai-anchored interpretation, and a committee member setting
// "expires 20 Aug" from London would get a notice that vanished at 8pm on the
// 19th. A duration has no such ambiguity: it is measured from now, which is the
// same instant everywhere. It is also what people actually mean — "leave this up
// for a week", not "delete this at midnight on a specific date".
const EXPIRY_CHOICES = [
  { key: 'none', label: 'Until I remove it', days: null },
  { key: 'week', label: 'A week', days: 7 },
  { key: 'fortnight', label: 'Two weeks', days: 14 },
  { key: 'month', label: 'A month', days: 30 },
]

function expiryFromChoice(key) {
  const choice = EXPIRY_CHOICES.find((c) => c.key === key)
  if (!choice?.days) return null
  return new Date(Date.now() + choice.days * 24 * 60 * 60 * 1000).toISOString()
}

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'

/* ══════════════════════════════════════════════════════════════════════════
   The composer
   ══════════════════════════════════════════════════════════════════════════ */

export default function NoticeComposer({ open, onClose, teams, clubWide, onPosted }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  // ⚠️ THE DEFAULT SCOPE IS THE NARROWEST ONE AVAILABLE. An admin who holds
  // club-wide could have this default to "Whole club", and the cost of a
  // mis-tap there is every family in the club. A coach's only option is their
  // squad anyway, so defaulting to teams[0] is right for both and safe for one.
  const [scope, setScope] = useState(() => teams[0]?.id ?? (clubWide ? '' : ''))
  const [pinned, setPinned] = useState(false)
  const [expiry, setExpiry] = useState('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const clubWideChosen = scope === ''
  const recipientsHint = clubWideChosen
    ? 'Everyone in the club will see this.'
    : 'Everyone attached to that squad will see this.'

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createNotice({
        title,
        body,
        teamId: clubWideChosen ? null : scope,
        pinned,
        expiresAt: expiryFromChoice(expiry),
      })
      setTitle('')
      setBody('')
      setPinned(false)
      setExpiry('none')
      onPosted()
      onClose()
    } catch (err) {
      setError(err.message || 'That notice could not be posted. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Post a notice">
      <form onSubmit={handleSubmit}>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
          >
            {error}
          </p>
        )}

        <label className={LABEL} htmlFor="notice-scope">
          Who sees it
        </label>
        <select
          id="notice-scope"
          className={FIELD}
          value={scope}
          disabled={saving}
          onChange={(event) => setScope(event.target.value)}
        >
          {/* ⚠️ CLUB-WIDE IS LAST, NOT FIRST. A select opens on its current
              value, but a person scanning the list should meet their squads
              before the option that reaches every family in the club. */}
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
          {clubWide && <option value="">Whole club</option>}
        </select>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted" data-testid="scope-hint">
          {recipientsHint}
        </p>

        <div className="mt-3.5">
          <label className={LABEL} htmlFor="notice-title">
            Title
          </label>
          <input
            id="notice-title"
            type="text"
            className={FIELD}
            value={title}
            disabled={saving}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="mt-3.5">
          <label className={LABEL} htmlFor="notice-body">
            Notice
          </label>
          <textarea
            id="notice-body"
            rows={5}
            className={FIELD}
            value={body}
            disabled={saving}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        <div className="mt-3.5">
          <label className={LABEL} htmlFor="notice-expiry">
            Keep it up for
          </label>
          <select
            id="notice-expiry"
            className={FIELD}
            value={expiry}
            disabled={saving}
            onChange={(event) => setExpiry(event.target.value)}
          >
            {EXPIRY_CHOICES.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        <label className="mt-3.5 flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={pinned}
            disabled={saving}
            onChange={(event) => setPinned(event.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Pin it to the home screen
        </label>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>
            {saving ? 'Posting…' : 'Post'}
          </Button>
          {!saving && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
