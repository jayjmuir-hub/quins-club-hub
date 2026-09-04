import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import { getClubSettings, setCallupMinAge } from '../data/callups.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The senior call-up floor — club_settings.senior_callup_min_age, default 17
// (Jay, 2 Sep 2026: "the age floor is 17"). Measured TODAY, not at a cut-off.
// Checked inside callup_candidates and request_callup, so this number is a
// setting the database enforces, never a screen-side filter.

export default function CallupAgeSetting({ clubId }) {
  const [age, setAge] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!clubId) return undefined
    let mounted = true
    getClubSettings(clubId)
      .then((s) => mounted && setAge(String(s.senior_callup_min_age)))
      .catch(() => mounted && setAge('17'))
    return () => {
      mounted = false
    }
  }, [clubId])

  if (!clubId || age == null) return null

  async function save(next) {
    setAge(next)
    setSaving(true)
    setError(null)
    try {
      await setCallupMinAge(clubId, next)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-[14px]" data-testid="callup-age-setting">
      <div>
        <p className="text-[13px] font-bold text-ink">Senior call-ups: minimum age</p>
        <p className="text-xs text-ink-faint">A U18 player must be this old today before a senior squad can ask for them.</p>
        {error && <p role="alert" className="mt-1 text-xs font-semibold text-danger-ink">{friendlyMessage(error, "We couldn't save that.")}</p>}
      </div>
      <select
        aria-label="Senior call-up minimum age"
        value={age}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand"
      >
        {[16, 17, 18].map((n) => (
          <option key={n} value={String(n)}>{n}</option>
        ))}
      </select>
    </Card>
  )
}
