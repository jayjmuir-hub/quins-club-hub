import { useState } from 'react'
import Button from './Button.jsx'
import { Sheet } from './Sheet.jsx'
import { createNotice } from '../data/announcements.js'
import { friendlyMessage } from '../lib/friendlyError.js'

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
  //
  // ⚠️ A SET OF SQUAD IDS SINCE 21 Aug 2026, AND `wholeClub` IS A SEPARATE FLAG
  // RATHER THAN A MEMBER OF IT. Jay: "select whole club and the other options
  // grey out so we don't send redundant notices". Modelling club-wide as one
  // more checkbox would make "whole club AND U12" expressible, which is the
  // redundant notice he is asking us to prevent — so it cannot be a member of
  // the same set as the squads.
  const [picked, setPicked] = useState(() => new Set(teams[0] ? [teams[0].id] : []))
  const [wholeClub, setWholeClub] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [expiry, setExpiry] = useState('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const chosenTeams = teams.filter((team) => picked.has(team.id))
  // ⚠️ NOTHING CHOSEN IS NOT THE SAME AS THE WHOLE CLUB. An empty set must
  // block the post, not quietly widen it to every family in the club — the
  // failure this component is most able to cause.
  const nothingChosen = !wholeClub && chosenTeams.length === 0

  const recipientsHint = wholeClub
    ? 'Everyone in the club will see this, once.'
    : nothingChosen
      ? 'Choose at least one age group.'
      : chosenTeams.length === 1
        ? `Everyone attached to ${chosenTeams[0].name} will see this.`
        : `${chosenTeams.length} age groups will see this. Anyone in more than one of ` +
          'them is notified once, not twice.'

  function toggleTeam(id) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    // ⚠️ CHECKED HERE AS WELL AS ON THE BUTTON. A disabled button is a hint;
    // a form can still be submitted by Enter in a text field.
    if (nothingChosen) {
      setError('Choose at least one age group, or the whole club.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createNotice({
        title,
        body,
        teamIds: wholeClub ? [] : [...picked],
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
      setError(friendlyMessage(err, 'That notice could not be posted. Try again.'))
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
            className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
          >
            {error}
          </p>
        )}

        {/* ⚠️ A FIELDSET WITH A LEGEND, NOT A LABELLED DIV. Every helper in
            tests/ finds this group by its legend rather than by a squad name,
            because the three files that drive this component name their squads
            differently — the lesson 55 broken tests taught on 20 Aug 2026. */}
        <fieldset className="mb-1.5 border-0 p-0" disabled={saving}>
          <legend className={LABEL}>Who sees it</legend>

          {/* ⚠️ CLUB-WIDE IS LAST, NOT FIRST — a person scanning should meet
              their own squads before the option that reaches every family. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {teams.map((team) => (
              <label
                key={team.id}
                className={`flex items-center gap-2 text-[15px] ${
                  wholeClub ? 'cursor-not-allowed opacity-45' : 'cursor-pointer text-ink'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={!wholeClub && picked.has(team.id)}
                  /* ⚠️ DISABLED, NOT UNCHECKED, WHILE CLUB-WIDE IS ON. The
                     squad ticks are kept in state so that turning club-wide
                     back off restores what they had chosen rather than
                     silently emptying it. */
                  disabled={wholeClub}
                  onChange={() => toggleTeam(team.id)}
                />
                <span>{team.name}</span>
              </label>
            ))}
          </div>

          {clubWide && (
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 border-t border-line pt-2.5 text-[15px] font-bold text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={wholeClub}
                onChange={(event) => setWholeClub(event.target.checked)}
              />
              <span>Whole club</span>
            </label>
          )}
        </fieldset>
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

        {!saving && (nothingChosen || !title.trim() || !body.trim()) && (
          <p className="mt-3 text-[12.5px] text-ink-muted" data-testid="post-hint">
            {nothingChosen ? 'Pick who this is for to post it.' : !title.trim() ? 'Add a title to post it.' : 'Add the notice itself to post it.'}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={saving || nothingChosen || !title.trim() || !body.trim()}>
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
