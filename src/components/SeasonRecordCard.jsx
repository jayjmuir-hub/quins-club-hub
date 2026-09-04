import { StatBand, StatTile } from './StatBand.jsx'
import { formatWdl } from '../lib/matchRecord.js'

export function SeasonRecordCard({ teamName, record, compact: _compact = false }) {
  return (
    <div data-testid="season-record-card">
      <p className="mb-1 font-condensed text-[9px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {teamName}
      </p>
      <StatBand>
        <StatTile testId="stat-won" value={record.wins} label="Won" />
        <StatTile testId="stat-drawn" value={record.draws} label="Drawn" />
        <StatTile testId="stat-lost" value={record.losses} label="Lost" />
      </StatBand>
      <p data-testid="season-record-wdl" className="sr-only">
        {formatWdl(record)}
      </p>
      <p className="sr-only">from scores on Hub · {record.season}</p>
    </div>
  )
}

export function SeasonRecordBand({ rows, layout: _layout = 'stack' }) {
  if (!rows?.length) return null
  return (
    <div data-testid="season-record-band">
      <div className="flex flex-col gap-1">
        {rows.map(({ team, record }) => (
          <SeasonRecordCard
            key={team.id}
            teamName={team.name}
            record={record}
          />
        ))}
      </div>
    </div>
  )
}
