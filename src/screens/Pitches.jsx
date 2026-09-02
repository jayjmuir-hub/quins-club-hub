import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Button from '../components/Button.jsx'
import Spinner from '../components/Spinner.jsx'
import { listPitches, upsertPitch, setPitchActive } from '../data/pitches.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The pitch setup screen — Jay picked "blocks as columns" (option 2) from six
// laid out at browser width on 11 Aug 2026.
//
// ⚠️ SETUP IS A RARE JOB AND THAT SHAPED THE SCREEN. Fifteen pitches are
// created once and touched perhaps twice a season, so this is optimised for
// ANSWERING A QUESTION — what have we got, what is out of action — rather than
// for fast repeated editing. All fifteen fit above the fold at browser width;
// on a phone the blocks stack.
//
// ⚠️ IT IS NOT THE ALLOCATION SCREEN. Allocating a pitch to a fixture is the
// weekly job and gets its own grid (option C), which is not built yet. Do not
// grow this screen into that one: the reason they are separate is that a rare
// destructive action (retire) should not live on the screen used every week.

/**
 * The block a pitch belongs to — the letters before the first digit.
 *
 * ⚠️ THERE IS NO `block` COLUMN, AND THIS IS DERIVED ON PURPOSE. The club
 * names its pitches A1-A4, B1, C1-C5, D1-D5, so the block is already in the
 * name and a second column would be a second place for it to be wrong. The
 * cost is that a name with no leading letters has no block, which is why
 * `OTHER_BLOCK` exists rather than the function returning something empty and
 * the grouping silently dropping the pitch.
 */
export const OTHER_BLOCK = 'Other'

export function blockOf(name) {
  const letters = String(name ?? '').trim().match(/^([A-Za-z]+)\s*\d/)
  return letters ? letters[1].toUpperCase() : OTHER_BLOCK
}

/** Groups pitches into blocks, in the order the pitches already come in. */
export function groupByBlock(pitches) {
  const blocks = new Map()
  for (const pitch of pitches ?? []) {
    const block = blockOf(pitch.name)
    if (!blocks.has(block)) blocks.set(block, [])
    blocks.get(block).push(pitch)
  }
  // ⚠️ `Other` LAST, ALWAYS. It is the bucket for names that do not fit the
  // scheme, and a bucket sorting into the middle of A/B/C/D reads as a block
  // the club does not have.
  return [...blocks.entries()]
    .sort(([a], [b]) => (a === OTHER_BLOCK ? 1 : b === OTHER_BLOCK ? -1 : a.localeCompare(b)))
    .map(([block, list]) => ({ block, pitches: list }))
}

const CHIP =
  'rounded-[8px] border-[1.5px] px-3 py-1.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

function PitchChip({ pitch, onSelect, busy }) {
  const retired = !pitch.is_active
  return (
    <button
      type="button"
      data-testid="pitch-chip"
      disabled={busy}
      onClick={() => onSelect(pitch)}
      aria-label={retired ? `${pitch.name}, retired` : pitch.name}
      className={[
        CHIP,
        retired
          ? 'border-dashed border-line text-ink-faint'
          : 'border-line text-ink hover:border-brand hover:text-brand-ink',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      {pitch.name}
    </button>
  )
}

export default function Pitches() {
  const { memberships } = useMemberships()
  const [pitches, setPitches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // The pitch being renamed or retired. null = nothing open.
  const [editing, setEditing] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [adding, setAdding] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // ⚠️ RETIRED PITCHES ARE INCLUDED HERE AND NOWHERE ELSE. This is the only
  // screen that has to show one, because it is the only screen from which a
  // pitch can be brought back.
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    listPitches({ includeRetired: true })
      .then((rows) => {
        if (mounted) setPitches(rows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPitches([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [reloadToken])

  const blocks = useMemo(() => groupByBlock(pitches), [pitches])
  const refresh = useCallback(() => setReloadToken((token) => token + 1), [])

  function open(pitch) {
    setEditing(pitch)
    setDraftName(pitch.name)
    setAdding(null)
    setSaveError(null)
  }

  function openAdd(block) {
    setAdding(block)
    setEditing(null)
    setDraftName('')
    setSaveError(null)
  }

  async function run(work) {
    setSaving(true)
    setSaveError(null)
    try {
      await work()
      setEditing(null)
      setAdding(null)
      setDraftName('')
      refresh()
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  const canManage = hasAdminRight(memberships, 'pitches')

  // ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA. Every admin can already write
  // `pitches` — the RLS policy is `is_admin`, deliberately, because these
  // rights decide which dashboard somebody is SHOWN rather than what they may
  // do. See claude/decisions/2026-08-10-role-dashboards.md. So this is a
  // "you were not given this job" message, not a security boundary.
  if (!canManage) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Pitches</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Pitch Management hasn&apos;t been added to your account. A super admin can add
          it on the Accounts screen.
        </p>
      </Card>
    )
  }

  if (loading && pitches.length === 0) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the pitches</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          {friendlyMessage(error, 'Something went wrong. Try again.')}
        </p>
        <Button onClick={refresh} className="mx-auto mt-4">
          Try again
        </Button>
      </Card>
    )
  }

  const retiredCount = pitches.filter((pitch) => !pitch.is_active).length

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">Pitches</h2>
          <p className="text-[13px] font-medium text-ink-muted">
            {pitches.length} {pitches.length === 1 ? 'pitch' : 'pitches'}
            {retiredCount > 0 ? ` · ${retiredCount} retired` : ''} · tap one to rename or retire
          </p>
        </div>
      </div>

      {pitches.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-ink-faint">No pitches yet.</p>
          <Button onClick={() => openAdd(null)} className="mx-auto mt-4">
            Add a pitch
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3.5 desktop:grid-cols-2 wide:grid-cols-4">
          {blocks.map(({ block, pitches: inBlock }) => {
            const out = inBlock.filter((pitch) => !pitch.is_active).length
            return (
              <Card key={block} data-testid="pitch-block" className="p-3.5">
                <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
                  {block === OTHER_BLOCK ? 'Other' : `${block} block`}
                </h3>
                <p className="mb-2.5 text-[11.5px] text-ink-faint">
                  {inBlock.length} {inBlock.length === 1 ? 'pitch' : 'pitches'}
                  {out > 0 ? ` · ${out} retired` : ''}
                </p>
                <div className="flex flex-wrap gap-[7px]">
                  {inBlock.map((pitch) => (
                    <PitchChip key={pitch.id} pitch={pitch} onSelect={open} busy={saving} />
                  ))}
                  <button
                    type="button"
                    aria-label={`Add a pitch to ${block === OTHER_BLOCK ? 'the club' : `${block} block`}`}
                    disabled={saving}
                    onClick={() => openAdd(block === OTHER_BLOCK ? '' : block)}
                    className={`${CHIP} border-dashed border-line text-ink-muted hover:border-brand hover:text-brand-ink`}
                  >
                    +
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {(editing || adding !== null) && (
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            {editing ? `Edit ${editing.name}` : 'Add a pitch'}
          </h3>

          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Name
              </span>
              <input
                type="text"
                aria-label="Pitch name"
                value={draftName}
                disabled={saving}
                autoFocus
                onChange={(domEvent) => setDraftName(domEvent.target.value)}
                placeholder={adding ? `${adding}5` : ''}
                className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
              />
            </label>

            <Button
              disabled={saving || !draftName.trim()}
              onClick={() =>
                run(() =>
                  editing
                    ? upsertPitch({ id: editing.id, name: draftName.trim() })
                    : upsertPitch({
                        club_id: pitches[0]?.club_id,
                        name: draftName.trim(),
                        sort_order: 999,
                      }),
                )
              }
            >
              {saving ? 'Saving…' : editing ? 'Save name' : 'Add pitch'}
            </Button>

            {editing && (
              <Button
                variant={editing.is_active ? 'dangerQuiet' : 'secondary'}
                disabled={saving}
                onClick={() => run(() => setPitchActive(editing.id, !editing.is_active))}
              >
                {editing.is_active ? 'Retire' : 'Bring back'}
              </Button>
            )}

            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setEditing(null)
                setAdding(null)
                setSaveError(null)
              }}
            >
              Cancel
            </Button>
          </div>

          {/* ⚠️ SAID OUT LOUD, EVERY TIME, because it is the one thing about
              this screen that surprises people. `events.pitch` is TEXT with no
              foreign key, so a rename does not touch the fixtures that already
              name the pitch — they keep rendering the old string and stop
              matching for clash detection. Retiring and adding is usually what
              somebody actually means. */}
          {editing && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              Renaming does not change fixtures that already say{' '}
              <strong className="font-bold text-ink">{editing.name}</strong>. They keep the old
              name. If the pitch is going out of use, retire it instead — that leaves those
              fixtures alone and takes it out of the picker.
            </p>
          )}

          {saveError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
              {friendlyMessage(saveError, "That didn't save. Try again.")}
            </p>
          )}
        </Card>
      )}
    </section>
  )
}
