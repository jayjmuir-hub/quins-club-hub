import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { eventTimeLabel } from '../lib/eventFormat.js'

// "Also selected for U18B v Exiles, 11:00" — the same-day clash note,
// claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep 2026. Shown on
// a fixture to everyone attached to its squad; read from public.event_clashes,
// which joins lineups to lineups on the same club day and stores nothing.
//
// Renders null when there is nothing to say or the database refuses, so the
// detail sheet never carries an error box for a note.

export async function listEventClashes(eventId) {
  const { data, error } = await supabase.rpc('event_clashes', { _event: eventId })
  if (error) throw error
  return data ?? []
}

export default function ClashNote({ eventId }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!eventId) return undefined
    let mounted = true
    listEventClashes(eventId)
      .then((data) => mounted && setRows(data))
      .catch(() => mounted && setRows([]))
    return () => {
      mounted = false
    }
  }, [eventId])

  if (rows.length === 0) return null

  return (
    <div data-testid="clash-note" className="rounded-[11px] bg-warn-bg px-3 py-2 text-[12.5px] text-ink">
      <p className="font-bold">Also selected the same day</p>
      <ul>
        {rows.map((row) => (
          <li key={`${row.player_id}-${row.other_event_id}`}>
            {row.full_name} — {row.other_team} {row.other_title}
            {row.other_time_tbd ? ', time TBC' : `, ${eventTimeLabel({ starts_at: row.other_starts_at, time_tbd: false })}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
