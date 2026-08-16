import Card from './Card.jsx'

// Filling in the RCM match sheet on a phone.
//
// ⚠️ THIS IS AN EDITOR, NOT A SECOND COPY OF THE FORM. src/screens/MatchSheet.jsx
// renders RCM's facsimile at a fixed 860px because a governing body's form has a
// shape and there is no responsive version of it. That is right for the ARTEFACT
// and wrong for the coach: 22 names typed into 40px boxes, scrolling sideways,
// standing on a pitch. So the facsimile becomes a PREVIEW below this and every
// value on it is typed here instead.
//
// ⚠️ RENDERED INSTEAD OF THE FACSIMILE'S INPUTS, NEVER ALONGSIDE THEM, and the
// switch is `useMediaQuery` rather than a `desktop:` class for the reason that
// hook's own header gives: both branches emit the SAME content, so a CSS-only
// switch leaves two of every field in the DOM. In jsdom, where no CSS applies,
// `getByLabelText('Player 1')` would then match two nodes and throw.
//
// ⚠️ THE aria-labels HERE ARE DELIBERATELY IDENTICAL TO THE FACSIMILE'S. One
// branch renders at a time, so there is never a collision — and it means the
// match-sheet suite queries the same names whichever branch it is on, instead of
// every test having to know which layout it is looking at. If you change a label
// here, change it there in the same commit.
//
// ⚠️ 16px ON EVERY TEXT INPUT AND IT IS NOT A STYLE CHOICE. iOS Safari zooms the
// page in when a focused field is under 16px, and it does not zoom back out — on
// a form of 22 fields that is 22 chances to end up stranded at 2× with the
// sideways scroll the facsimile already needs. The house field style carries the
// same size for the same reason.

/** The house field. Same shape as NamePrompt and ParentsEditor use. */
const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

/** A section heading, matching the Score card's. */
const LEGEND = 'text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted'

/**
 * @param {object} props
 * @param {Array} props.slots            the 22, as MatchSheet holds them
 * @param {(index:number,value:string)=>void} props.onName
 * @param {(index:number,patch:object)=>void} props.onSlot
 * @param {Array} props.cardRows
 * @param {(index:number,key:string)=>(e:Event)=>void} props.onCard
 * @param {object} props.fields          captain/manager/medical
 * @param {(key:string)=>(e:Event)=>void} props.onField
 */
export default function MatchSheetEntry({
  slots,
  onName,
  onSlot,
  cardRows,
  onCard,
  fields,
  onField,
}) {
  // ⚠️ COUNTED, NOT ASSUMED. A coach who has filled eight of 22 wants to know
  // that without scrolling the whole list — and "8 of 22" is the one number on
  // this screen that answers "am I finished". It is a GUIDE, never a gate: the
  // form is filled from a squad that may be short, and `saveMatchSheetSlots`
  // deliberately does not write empty rows.
  const filled = slots.filter((row) => String(row.full_name ?? '').trim() !== '').length

  return (
    <Card className="mt-3.5 p-3.5" data-testid="match-sheet-entry">
      <h3 className={LEGEND}>Fill in the sheet</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        Type here — the form below updates as you go, and it is what gets sent.
      </p>

      {/* ── Captain ────────────────────────────────────────────────────── */}
      <label className="mt-3.5 block">
        <span className="mb-1.5 block text-[13px] font-bold text-ink">Team captain</span>
        <input
          list="squad-players"
          aria-label="Team captain"
          value={fields.captain_name}
          onChange={onField('captain_name')}
          className={FIELD}
        />
      </label>

      {/* ── The 22 ─────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[13px] font-bold text-ink">Squad</h4>
          <span className="text-[12px] font-semibold text-ink-muted" data-testid="entry-filled-count">
            {filled} of {slots.length}
          </span>
        </div>
        {/* ⚠️ FR IS EXPLAINED HERE AND NOWHERE ELSE ON THIS SCREEN. On the paper
            form it is a bare two-letter column heading, which is fine for
            somebody who fills one in every week and useless to a coach doing
            their first. It is a SAFETY declaration to the referee. */}
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          Tick <strong className="text-ink">FR</strong> for anyone who can cover the front row —
          it tells the referee who may pack down there.
        </p>

        {/* ⚠️ TWO-UP ON A WIDE SCREEN, AND A `desktop:` CLASS IS THE RIGHT TOOL
            HERE where useMediaQuery was the right tool for the editor itself.
            The distinction is the one that hook's own header draws: this is the
            SAME list in the same DOM order, laid out in two columns, so nothing
            is duplicated and jsdom sees exactly one of each field. A JS switch
            would buy nothing and cost a listener and a re-render.
            ⚠️ `first:border-t-0` HAD TO GO — with two columns the thirteenth row
            starts a new column and needs its top rule as much as any other.
            Padding the list instead keeps the first row from crowding the text
            above it in either layout. */}
        <ul className="mt-2.5 desktop:grid desktop:grid-cols-2 desktop:gap-x-5">
          {slots.map((row, index) => (
            <li
              key={row.slot}
              className="flex items-center gap-2.5 border-t border-line py-2"
            >
              <span
                aria-hidden="true"
                className="w-6 shrink-0 text-right text-[13px] font-extrabold text-ink-faint"
              >
                {row.slot}
              </span>
              <input
                list="squad-players"
                aria-label={`Player ${row.slot}`}
                value={row.full_name}
                onChange={(domEvent) => onName(index, domEvent.target.value)}
                className={`${FIELD} min-w-0 flex-1`}
              />
              {/* ⚠️ THE WHOLE CHIP IS THE TARGET, not the 18px box inside it.
                  `py-3` clears the 44px floor this app uses for anything pressed
                  one-handed, standing up, possibly wet (Button's own SIZES
                  comment sets it).
                  ⚠️ `min-w-[44px]` BECAUSE HEIGHT ALONE IS NOT THE FLOOR — 44
                  applies to BOTH axes. Measured at 375px: `px-2` alone gave a
                  34×60 target, tall enough and too narrow, which is the easy
                  half of the rule to pass and the easy half to miss. */}
              <label className="flex min-w-[44px] shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-[8px] px-2 py-3 hover:bg-surface-mute">
                <input
                  type="checkbox"
                  aria-label={`Front row cover for player ${row.slot}`}
                  checked={row.front_row}
                  onChange={(domEvent) => onSlot(index, { front_row: domEvent.target.checked })}
                  className="h-[18px] w-[18px]"
                />
                <span aria-hidden="true" className="text-[10px] font-extrabold text-ink-faint">
                  FR
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Discipline ─────────────────────────────────────────────────── */}
      <div className="mt-4">
        <h4 className="text-[13px] font-bold text-ink">Cards</h4>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          Your own team only, as the form asks. Leave a row blank if there was nothing.
        </p>
        {cardRows.map((card, index) => (
          <div key={index} className="mt-2.5 rounded-[11px] border-[1.5px] border-line p-2.5">
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Half</span>
                <input
                  inputMode="numeric"
                  aria-label={`Card ${index + 1} half`}
                  value={card.half}
                  onChange={onCard(index, 'half')}
                  className={FIELD}
                />
              </label>
              {/* ⚠️ THE LABEL SAYS "time" AND THE STATE KEY IS `minute`, and they
                  must stay that way. The label matches the facsimile's (and RCM's
                  own TIME column); the key matches `match_sheet_cards.minute`.
                  Passing 'time' here writes a field nothing reads, so the value
                  is dropped silently on save — which is how this was written the
                  first time. */}
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Minute</span>
                <input
                  inputMode="numeric"
                  aria-label={`Card ${index + 1} time`}
                  value={card.minute}
                  onChange={onCard(index, 'minute')}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Card</span>
                {/* ⚠️ A SELECT, not free text: the `colour` CHECK constraint
                    accepts 'yellow' or 'red' and nothing else, so a typed "yel"
                    fails the save on a field somebody thought they had filled in
                    correctly. Same reasoning as the facsimile's own control. */}
                <select
                  aria-label={`Card ${index + 1} colour`}
                  value={card.colour}
                  onChange={onCard(index, 'colour')}
                  className={FIELD}
                >
                  <option value="">—</option>
                  <option value="yellow">Yellow</option>
                  <option value="red">Red</option>
                </select>
              </label>
            </div>
            <div className="mt-2 grid grid-cols-[70px_minmax(0,1fr)] gap-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">No.</span>
                <input
                  inputMode="numeric"
                  aria-label={`Card ${index + 1} number`}
                  value={card.slot}
                  onChange={onCard(index, 'slot')}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Full name</span>
                <input
                  list="squad-players"
                  aria-label={`Card ${index + 1} name`}
                  value={card.full_name}
                  onChange={onCard(index, 'full_name')}
                  className={FIELD}
                />
              </label>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Reason</span>
              <input
                aria-label={`Card ${index + 1} reason`}
                value={card.reason}
                onChange={onCard(index, 'reason')}
                className={FIELD}
              />
            </label>
          </div>
        ))}
      </div>

      {/* ── Medical ────────────────────────────────────────────────────── */}
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-bold text-ink">Medical issues</span>
        <span className="mb-1.5 block text-[12.5px] leading-relaxed text-ink-muted">
          Concussion and serious injury of your team, or anything else worth noting.
        </span>
        <textarea
          aria-label="Medical notes"
          rows={3}
          value={fields.medical_notes}
          onChange={onField('medical_notes')}
          className={`${FIELD} resize-none`}
        />
      </label>

      {/* ── Manager ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <h4 className="text-[13px] font-bold text-ink">Team manager / coach</h4>
        {/* ⚠️ PREFILLED FROM THE PROFILE, AND STILL EDITABLE. The person filling
            the form in is not always the person whose details RCM wants —
            MatchSheet's own prefill comment carries the reasoning. */}
        <label className="mt-2 block">
          <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Name</span>
          <input
            aria-label="Team manager"
            value={fields.manager_name}
            onChange={onField('manager_name')}
            className={FIELD}
          />
        </label>
        <label className="mt-2 block">
          <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Phone</span>
          <input
            type="tel"
            aria-label="Team manager phone"
            value={fields.manager_phone}
            onChange={onField('manager_phone')}
            className={FIELD}
          />
        </label>
      </div>
    </Card>
  )
}
