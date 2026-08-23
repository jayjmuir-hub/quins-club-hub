import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import { PLAN_LIMITS, formatBytes, storageUsage } from '../data/storage.js'

// The measured answer to "won't we run out of storage?" (Jay, 23 Aug 2026).
// Renders nothing until it has data, and nothing at all on failure — it is a
// readout, not a feature, and a broken readout should not cost the Club tab
// an error banner.
export default function StorageCard() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let mounted = true
    storageUsage()
      .then((r) => { if (mounted) setRows(r) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  if (!rows || rows.length === 0) return null
  const db = rows.find((r) => r.kind === 'database')
  const buckets = rows.filter((r) => r.kind === 'bucket')
  const files = buckets.reduce((sum, b) => sum + Number(b.bytes ?? 0), 0)
  const pct = (used, limit) => `${Math.max(0.1, (100 * used) / limit).toFixed(1)}%`

  return (
    <Card className="mt-3.5 p-3.5" data-testid="storage-card">
      <h3 className="text-[15px] font-bold text-ink">Storage</h3>
      <p className="mt-1 text-[12.5px] text-ink-muted">
        Measured now. The allowances are the Supabase Pro plan's.
      </p>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="font-semibold text-ink">Database</dt>
        <dd data-testid="storage-database">
          {formatBytes(Number(db?.bytes))} of {formatBytes(PLAN_LIMITS.database)} ({pct(Number(db?.bytes ?? 0), PLAN_LIMITS.database)})
        </dd>
        <dt className="font-semibold text-ink">Files</dt>
        <dd data-testid="storage-files">
          {formatBytes(files)} of {formatBytes(PLAN_LIMITS.files)} ({pct(files, PLAN_LIMITS.files)})
        </dd>
        {buckets.map((b) => (
          <div key={b.label} className="contents text-ink-muted">
            <dt className="pl-3">{b.label}</dt>
            <dd>{formatBytes(Number(b.bytes))} · {b.objects} file{Number(b.objects) === 1 ? '' : 's'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
