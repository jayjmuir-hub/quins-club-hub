//
// One table for the squad page, the Seniors overview and (as a single row) the
// player sheet, so the three cannot drift. Rows are senior_season_stats rows.
//
// ⚠️ "BENCH", NEVER "SUB APPEARANCES". The sheet records who was selected on
// the bench, not who came on; the heading must not claim more than it knows.
import { useMemo, useState } from 'react'

const COLUMNS = [
  { key: 'games', short: 'Games', label: 'Games' },
  { key: 'starts', short: 'Starts', label: 'Starts' },
  { key: 'bench', short: 'Bench', label: 'Bench' },
  { key: 'tries', short: 'T', label: 'Tries' },
  { key: 'conversions', short: 'C', label: 'Conversions' },
  { key: 'penalties', short: 'P', label: 'Penalties' },
  { key: 'drops', short: 'DG', label: 'Drop goals' },
  { key: 'yellows', short: 'YC', label: 'Yellow cards' },
  { key: 'reds', short: 'RC', label: 'Red cards' },
]

export function sortStats(rows, key) {
  const copy = [...rows]
  if (key === 'full_name') return copy.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  return copy.sort(
    (a, b) =>
      (b[key] ?? 0) - (a[key] ?? 0) ||
      (b.games ?? 0) - (a.games ?? 0) ||
      (b.tries ?? 0) - (a.tries ?? 0) ||
      (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  )
}

export default function SeasonStatsTable({ rows, limit, testId = 'season-stats-table' }) {
  const [sortKey, setSortKey] = useState('games')
  const sorted = useMemo(() => sortStats(rows ?? [], sortKey), [rows, sortKey])
  const shown = typeof limit === 'number' ? sorted.slice(0, limit) : sorted

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-ink-faint">No games on a sheet yet.</p>
  }

  const TH = 'px-1.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[.6px] text-ink-muted'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] tabular-nums" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} text-left`} aria-sort={sortKey === 'full_name' ? 'ascending' : 'none'}>
              <button type="button" onClick={() => setSortKey('full_name')} aria-label="Player" className="underline-offset-2 hover:underline">
                Player
              </button>
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} scope="col" className={`${TH} text-right`} aria-sort={sortKey === col.key ? 'descending' : 'none'} aria-label={col.label}>
                <button
                  type="button"
                  onClick={() => setSortKey(col.key)}
                  aria-label={col.label}
                  title={col.label}
                  className="underline-offset-2 hover:underline"
                >
                  {col.short}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={row.player_id ?? `name:${row.full_name}:${index}`} data-testid="season-stats-row" className="border-t border-line">
              <td className="px-1.5 py-1.5 text-left font-semibold text-ink">{row.full_name}</td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="px-1.5 py-1.5 text-right text-ink">
                  {row[col.key] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
