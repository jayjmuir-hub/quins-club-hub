import Card from './Card.jsx'
import { Chip } from './Chip.jsx'
import { formatWdl } from '../lib/matchRecord.js'

const PILL_KEYS = [
  ['league', 'League'],
  ['tournaments', 'Tournaments'],
  ['friendlies', 'Friendlies'],
]

export function SeasonRecordCard({ teamName, record, compact = false }) {
  return (
    <Card data-testid="season-record-card" className={compact ? 'p-3' : 'p-3.5'}>
      {compact ? (
        <p className="text-xs font-bold text-brand-ink">{teamName}</p>
      ) : (
        <>
          <p className="font-condensed text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Season record · {teamName}
          </p>
          <p className="mt-1 text-[15px] font-extrabold text-ink">All matches</p>
          <p className="text-xs text-ink-muted">league · tournaments · friendlies</p>
        </>
      )}
      <p
        data-testid="season-record-wdl"
        className={`font-extrabold tabular-nums text-ink ${compact ? 'mt-1 text-[20px]' : 'mt-1.5 text-[28px] leading-none'}`}
      >
        {formatWdl(record)}
      </p>
      <p className="mt-1 text-xs italic text-ink-faint">from scores on Hub · {record.season}</p>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PILL_KEYS.map(([key, label]) => (
            <span key={key} data-testid={`season-record-pill-${key}`}>
              <Chip>
                {label} {formatWdl(record[key])}
              </Chip>
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

export function SeasonRecordBand({ rows, layout = 'stack' }) {
  if (!rows?.length) return null
  const compact = layout === 'row'
  return (
    <div data-testid="season-record-band">
      <div className={compact ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'flex flex-col gap-2.5'}>
        {rows.map(({ team, record }) => (
          <SeasonRecordCard
            key={team.id}
            teamName={team.name}
            record={record}
            compact={compact}
          />
        ))}
      </div>
    </div>
  )
}
