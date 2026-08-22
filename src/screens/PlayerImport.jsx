import { useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { insertPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { parsePlayerPaste, toInsertRows } from '../lib/playerImport.js'
import { genderLabel } from '../lib/gender.js'

// Bulk player import (desktop-spec.md §5.1). The reason this exists: the club
// has 15 squads and the app has no players in it, because entering them one
// form at a time on a phone is a day's work.
//
// The shape is paste → preview → confirm, and the preview is not decoration.
// Input here is a paste out of Excel, so malformed rows are the normal case;
// showing the user exactly what will be created, with per-row reasons for
// anything that won't, is what makes an all-or-nothing insert acceptable.
// See src/lib/playerImport.js for the parser and why the insert is
// all-or-nothing (src/data/players.js insertPlayers).

const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'
const CELL = 'border-t border-line px-2.5 py-1.5 text-[13px] align-top'

// Four columns, and the second line deliberately shows the "M"/"F" shorthand
// rather than spelling both out — a placeholder that only ever showed the
// long form would suggest the short one is not accepted.
const EXAMPLE = 'Tom Fletcher\tFlanker\tU10\tM\nAmy Rose\tWing\tU12\tF'

export default function PlayerImport({ onClose, onImported }) {
  const { memberships, teams } = useMemberships()
  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const clubId = memberships.find((m) => m.club_id)?.club_id ?? null

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)
  // The picker's squad — the fallback for lines that name none, which makes
  // a plain list of names a valid import (22 Aug 2026 rethink). '' = no
  // fallback, every line must name its own squad.
  const [defaultTeamId, setDefaultTeamId] = useState('')
  // Guards the double-click case the same way PlayerForm does: state updates
  // are async, so a ref is what actually stops a second submit landing.
  const inFlight = useRef(false)

  // Only squads the user can WRITE belong in the picker — offering U18B to a
  // U12 coach would parse 40 rows green and refuse them all at insert.
  const editableTeams = useMemo(
    () => scopedTeams.filter((team) => canEditTeam(memberships, team.id)),
    [scopedTeams, memberships],
  )

  const parsed = useMemo(
    () => parsePlayerPaste(text, {
      teams: scopedTeams,
      canEditTeam: (teamId) => canEditTeam(memberships, teamId),
      defaultTeamId: defaultTeamId || null,
    }),
    [text, scopedTeams, memberships, defaultTeamId],
  )

  const hasInput = text.trim() !== ''
  const canSubmit = parsed.validCount > 0 && !saving

  async function handleImport() {
    if (inFlight.current || parsed.validCount === 0) return
    inFlight.current = true
    setSaving(true)
    setFailure(null)

    try {
      const rows = toInsertRows(parsed, { clubId })
      await insertPlayers(rows)
      onImported?.(rows.length)
      onClose()
    } catch (err) {
      setFailure(err?.message || "We couldn't add those players.")
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Import players">
      {scopedTeams.length === 0 ? (
        <p role="alert" className="rounded-[11px] bg-warn-bg px-4 py-3 text-sm text-ink">
          You don&apos;t have a squad you can add players to. Ask a club admin if that looks wrong.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="import-paste" className={LABEL}>
              Paste from a spreadsheet
            </label>
            <p className="mb-2 text-[13px] leading-relaxed text-ink-muted">
              One player per line, <b>columns in any order</b> — the age group, position and
              gender are recognised wherever they sit, and whatever is left is the name (a
              First and Last column pair works too). Copy straight out of Excel or Sheets; a
              header row is ignored and blank lines are skipped. Only the name is required
              when a squad is picked below. Gender accepts Male/Female, M/F or Boy/Girl.
            </p>
            {/* The commonest import is one coach, one squad, a plain list of
                names — this picker is what makes that paste valid without a
                squad column. A line naming its own squad still wins. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label htmlFor="import-default-team" className="text-[13px] font-semibold text-ink-muted">
                Squad for lines without one:
              </label>
              <select
                id="import-default-team"
                data-testid="import-default-team"
                value={defaultTeamId}
                onChange={(event) => setDefaultTeamId(event.target.value)}
                className="rounded-[9px] border-[1.5px] border-line bg-surface-card px-2 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand"
              >
                <option value="">— each line names its own —</option>
                {editableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              id="import-paste"
              data-testid="import-paste"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              spellCheck="false"
              placeholder={EXAMPLE}
              className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 font-mono text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand"
            />
          </div>

          {hasInput && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span data-testid="import-valid" className="font-bold text-ink">
                  {parsed.validCount} ready to add
                </span>
                {parsed.invalidCount > 0 && (
                  <span data-testid="import-invalid" className="font-bold text-danger-ink">
                    {parsed.invalidCount} need fixing
                  </span>
                )}
                {parsed.headerSkipped && (
                  <span className="text-ink-faint">Header row ignored</span>
                )}
              </div>

              {/* The preview is the whole safety mechanism for an
                  all-or-nothing insert: every row that will be created, and a
                  reason for every row that won't. */}
              <div className="max-h-[38vh] overflow-auto rounded-[11px] border border-line">
                <table className="w-full border-collapse" data-testid="import-preview">
                  <caption className="sr-only">
                    Preview of the players that will be added, and why any rows were rejected.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={`${CELL} border-t-0 bg-surface-sunk text-left text-[11px] uppercase tracking-[.5px] text-ink-muted`}>Line</th>
                      <th scope="col" className={`${CELL} border-t-0 bg-surface-sunk text-left text-[11px] uppercase tracking-[.5px] text-ink-muted`}>Name</th>
                      <th scope="col" className={`${CELL} border-t-0 bg-surface-sunk text-left text-[11px] uppercase tracking-[.5px] text-ink-muted`}>Position</th>
                      <th scope="col" className={`${CELL} border-t-0 bg-surface-sunk text-left text-[11px] uppercase tracking-[.5px] text-ink-muted`}>Age group</th>
                      <th scope="col" className={`${CELL} border-t-0 bg-surface-sunk text-left text-[11px] uppercase tracking-[.5px] text-ink-muted`}>Gender</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row) => (
                      <tr
                        key={row.lineNo}
                        data-testid={row.ok ? 'import-row-ok' : 'import-row-bad'}
                        className={row.ok ? '' : 'bg-danger-bg'}
                      >
                        <td className={`${CELL} tabular-nums text-ink-faint`}>{row.lineNo}</td>
                        <td className={`${CELL} font-semibold text-ink`}>
                          {row.full_name || <span className="text-ink-faint">—</span>}
                          {!row.ok && (
                            <span className="mt-0.5 block text-[12px] font-semibold text-danger-ink">
                              {row.errors.join('. ')}
                            </span>
                          )}
                        </td>
                        <td className={`${CELL} text-ink-muted`}>{row.position || '—'}</td>
                        <td className={`${CELL} text-ink-muted`}>{row.teamName || '—'}</td>
                        {/* The canonical stored value, not the pasted text —
                            so a paste of "M" previews as "Male" and the user
                            can see the mapping happened before committing to
                            a several-hundred-row insert. */}
                        <td className={`${CELL} text-ink-muted`}>{genderLabel(row.gender) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {failure && (
            <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
              {failure}
            </p>
          )}

          {/* Says what will happen, including that nothing partial can occur —
              the insert is one statement, so a refusal adds nobody. */}
          {parsed.invalidCount > 0 && parsed.validCount > 0 && (
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              Only the {parsed.validCount} valid {parsed.validCount === 1 ? 'row' : 'rows'} will be
              added. Fix the highlighted lines and paste again to add the rest.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!canSubmit} data-testid="import-submit">
              {saving
                ? 'Adding…'
                : `Add ${parsed.validCount} ${parsed.validCount === 1 ? 'player' : 'players'}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
