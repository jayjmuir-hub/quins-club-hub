import { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import Sheet from './Sheet.jsx'
import { nominateJuniorPlayups, playupSourcePlayers, requestJuniorPlayups } from '../data/playups.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Host Request / home Nominate sheet. The RPCs are the permission gate.
// Invented copy only — no real names.

export default function PlayupRequestSheet({
  open,
  onClose,
  mode,
  hostTeam,
  otherTeams,
  homePlayers,
  onSubmitted,
}) {
  const isRequest = mode === 'request'
  const [pickedTeamId, setPickedTeamId] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setPickedTeamId(null)
      setQuery('')
      setSelected(new Set())
      setNote('')
      setRows([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !isRequest || !pickedTeamId || !hostTeam?.id) return undefined
    let mounted = true
    playupSourcePlayers(pickedTeamId, hostTeam.id)
      .then((data) => {
        if (!mounted) return
        setRows(data ?? [])
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setRows([])
      })
    return () => {
      mounted = false
    }
  }, [open, isRequest, pickedTeamId, hostTeam?.id])

  const nominateRows = useMemo(() => {
    if (isRequest) return []
    return (homePlayers ?? []).map((p) => ({
      player_id: p.id,
      full_name: p.full_name,
      state: 'available',
    }))
  }, [isRequest, homePlayers])

  const list = isRequest ? rows : nominateRows
  const q = query.trim().toLowerCase()
  const visible = q
    ? list.filter((row) => String(row.full_name ?? '').toLowerCase().includes(q))
    : list

  function toggle(playerId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  async function submit() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy(true)
    setError(null)
    try {
      if (isRequest) {
        await requestJuniorPlayups({ playerIds: ids, guestTeamId: hostTeam.id, note })
      } else {
        if (!pickedTeamId) return
        await nominateJuniorPlayups({ playerIds: ids, guestTeamId: pickedTeamId, note })
      }
      onSubmitted?.()
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const title = isRequest ? 'Request play-up' : 'Nominate for play-up'
  const pickLabel = isRequest ? 'Younger age group' : 'Older age group'
  const canSubmit =
    selected.size > 0 && !busy && (isRequest ? Boolean(pickedTeamId) : Boolean(pickedTeamId))

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title={title}>
      <p className="mb-3 text-sm text-ink-muted">
        {isRequest
          ? `Ask for younger juniors to join ${hostTeam?.name ?? 'this squad'}. A super admin still has to agree, and a parent still has to consent before match selection.`
          : `Suggest players from ${hostTeam?.name ?? 'this squad'} for an older junior squad. A super admin still has to agree.`}
      </p>

      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">{pickLabel}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(otherTeams ?? []).map((team) => (
          <Button
            key={team.id}
            type="button"
            size="sm"
            variant={pickedTeamId === team.id ? 'primary' : 'secondary'}
            onClick={() => {
              setPickedTeamId(team.id)
              setSelected(new Set())
            }}
          >
            {team.name}
          </Button>
        ))}
      </div>

      {pickedTeamId && (
        <>
          <label className="mb-2 block">
            <span className="sr-only">Search players</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              className="w-full rounded-[10px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink"
            />
          </label>
          <ul className="mb-3 max-h-56 overflow-y-auto divide-y divide-line rounded-[11px] border border-line">
            {visible.map((row) => {
              const blocked = row.state === 'guest' || row.state === 'requested'
              return (
                <li key={row.player_id} className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    id={`playup-${row.player_id}`}
                    aria-label={row.full_name}
                    disabled={blocked || busy}
                    checked={selected.has(row.player_id)}
                    onChange={() => toggle(row.player_id)}
                  />
                  <label htmlFor={`playup-${row.player_id}`} className="min-w-0 flex-1 text-sm font-bold text-ink">
                    {row.full_name}
                    {row.state === 'requested' && (
                      <span className="ml-2 text-xs font-semibold text-ink-muted">Already requested</span>
                    )}
                    {row.state === 'guest' && (
                      <span className="ml-2 text-xs font-semibold text-ink-muted">Already a guest</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink"
            />
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, 'That could not be sent.')}
        </p>
      )}

      <Button disabled={!canSubmit} onClick={submit}>
        Submit request
      </Button>
    </Sheet>
  )
}