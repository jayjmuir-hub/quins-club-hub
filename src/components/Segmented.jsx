// The segmented radio row (design-system.md §4.18) — a flex row of
// equal-width options where exactly one is on.
//
// Extracted from PlayerForm.jsx on 7 Aug 2026 when the gender buttons needed
// the same control in MyPlayerForm. Two copies would have drifted: the
// checked look here is driven from React state rather than CSS `:has()`, and
// a second hand-rolled copy would sooner or later reach for `:has()` and
// diverge in a way only a browser check would catch.
//
// ⚠️ THE RADIO STAYS A REAL, FOCUSABLE INPUT. `sr-only`, never
// `display:none` — a hidden input is not focusable, so keyboard users would
// lose the control entirely and the group would drop out of the tab order.
// The visible box is a <span> styled off `peer-focus-visible`, which is what
// puts the focus ring back where the eye expects it.
//
// ⚠️ The options are <label>/<span> pairs, NOT <button>s. A button used as a
// layout box inherits Chromium's UA content-centring, which jsdom cannot see
// — so a test would pass while the real control was visibly wrong.
//
// `value` not matching any option is a legitimate state, not a bug: a player
// whose gender has never been recorded shows every option OFF. Do not
// "helpfully" default the selection — that would turn "we don't know" into a
// recorded answer the first time anyone opened the form.

const BASE =
  'block cursor-pointer select-none rounded-[11px] border-[1.5px] px-2 py-2.5 text-center text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2'
const ON = 'border-brand bg-surface-mute font-bold text-danger-ink'
const OFF = 'border-line font-semibold text-ink'

export default function Segmented({ legend, name, options, value, onChange, disabled = false, className = 'mb-3.5' }) {
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
        {legend}
      </legend>
      <div className="flex gap-2">
        {options.map((option) => (
          <label key={option.value} className="flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className={[BASE, value === option.value ? ON : OFF].join(' ')}>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
