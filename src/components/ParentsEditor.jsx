import PhoneInput from './PhoneInput.jsx'
import Button from './Button.jsx'
import InviteParentButton from './InviteParentButton.jsx'
import { RELATIONSHIPS } from '../lib/relationships.js'
import { DEFAULT_COUNTRY } from '../lib/phone.js'

// The repeating parent/carer rows inside PlayerForm.
//
// STATE SHAPE: each row carries the phone split into `phoneCountry` +
// `phoneNational` rather than a joined E.164 string, because a half-typed
// number is not a valid E.164 string and re-splitting one on every keystroke
// would fight the user. PlayerForm joins them once at save time.
//
// PRESENTATIONAL ONLY — no data access, no validation gating, no saving. It
// takes rows and emits rows. PlayerForm owns the list because PlayerForm owns
// the save, and splitting those would mean two places deciding what a valid
// row is.
//
// ⚠️ ONE EXCEPTION, ADDED 17 Aug 2026, AND IT IS DELIBERATELY SELF-CONTAINED:
// InviteParentButton calls public.invite_parent itself. That action is not part
// of the form's save — it acts on the row ALREADY IN THE DATABASE, and pressing
// it is not something Save should undo, retry or be able to lose. Threading it
// out as an `onInvite` callback would have put an identical per-row state
// machine (sending / link / refusal) into BOTH PlayerForm and MyPlayerForm,
// which is precisely the shape src/lib/parentRows.js exists to stop repeating.
// The rest of this file still holds no data access, and should not grow any.
//
// "AT LEAST ONE PARENT" IS A WARNING, NEVER A BLOCK (Jay's ruling). ~159
// existing players have no parent rows, the bulk importer creates players
// with none, and a hard requirement would make every one of those records
// unsaveable — a coach fixing a typo in a name would be forced to go and find
// a parent's phone number first. So the warning states the gap and the Save
// button stays live. The database has no constraint behind this either, on
// purpose.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

export function emptyParent() {
  return {
    // ⚠️ TWO FIELDS, NOT `full_name`. One box gets one word — the same rule
    // that produced a child on the live roster with a first name and nothing
    // else. src/lib/parentRows.js rebuilds full_name on the way to the
    // database; nothing in the editor holds it.
    first_name: '',
    last_name: '',
    relationship: '',
    email: '',
    phoneCountry: DEFAULT_COUNTRY,
    phoneNational: '',
    is_primary: false,
  }
}

export default function ParentsEditor({ parents, onChange, disabled = false }) {
  function update(index, patch) {
    onChange(parents.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function add() {
    // The first parent added is the main contact by default — in the common
    // case that is exactly right, and it saves a click on almost every player.
    const isFirst = parents.length === 0
    onChange([...parents, { ...emptyParent(), is_primary: isFirst }])
  }

  function remove(index) {
    const next = parents.filter((_, i) => i !== index)
    // If the main contact was the row just removed, promote the first
    // remaining row. Leaving a household with no main contact would be a
    // silent state nobody asked for and nothing would flag.
    if (next.length > 0 && !next.some((row) => row.is_primary)) {
      next[0] = { ...next[0], is_primary: true }
    }
    onChange(next)
  }

  function setPrimary(index) {
    // Exactly one main contact: setting one clears the rest.
    onChange(parents.map((row, i) => ({ ...row, is_primary: i === index })))
  }

  return (
    <fieldset className="mb-4 border-0 p-0">
      <legend className={`${LABEL} p-0`}>Parents</legend>

      {parents.length === 0 && (
        // Advisory, not an error: role="status" rather than role="alert", and
        // the Save button stays enabled behind it.
        <p
          role="status"
          className="mb-3 rounded-[11px] bg-warn-bg px-3 py-2.5 text-sm text-ink"
        >
          No parent on file. The club should have contact details for at least one parent or
          carer — you can still save without them.
        </p>
      )}

      {parents.map((parent, index) => (
        <div
          key={parent.id ?? `new-${index}`}
          className="mb-3 rounded-[14px] border border-line bg-surface-mute p-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
              {parent.relationship || `Parent ${index + 1}`}
            </span>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={disabled}
              className="rounded-[9px] px-2 py-1 text-[13px] font-bold text-brand-deep transition hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              Remove
            </button>
          </div>

          {/* ⚠️ TWO BOXES, AND BOTH ARE REQUIRED — the rule is in
              parentNameProblem (src/lib/parentRows.js), enforced by whichever
              screen owns the save, because this component does no validation
              gating. It BLOCKS rather than warns, unlike the "no parent on
              file" note above: there is nothing to grandfather here, since
              every existing parent row has both names and these two forms are
              the only writers of the table. */}
          <div className="mb-3.5">
            <label className={LABEL} htmlFor={`parent-first-name-${index}`}>
              First name
            </label>
            <input
              id={`parent-first-name-${index}`}
              type="text"
              className={INPUT}
              value={parent.first_name ?? ''}
              disabled={disabled}
              placeholder="e.g. Sara"
              onChange={(event) => update(index, { first_name: event.target.value })}
            />
          </div>

          <div className="mb-3.5">
            <label className={LABEL} htmlFor={`parent-last-name-${index}`}>
              Family name
            </label>
            <input
              id={`parent-last-name-${index}`}
              type="text"
              className={INPUT}
              value={parent.last_name ?? ''}
              disabled={disabled}
              placeholder="e.g. Fletcher"
              onChange={(event) => update(index, { last_name: event.target.value })}
            />
          </div>

          <div className="mb-3.5">
            <label className={LABEL} htmlFor={`parent-relationship-${index}`}>
              Relationship
            </label>
            <select
              id={`parent-relationship-${index}`}
              className={INPUT}
              value={parent.relationship ?? ''}
              disabled={disabled}
              onChange={(event) => update(index, { relationship: event.target.value })}
            >
              <option value="">Not set</option>
              {RELATIONSHIPS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {/* A stored value from outside the list (legacy or imported
                  data) is offered as an option so that opening the form and
                  saving it again does not silently blank it. */}
              {parent.relationship && !RELATIONSHIPS.includes(parent.relationship) && (
                <option value={parent.relationship}>{parent.relationship}</option>
              )}
            </select>
          </div>

          <div className="mb-3.5">
            <PhoneInput
              id={`parent-phone-${index}`}
              country={parent.phoneCountry}
              national={parent.phoneNational}
              disabled={disabled}
              onCountryChange={(country) => update(index, { phoneCountry: country })}
              onNationalChange={(national) => update(index, { phoneNational: national })}
            />
          </div>

          <div className="mb-3.5">
            <label className={LABEL} htmlFor={`parent-email-${index}`}>
              Email
            </label>
            <input
              id={`parent-email-${index}`}
              type="email"
              className={INPUT}
              value={parent.email ?? ''}
              disabled={disabled}
              placeholder="e.g. sara@example.com"
              onChange={(event) => update(index, { email: event.target.value })}
            />
          </div>

          {/* Directly under the Email box, because the address IS what the
              invite is made of — see InviteParentButton for what it does when
              the box and the database disagree. */}
          <InviteParentButton parent={parent} disabled={disabled} />

          {/* A radio, not a checkbox: "main contact" is one-of-many, and a
              checkbox would let a coach tick two and leave the app to guess. */}
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="radio"
              name="parent-primary"
              checked={Boolean(parent.is_primary)}
              disabled={disabled}
              onChange={() => setPrimary(index)}
              className="h-4 w-4 accent-[color:var(--brand)]"
            />
            Main contact
          </label>
        </div>
      ))}

      <Button variant="secondary" full onClick={add} disabled={disabled}>
        Add parent
      </Button>
    </fieldset>
  )
}
