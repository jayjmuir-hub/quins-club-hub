import { useState } from 'react'
import Badge from './Badge.jsx'
import Card from './Card.jsx'
import PlayerAvatar from './PlayerAvatar.jsx'
import Button from './Button.jsx'
import { POSITIONS_BY_UNIT } from '../lib/positions.js'
import { GENDERS } from '../lib/gender.js'
import { upsertPlayer } from '../data/players.js'

// The desktop roster table (desktop-spec.md §5.1). Rendered INSTEAD of the
// mobile card list, not alongside it — see src/lib/useMediaQuery.js for why
// that switch is made in JS rather than with a `desktop:` class.
//
// Five columns are editable in place: forward-or-back, position, gender, age
// group and captain. Those are the fields that change during a season; everything else
// still goes through PlayerForm, which is where validation, contacts and the
// two-table save sequence already live. There is deliberately no jersey
// column — the club does not use squad numbers (src/lib/playerFormat.js).
//
// Gender was added here as well as to the form (7 Aug 2026) because it is the
// one field the club has to fill in for ~300 existing players from scratch,
// and doing that through a sheet that opens, saves and closes per player is
// several hundred round trips of clicking. The inline select is the bulk
// path. Note this writes via upsertPlayer, i.e. the ordinary can_edit_team
// policy — the parent self-service RPC is not involved and this table is
// never shown to a parent as editable.
//
// Access control is not enforced here. `canEditTeam` decides whether a cell
// renders as a control or as text, so a mistake can only make the UI
// read-only, never authorise a write. RLS refuses server-side and
// upsertPlayer turns "zero rows affected" into a thrown refusal, which is
// what the row error below reports.

// Not sticky: the table grows to its full height and the PAGE scrolls (no
// inner scroll container since 22 Aug 2026), so `sticky top-0` here would pin
// against the viewport and slide under AppShell's sticky masthead.
const HEAD_CELL =
  'bg-surface-sunk px-3 py-2.5 text-left text-[11.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted'
const BODY_CELL = 'border-t border-line px-3 py-2 text-[14px] text-ink align-middle'
// Inline controls are borderless until hovered/focused so a dense table does
// not read as a wall of form fields — the affordance appears when the cursor
// is on it. Focus-visible keeps that discoverable from the keyboard too.
const INLINE_CONTROL =
  'w-full rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink transition hover:border-line hover:bg-surface-card focus:border-brand focus:bg-surface-card focus-visible:outline-none disabled:cursor-not-allowed'

const UNIT_LABEL = { forward: 'Forward', back: 'Back' }

const SORTABLE = [
  { key: 'full_name', label: 'Name' },
  // Forward-or-back sits BEFORE position because it is the coarser question
  // and the one a coach can answer for a whole squad in one pass. Jay, 2 Sep
  // 2026, on a U16 roster where 30 of 37 sat under "Other": "there should be
  // a column where you can select forward or back in general without opening
  // each individual player one at a time". The player sheet was the only
  // write path until then.
  { key: 'unit', label: 'Forward / Back' },
  { key: 'position', label: 'Position' },
  { key: 'gender', label: 'Gender' },
  { key: 'team', label: 'Age group' },
  { key: 'is_captain', label: 'Captain' },
]

function compare(a, b, key, teamsById) {
  if (key === 'team') {
    const at = teamsById.get(a.team_id)
    const bt = teamsById.get(b.team_id)
    return (at?.sort_order ?? 0) - (bt?.sort_order ?? 0) ||
      (at?.name ?? '').localeCompare(bt?.name ?? '')
  }
  if (key === 'is_captain') {
    // Captains first when ascending. Booleans have no natural collation, so
    // this is stated rather than left to whatever true > false does.
    return (b.is_captain ? 1 : 0) - (a.is_captain ? 1 : 0)
  }
  // Empty positions — and empty genders, which is currently most of the club
  // — sort last in either direction rather than leading the table with a
  // block of "—", which is never what someone sorting by that column is
  // looking for. It also makes "sort by gender" the fastest way to find the
  // players still needing one: they collect at the bottom, both directions.
  const av = a[key] ?? ''
  const bv = b[key] ?? ''
  if (av === '' && bv !== '') return 1
  if (bv === '' && av !== '') return -1
  return String(av).localeCompare(String(bv))
}

// `photoUrls` is the same batch-signed map the mobile list uses, keyed by
// players.photo_path — signing per row would fire one request per player on
// every roster load. Optional: with no map the avatars fall back to monograms,
// which is what 314 of the club's 315 players show anyway today.
export default function RosterTable({
  players,
  teams,
  teamsById,
  canEditTeam,
  onSelect,
  onPatch,
  photoUrls,
  // ⚠️ ALL FOUR ARE OPTIONAL, so every existing caller and test renders exactly
  // as before. The grouped, tier-aware table is what the COACH view asks for;
  // the plain one is still correct everywhere else.
  //
  // `groups` is the nested structure from src/lib/rosterGrouping.js. When it is
  // present the table renders heading rows and IGNORES `players` for ordering —
  // the grouping rule has already sorted within each section.
  groups = null,
  // Column keys to leave out — see constantColumns(). A column whose value is
  // identical on every visible row tells the reader nothing.
  hiddenColumns = null,
  // player id -> 'A' | 'B' | 'C'. Only ever passed for a coach.
  tierByPlayer = null,
  // player id -> ['Prop', 'Hooker']. The FULL set, first is the PRIMARY.
  // Staff-only since 25 Aug 2026: passing null (what Roster does for a
  // parent) also removes the Position column entirely.
  positionsByPlayer = null,
  // async (playerId, positions) => void. The inline editor's write path —
  // player_positions replaced players.position, and the caller owns the
  // optimistic map update. Editing without it is a silent no-op, so pass it
  // whenever rows are editable and positionsByPlayer is set.
  onSavePositions = null,
  // async (playerId, unit) => void, unit 'forward' | 'back' | null. Same
  // contract as onSavePositions: player_units is the store, the caller owns
  // the optimistic unitsByPlayer map, and the column exists only when
  // positionsByPlayer is set (both are staff-only).
  onSaveUnit = null,
}) {
  const [sort, setSort] = useState({ key: 'full_name', dir: 'asc' })
  // Per-row, keyed by player id: the field currently in flight, and the last
  // refusal message. Kept here rather than in Roster because nothing outside
  // this table needs to know a cell is saving.
  const [saving, setSaving] = useState({})
  const [errors, setErrors] = useState({})

  // ⚠️ ALSO APPLIED WITHIN EACH GROUP, not just to the flat list. Grouping
  // reorders the table, so without this a chosen sort silently stopped working
  // the moment grouping went on by default — the column headers would still
  // highlight and still flip their arrow while changing nothing on screen.
  // Sorting now means "within the section", which is the only reading of it
  // that can coexist with headings.
  const bySort = (a, b) => {
    const result = compare(a, b, sort.key, teamsById)
    // Name is the tiebreaker for every other column, so equal positions or
    // equal age groups still come out in a stable, readable order.
    const tie = result === 0 && sort.key !== 'full_name'
      ? a.full_name.localeCompare(b.full_name)
      : 0
    return (sort.dir === 'asc' ? result : -result) || tie
  }

  const sorted = [...players].sort(bySort)

  function toggleSort(key) {
    setSort((prev) => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }))
  }

  // `value` is the whole ordered positions list when field is 'position'
  // (first = main), and a scalar for everything else.
  async function save(player, field, value) {
    // No write when nothing changed. Blurring a select the user only opened
    // and closed should cost nothing, and an UPDATE that sets a column to its
    // current value still bumps the row and still has to clear RLS. Position
    // callers below only call with a genuinely different list.
    if (field !== 'position' && player[field] === value) return

    const previous = player[field]
    setErrors((e) => ({ ...e, [player.id]: null }))
    setSaving((s) => ({ ...s, [player.id]: field }))
    // Optimistic: the cell shows the new value immediately, and is put back
    // if the write is refused. Position's optimism lives in the CALLER's
    // positionsByPlayer map instead (25 Aug 2026): the row's position is
    // decorated from that map, so an onPatch here would be overwritten on
    // the very next render.
    const decorated = field === 'position' || field === 'unit'
    if (!decorated) onPatch(player.id, { [field]: value })

    try {
      if (field === 'unit') {
        await onSaveUnit?.(player.id, value)
      } else if (field === 'position') {
        // The whole ordered list, first = main. players.position is nulled
        // and staff-only — player_positions is the only store now.
        await onSavePositions?.(player.id, value)
      } else {
        await upsertPlayer({ id: player.id, [field]: value })
      }
    } catch (err) {
      if (!decorated) onPatch(player.id, { [field]: previous })
      setErrors((e) => ({
        ...e,
        [player.id]: err?.message || "We couldn't save that change.",
      }))
    } finally {
      setSaving((s) => ({ ...s, [player.id]: null }))
    }
  }

  // ⚠️ THE COLUMNS ARE DERIVED, NOT FIXED. Jay, 14 Aug 2026, on the U16B coach
  // view: the Gender column repeated "Male" four times and the Age group column
  // repeated "U16B Contact" four times. Both are the same fault — a column whose
  // value never varies carries no information — so the caller passes which ones
  // are constant rather than this file special-casing two of them by name.
  // ⚠️ THE POSITION COLUMN EXISTS ONLY WHEN THE CALLER PASSED THE POSITIONS
  // MAP — which Roster does for staff and never for a parent (staff-only
  // since 25 Aug 2026). A parent's rows carry no position at all, and a
  // column of "Not set" would state a gap they are not allowed to see filled.
  const show = (key) =>
    !hiddenColumns?.has(key) &&
    ((key !== 'position' && key !== 'unit') || positionsByPlayer != null)
  const columns = SORTABLE.filter((column) => show(column.key))
  // Every column a heading row has to stretch across: the visible ones, the
  // optional Tier column, and the Open column.
  const span = columns.length + (tierByPlayer ? 1 : 0) + 1

  // Every position, in order — the first is the main one. ⚠️ ALL OF THEM
  // RENDER AS EQUAL CHIPS since 2 Sep 2026 (Jay: "when selecting multiple
  // positions, they should all show the same rank"), with the main one marked
  // rather than promoted into a select with the rest as an afterthought
  // underneath. Clicking a chip makes it the main; the × removes it; the
  // "+ Add" select appends one. Same store, same order rule as before.
  const positionsOf = (player) => positionsByPlayer?.get(player.id) ?? []
  // The add-select offers the player's own unit's positions when the unit is
  // set — a "back" is not offered Prop, the same rule PlayerForm applies —
  // and both groups when it is not.
  const addable = (player) => {
    const have = new Set(positionsOf(player))
    const offer = (list) => list.filter((p) => p !== 'Utility' && !have.has(p))
    return {
      forward: !player.unit || player.unit === 'forward' ? offer(POSITIONS_BY_UNIT.forward) : [],
      back: !player.unit || player.unit === 'back' ? offer(POSITIONS_BY_UNIT.back) : [],
      utility: !have.has('Utility'),
    }
  }

  // ⚠️ FLATTENED TO A SINGLE LIST OF ROWS, each either a heading or a player, so
  // the tbody keeps ONE map instead of three nested ones. Group headings and
  // section headings are different rows because they are different levels: Jay
  // chose the nested shape ("option A") over a flat one with a chip.
  const rows = []
  if (groups) {
    for (const group of groups) {
      rows.push({ kind: 'group', key: `g-${group.key}`, label: group.label, count: group.count })
      for (const section of group.sections) {
        // A null label is a single-level grouping — see rosterGrouping.js. It
        // renders no sub-heading rather than an empty one.
        if (section.label) {
          rows.push({ kind: 'section', key: `s-${group.key}-${section.key}`, label: section.label })
        }
        for (const player of [...section.players].sort(bySort)) {
          rows.push({ kind: 'player', key: player.id, player })
        }
      }
    }
  } else {
    for (const player of sorted) rows.push({ kind: 'player', key: player.id, player })
  }

  return (
    <Card className="overflow-hidden">
      {/* No max-height: the full roster renders and the page scrolls. The
          70vh inner scroller was removed 22 Aug 2026 — a scrollbar inside a
          scrollbar on desktop, and it hid most of the squad. overflow-x-auto
          stays as the escape hatch for a window too narrow for the columns. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="roster-table">
          <caption className="sr-only">
            Club roster. Forward or back, position, gender, age group and captain can be changed in place.
          </caption>
          <thead>
            <tr>
              {columns.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  className={HEAD_CELL}
                  aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="flex items-center gap-1 font-extrabold uppercase tracking-[.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {label}
                    <span aria-hidden="true" className="text-[9px]">
                      {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
              {tierByPlayer && (
                <th scope="col" className={HEAD_CELL}>Tier</th>
              )}
              <th scope="col" className={`${HEAD_CELL} w-px whitespace-nowrap`}>
                <span className="sr-only">Open player</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              if (row.kind === 'group') {
                return (
                  <tr key={row.key}>
                    {/* A heading row inside ONE table, rather than a table per
                        group: separate tables would let the columns drift out of
                        alignment between groups, which is the thing a table is
                        for. */}
                    <th
                      colSpan={span}
                      scope="colgroup"
                      className="border-t border-line bg-surface-sunk px-3 py-1.5 text-left text-[12px] font-extrabold uppercase tracking-[.5px] text-ink"
                    >
                      {row.label}
                      <span className="ml-2 font-bold text-ink-muted">{row.count}</span>
                    </th>
                  </tr>
                )
              }

              if (row.kind === 'section') {
                return (
                  <tr key={row.key}>
                    <th
                      colSpan={span}
                      scope="colgroup"
                      className="border-t border-line px-3 py-1 pl-6 text-left text-[11px] font-bold uppercase tracking-[.5px] text-ink-muted"
                    >
                      {row.label}
                    </th>
                  </tr>
                )
              }

              const player = row.player
              const editable = canEditTeam(player.team_id)
              const busy = saving[player.id]
              const error = errors[player.id]

              return (
                <tr key={player.id} data-testid="roster-table-row" className="hover:bg-surface-mute">
                  <td className={`${BODY_CELL} font-bold`}>
                    {/* The name opens the player. Before this, the ONLY way in
                        was the "Open" button in the last column — roughly 950px
                        to the right of the name being aimed at, which is a long
                        way to travel to act on the thing you are already
                        pointing at.

                        ⚠️ The NAME is the button, not the row. Three cells in
                        this row contain their own controls (two selects and the
                        captain toggle); a row-level click handler would fire
                        when someone changes a player's age group, and open a
                        detail panel on top of the edit they just made. */}
                    <button
                      type="button"
                      onClick={() => onSelect(player.id)}
                      className="flex items-center gap-2.5 rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {/* aria-hidden inside PlayerAvatar: the monogram restates
                          the name sitting right beside it. The gradient is
                          passed in because the component's own background is
                          bg-white/20 — designed for the dark mobile row, and
                          all but invisible on a white table cell. */}
                      <PlayerAvatar
                        player={player}
                        url={player.photo_path ? photoUrls?.[player.photo_path] : undefined}
                        size="xs"
                        className="bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-white"
                      />
                      <span
                        data-testid="table-player-name"
                        className="underline-offset-[3px] hover:underline"
                      >
                        {player.full_name}
                      </span>
                    </button>
                    {/* The refusal lands in the row that caused it, not in a
                        toast that scrolls away from a long table. */}
                    {error && (
                      <span role="alert" className="mt-0.5 block text-[12px] font-semibold text-danger-ink">
                        {error}
                      </span>
                    )}
                  </td>

                  {show('unit') && (
                  <td className={BODY_CELL}>
                    {editable ? (
                      <select
                        className={INLINE_CONTROL}
                        aria-label={`Forward or back for ${player.full_name}`}
                        value={player.unit ?? ''}
                        disabled={busy === 'unit'}
                        // '' back to null: setPlayerUnit deletes the row for a
                        // falsy unit, so "Not set" is the absence of a row.
                        onChange={(event) => save(player, 'unit', event.target.value || null)}
                      >
                        <option value="">Not set</option>
                        <option value="forward">Forward</option>
                        <option value="back">Back</option>
                      </select>
                    ) : (
                      <span className="px-2 text-ink-muted">
                        {UNIT_LABEL[player.unit] ?? 'Not set'}
                      </span>
                    )}
                  </td>
                  )}

                  {show('position') && (
                  <td className={BODY_CELL}>
                    <div className="flex flex-wrap items-center gap-1 px-2">
                      {positionsOf(player).map((name, index) => {
                        const main = index === 0
                        const list = positionsOf(player)
                        return (
                          <span
                            key={name}
                            data-testid="position-chip"
                            data-main={main ? 'true' : 'false'}
                            className={[
                              'inline-flex items-center rounded-[100px] border px-2 py-px text-[12px] font-bold',
                              main
                                ? 'border-brand bg-surface-mute text-danger-ink'
                                : 'border-line bg-surface-sunk text-ink-muted',
                            ].join(' ')}
                          >
                            {editable ? (
                              <button
                                type="button"
                                aria-pressed={main}
                                aria-label={main
                                  ? `${name}, main position for ${player.full_name}`
                                  : `Make ${name} the main position for ${player.full_name}`}
                                title={main ? 'Main position' : 'Make this the main position'}
                                disabled={busy === 'position'}
                                onClick={() => {
                                  if (main) return
                                  save(player, 'position', [name, ...list.filter((p) => p !== name)])
                                }}
                                className="rounded-[100px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                              >
                                {main && <span aria-hidden="true">★ </span>}{name}
                              </button>
                            ) : (
                              <span>{main && <span aria-hidden="true">★ </span>}{name}</span>
                            )}
                            {editable && (
                              <button
                                type="button"
                                aria-label={`Remove ${name} from ${player.full_name}`}
                                disabled={busy === 'position'}
                                onClick={() => save(player, 'position', list.filter((p) => p !== name))}
                                className="ml-1 rounded-[100px] px-0.5 leading-none text-ink-faint hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            )}
                          </span>
                        )
                      })}
                      {editable ? (
                        <select
                          className={`${INLINE_CONTROL} w-auto`}
                          aria-label={`Add a position for ${player.full_name}`}
                          value=""
                          disabled={busy === 'position'}
                          onChange={(event) => {
                            const name = event.target.value
                            if (name) save(player, 'position', [...positionsOf(player), name])
                          }}
                        >
                          <option value="">{positionsOf(player).length ? '+ Add' : 'Not set'}</option>
                          {addable(player).forward.length > 0 && (
                            <optgroup label="Forwards">
                              {addable(player).forward.map((p) => <option key={p} value={p}>{p}</option>)}
                            </optgroup>
                          )}
                          {addable(player).back.length > 0 && (
                            <optgroup label="Backs">
                              {addable(player).back.map((p) => <option key={p} value={p}>{p}</option>)}
                            </optgroup>
                          )}
                          {/* Utility sits under both units, so it groups under
                              neither here. */}
                          {addable(player).utility && <option value="Utility">Utility</option>}
                        </select>
                      ) : (
                        positionsOf(player).length === 0 && <span className="text-ink-muted">Not set</span>
                      )}
                    </div>
                  </td>
                  )}

                  {show('gender') && (
                  <td className={BODY_CELL}>
                    {editable ? (
                      <select
                        className={INLINE_CONTROL}
                        aria-label={`Gender for ${player.full_name}`}
                        value={player.gender ?? ''}
                        disabled={busy === 'gender'}
                        // '' back to null, not ''. players_gender_check
                        // refuses the empty string outright, so sending it
                        // would be a constraint violation rather than a
                        // clear. Unlike PlayerForm's two buttons, this
                        // control CAN return a player to not-recorded —
                        // which is the undo path for a mis-click during the
                        // ~300-player backfill this column exists for.
                        onChange={(event) => save(player, 'gender', event.target.value || null)}
                      >
                        <option value="">Not set</option>
                        {GENDERS.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 text-ink-muted">
                        {GENDERS.find((g) => g.value === player.gender)?.label ?? 'Not set'}
                      </span>
                    )}
                  </td>
                  )}

                  {show('team') && (
                  <td className={BODY_CELL}>
                    {editable ? (
                      <select
                        className={INLINE_CONTROL}
                        aria-label={`Age group for ${player.full_name}`}
                        value={player.team_id ?? ''}
                        disabled={busy === 'team_id'}
                        onChange={(event) => save(player, 'team_id', event.target.value)}
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 text-ink-muted">
                        {teamsById.get(player.team_id)?.name ?? 'No age group'}
                      </span>
                    )}
                  </td>
                  )}

                  <td className={BODY_CELL}>
                    {editable ? (
                      <button
                        type="button"
                        aria-pressed={Boolean(player.is_captain)}
                        aria-label={`Captain: ${player.full_name}`}
                        disabled={busy === 'is_captain'}
                        onClick={() => save(player, 'is_captain', !player.is_captain)}
                        className="rounded-[100px] px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                      >
                        {player.is_captain
                          ? <Badge tone="captain">Capt</Badge>
                          : <span className="px-2 text-[13px] text-ink-faint">—</span>}
                      </button>
                    ) : (
                      player.is_captain
                        ? <Badge tone="captain">Capt</Badge>
                        : <span className="px-2 text-ink-faint">—</span>
                    )}
                  </td>

                  {tierByPlayer && (
                    <td className={BODY_CELL}>
                      {tierByPlayer.get(player.id)
                        ? <Badge tone="neutral">{tierByPlayer.get(player.id)}</Badge>
                        : <span className="px-2 text-ink-faint">—</span>}
                    </td>
                  )}

                  <td className={`${BODY_CELL} text-right`}>
                    <Button variant="ghost" size="sm" onClick={() => onSelect(player.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
