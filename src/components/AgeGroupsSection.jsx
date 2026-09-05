import { useEffect, useMemo, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import Chip from './Chip.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { addJuniorPlayup, listPlayerGuestPlayups, removeJuniorPlayup } from '../data/playups.js'

// Super-admin junior play-up on the player sheet. Home is players.team_id;
// guests are active memberships on another junior squad. Ordinary coaches
// never see this block — the RPC is the real gate.

export default function AgeGroupsSection({ player, team, onChanged }) {
  const { memberships, teams } = useMemberships()
  const superAdmin = isSuperAdmin(memberships)
  const homeIsJunior = team?.is_senior !== true && Boolean(player?.team_id)
  const visible = superAdmin && homeIsJunior && !player?.left_at

  const [guestPlayups, setGuestPlayups] = useState([])
  const [reloadToken, setReloadToken] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedId, setPickedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!visible) return undefined
    let mounted = true
    listPlayerGuestPlayups(player.id, player.team_id)
      .then((rows) => {
        if (mounted) setGuestPlayups(rows)
      })
      .catch(() => {
        if (mounted) setGuestPlayups([])
      })
    return () => {
      mounted = false
    }
  }, [visible, player?.id, player?.team_id, reloadToken])

  const guestIds = useMemo(() => guestPlayups.map((row) => row.team_id), [guestPlayups])
  const consentByTeam = useMemo(
    () => new Map(guestPlayups.map((row) => [row.team_id, row.playup_consent])),
    [guestPlayups],
  )
  const teamsById = useMemo(() => new Map((teams ?? []).map((row) => [row.id, row])), [teams])
  const guestTeams = guestIds.map((id) => teamsById.get(id)).filter(Boolean)

  const pickable = useMemo(() => {
    const taken = new Set([player.team_id, ...guestIds])
    return (teams ?? [])
      .filter((row) => row.is_senior !== true && !taken.has(row.id))
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  }, [teams, player.team_id, guestIds])

  if (!visible) return null

  function reload() {
    setReloadToken((n) => n + 1)
    onChanged?.()
  }

  async function confirmAdd() {
    if (!pickedId) return
    setBusy(true)
    setError(null)
    try {
      await addJuniorPlayup(player.id, pickedId)
      setPickerOpen(false)
      setPickedId(null)
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function removeGuest(teamId) {
    setBusy(true)
    setError(null)
    try {
      await removeJuniorPlayup(player.id, teamId)
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const homeName = team?.name ?? 'Home'

  return (
    <section className="mb-4" data-testid="age-groups">
      <h3 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
        Age groups
      </h3>
      <ul className="space-y-2">
        <li className="flex flex-wrap items-center gap-2">
          <Chip>{homeName}</Chip>
          <span className="text-xs font-semibold text-ink-muted">Home</span>
        </li>
        {guestTeams.map((guest) => (
          <li key={guest.id} className="flex flex-wrap items-center gap-2">
            <Chip>{guest.name}</Chip>
            <span className="text-xs font-semibold text-ink-muted">Guest</span>
            {consentByTeam.get(guest.id) === 'pending' && (
              <span className="text-xs font-semibold text-warn-ink">Consent pending</span>
            )}
            <Button
              size="sm"
              variant="dangerQuiet"
              disabled={busy}
              onClick={() => removeGuest(guest.id)}
              aria-label={`Remove from ${guest.name}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">
        Home stays this squad. They appear as a guest on a play-up squad for roster,
        availability, chat and notices. A linked parent must agree before they can be
        picked for a match.
      </p>
      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPickedId(null)
            setError(null)
            setPickerOpen(true)
          }}
        >
          Add to another age group
        </Button>
      </div>
      {error && !pickerOpen && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, 'That change could not be saved.')}
        </p>
      )}

      <Sheet
        open={pickerOpen}
        onClose={() => {
          if (!busy) {
            setPickerOpen(false)
            setPickedId(null)
            setError(null)
          }
        }}
        title="Add to another age group"
      >
        <p className="mb-3 text-sm text-ink-muted">
          They stay on {homeName}. The play-up squad sees them as a guest — roster,
          availability, chat and notices. Match lineup waits on a parent&apos;s yes.
        </p>
        {pickable.length === 0 ? (
          <p className="text-sm text-ink-muted">There is no other junior age group left to add.</p>
        ) : (
          <ul className="mb-4 divide-y divide-line rounded-[11px] border border-line">
            {pickable.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  aria-pressed={pickedId === row.id}
                  className={`block w-full px-4 py-2.5 text-left text-sm font-bold ${
                    pickedId === row.id ? 'bg-surface-sunk text-brand-ink' : 'text-ink hover:bg-surface-mute'
                  }`}
                  onClick={() => setPickedId(row.id)}
                >
                  {row.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm font-semibold text-danger-ink">
            {friendlyMessage(error, 'That change could not be saved.')}
          </p>
        )}
        <Button onClick={confirmAdd} disabled={!pickedId || busy}>
          Add
        </Button>
      </Sheet>
    </section>
  )
}
