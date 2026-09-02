import { useId, useMemo, useState } from 'react'
import Spinner from './Spinner.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// A searchable player picker, single- or multi-select.
//
// It exists because of one number: the club has ~315 players. A bare <select>
// of 315 options is unusable on a phone and barely usable on a desktop, and
// the only way an admin can find a parent's child is by typing part of a name
// — there is no link from a profile to a player anywhere in the schema except
// memberships.player_id, which is the very thing being created here.
//
// Deliberate behaviours, each of which is easy to "simplify" into a bug:
//
//   - Selection is held by the CALLER (selectedIds), not here, and a selected
//     player stays selected when the search text stops matching them. Picking
//     two children in different age groups means two different searches; a
//     picker that dropped the first selection when the query changed would
//     make that impossible.
//   - The selected players are listed separately, above the results, so what
//     has been chosen is visible even when the current query matches none of
//     them.
//   - Results are capped (MAX_RESULTS) with an honest "keep typing" line
//     rather than rendering all 315 rows. The cap is on what is DRAWN, never
//     on what can be selected.
//   - The team name is shown beside each player because that is what the
//     access row's age group is derived from — an admin picking "Omar Ali"
//     needs to see which squad they are thereby granting.

const MAX_RESULTS = 25

function matches(player, query) {
  if (!query) return true
  return (player.full_name ?? '').toLowerCase().includes(query)
}

export default function PlayerPicker({
  label,
  players = [],
  teamsById,
  multiple = false,
  selectedIds = [],
  onChange,
  loading = false,
  error = null,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const groupId = useId()

  const selected = useMemo(
    () => selectedIds.map((id) => players.find((player) => player.id === id)).filter(Boolean),
    [selectedIds, players],
  )

  const trimmed = query.trim().toLowerCase()
  const filtered = useMemo(
    () => players.filter((player) => matches(player, trimmed)),
    [players, trimmed],
  )
  const shown = filtered.slice(0, MAX_RESULTS)

  function toggle(playerId) {
    if (!multiple) {
      onChange([playerId])
      return
    }
    onChange(
      selectedIds.includes(playerId)
        ? selectedIds.filter((id) => id !== playerId)
        : [...selectedIds, playerId],
    )
  }

  function teamName(player) {
    if (!player?.team_id) return 'No age group'
    return teamsById?.get(player.team_id)?.name ?? 'Unknown age group'
  }

  return (
    <div
      role="group"
      aria-labelledby={groupId}
      data-testid="player-picker"
      className="min-w-0 flex-1 basis-full rounded-[11px] border border-line bg-surface-card p-2.5"
    >
      <span id={groupId} className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
        {label}
      </span>

      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" data-testid="player-picker-selected">
          {selected.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(player.id)}
                aria-label={`Remove ${player.full_name}`}
                className="inline-flex items-center gap-1 rounded-[20px] bg-surface-mute px-2.5 py-1 text-[12px] font-bold text-ink transition hover:bg-line disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {player.full_name}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="search"
        aria-label={`Search players for ${label}`}
        placeholder="Search by name"
        value={query}
        disabled={disabled || loading}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-[8px] border border-line bg-surface-card px-2.5 py-1.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand disabled:opacity-60"
      />

      {loading && (
        <div className="mt-2">
          <Spinner label="Loading players…" />
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
          {friendlyMessage(error, "We couldn't load the player list.")}
        </p>
      )}

      {!loading && !error && (
        <>
          {shown.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-ink-muted">
              {players.length === 0
                ? 'No players on the roster yet.'
                : 'No players match that name.'}
            </p>
          ) : (
            <ul className="mt-1.5 max-h-48 overflow-y-auto">
              {shown.map((player) => (
                <li key={player.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1.5 py-1 text-[13.5px] text-ink hover:bg-surface-mute">
                    <input
                      type={multiple ? 'checkbox' : 'radio'}
                      name={multiple ? undefined : `${groupId}-player`}
                      checked={selectedIds.includes(player.id)}
                      disabled={disabled}
                      onChange={() => toggle(player.id)}
                    />
                    <span className="font-semibold">{player.full_name}</span>
                    <span className="text-[12px] text-ink-muted">{teamName(player)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {filtered.length > shown.length && (
            <p className="mt-1 text-[12px] text-ink-muted">
              Showing {shown.length} of {filtered.length} — keep typing to narrow it down.
            </p>
          )}
        </>
      )}
    </div>
  )
}
