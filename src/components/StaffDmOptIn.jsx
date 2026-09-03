import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setStaffDmOptIn } from '../data/messages.js'
import { ageBandFromTeamName } from '../lib/ageGroup.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// A guardian's consent for a U16+ player to be messaged directly by their
// squad's coach or manager. Squad chat phase 3, and the line Jay drew on
// 23 Aug 2026: "an opt in that would allow coaches/managers to dm players in
// U16 and above".
//
// ⚠️ SHOWN ONLY TO A GUARDIAN, ONLY FOR A U16+ SQUAD. The player sees
// nothing here: the trigger refuses their write anyway, and a switch that
// errors on tap is worse than no switch. The age band is the SQUAD's
// (ageBandFromTeamName — the client twin of private.team_age_band), so a
// playing-up U15 in the U16s is offered the switch: the guardian decides.
//
// ⚠️ OFF BY DEFAULT, RECORDED WHO AND WHEN, and a guardian can read the
// resulting threads — the DM screen lets a participant's guardian in by the
// can_dm rule (guardian ↔ minor is always allowed), so "read-only from the
// player's card" is simply the DM inbox.

export default function StaffDmOptIn({ player, teamName, isGuardian }) {
  const band = ageBandFromTeamName(teamName)
  const eligible = isGuardian && band !== null && band >= 16
  const [state, setState] = useState(null) // { optIn, by, at } | null = loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!eligible || !player?.id) return
    let mounted = true
    supabase
      .from('player_private')
      .select('staff_dm_opt_in, staff_dm_opt_in_at')
      .eq('player_id', player.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!mounted) return
        if (err) setError(friendlyMessage(err, "We couldn't load this setting."))
        setState({ optIn: Boolean(data?.staff_dm_opt_in), at: data?.staff_dm_opt_in_at ?? null })
      })
    return () => {
      mounted = false
    }
  }, [eligible, player?.id])

  if (!eligible) return null

  async function toggle() {
    if (!state || busy) return
    setBusy(true)
    setError(null)
    try {
      await setStaffDmOptIn(player.id, !state.optIn)
      setState({ optIn: !state.optIn, at: new Date().toISOString() })
    } catch (err) {
      setError(friendlyMessage(err, 'Could not change that.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[11px] border border-line bg-surface-mute/60 px-3.5 py-3" data-testid="staff-dm-opt-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-extrabold text-ink">Coach and manager messages</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
            {teamName} staff can message {player.full_name?.split(' ')[0] ?? 'your player'} directly in the app. You can read those
            conversations. Off by default.
          </p>
          {state?.optIn && state.at && (
            <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">
              Turned on {new Date(state.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(state?.optIn)}
          aria-label="Allow coach and manager messages"
          disabled={!state || busy}
          onClick={toggle}
          className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition ${
            state?.optIn ? 'bg-accent-ink' : 'bg-line-strong'
          } disabled:opacity-50`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-[3px] h-[20px] w-[20px] rounded-full bg-white transition ${
              state?.optIn ? 'left-[23px]' : 'left-[3px]'
            }`}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}
