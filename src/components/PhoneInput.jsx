import { useId, useState } from 'react'
import { COUNTRIES, dialCodeFor, isValidPhone } from '../lib/phone.js'

// A phone field: country picker (flag + dial code) beside a number box.
//
// SHAPE OF THE VALUE: this component is controlled with the two parts split
// out — `country` ('AE') and `national` ('501234567') — rather than a single
// E.164 string. Joining them is src/lib/phone.js's job (joinPhone) and the
// form does it once at save time. Threading a joined string through here
// would mean re-splitting it on every keystroke, and a half-typed number is
// not a valid E.164 string to split.
//
// FLAGS ARE SVG, NOT EMOJI. The obvious implementation is the emoji flag
// (🇦🇪) — zero dependencies, one line. It is wrong here: Windows ships no
// flag glyphs, so Chrome and Edge on Windows render 🇦🇪 as the letters "AE".
// The club's admin work happens on a Windows desktop, which is precisely
// where a "flag picker" would have shown no flags at all. flag-icons gives
// real SVGs, and because they are CSS background images the browser only
// fetches the handful actually painted.
//
// The <select> is a NATIVE select, not a custom listbox. 245 countries in a
// hand-rolled dropdown means re-implementing type-ahead, scroll-into-view,
// keyboard wrap and touch behaviour, and getting the ARIA right; the native
// control has all of that, and on a phone it opens the OS picker, which is
// the thing people already know how to use. The trade is that a native
// <option> cannot contain an image — so the flag is rendered as a separate
// element beside the select, showing the CURRENT selection, and the options
// carry name + dial code as text.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const CONTROL_BASE =
  'rounded-[11px] border-[1.5px] bg-surface-card text-[16px] text-ink outline-none transition focus:border-brand'

export default function PhoneInput({
  label = 'Phone',
  country,
  national,
  onCountryChange,
  onNationalChange,
  id,
  disabled = false,
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const countryId = `${fieldId}-country`

  const dial = dialCodeFor(country)
  // A warning, never a block (see joinPhone): an unrecognised number still
  // saves. This only tells the user their typo is probably a typo.
  // ⚠️ SHOWN AFTER THE FIELD IS LEFT, NOT ON THE FIRST DIGIT (2 Sep 2026 UX
  // review, parents, Low): a red warning used to fire while a parent was
  // still typing, on every number that was merely incomplete.
  const [left, setLeft] = useState(false)
  const looksWrong = left && !isValidPhone(country, national)

  return (
    <div>
      <label className={LABEL} htmlFor={fieldId}>
        {label}
      </label>

      <div className="flex gap-2">
        <div className="relative flex items-center">
          {/* The flag for the CURRENT selection, sitting on top of the select.
              aria-hidden because the select itself already announces the
              country by name — a screen reader should not hear it twice. */}
          <span
            className={`fi fi-${String(country ?? '').toLowerCase()} pointer-events-none absolute left-2.5 h-4 w-6 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,.08)]`}
            aria-hidden="true"
          />
          <select
            id={countryId}
            // Labelled separately from the number box: "Phone" describes the
            // pair, but a screen-reader user tabbing onto the select needs to
            // know this one picks a country.
            aria-label={`${label} country`}
            // ⚠️ text-transparent IS THE FIX, NOT A FLOURISH. `appearance-none`
            // removes the dropdown arrow but NOT the selected option's text, so
            // the control was painting its own "+971 United Arab Emirates"
            // underneath the overlay span below, which paints "+971" as well.
            // At 124px the two collided and read "+971+971" — obvious on a
            // phone, present at every width. Hiding the select's own text and
            // keeping the overlay gives the tidy "+971" the overlay was added
            // for in the first place.
            className={`${CONTROL_BASE} w-[124px] appearance-none border-line py-[11px] pl-11 pr-2 font-semibold text-transparent`}
            value={country}
            disabled={disabled}
            onChange={(event) => onCountryChange?.(event.target.value)}
          >
            {COUNTRIES.map((c) => (
              // The option text carries the dial code so the closed select
              // reads "+971" and the open list stays searchable by name —
              // typing "uni" jumps to United Arab Emirates natively.
              // ⚠️ text-ink is REQUIRED, not inherited styling. The select is
              // text-transparent to hide its collapsed value; on desktop
              // Firefox and some Chromium builds an <option> inherits the
              // select's colour, which would render all 245 countries
              // invisible in the open list. Stating it here cannot be
              // inherited away.
              <option key={c.code} value={c.code} className="text-ink">
                +{c.dial} {c.name}
              </option>
            ))}
          </select>
          {/* Shown over the select so the collapsed control reads as a tidy
              "+971" rather than the full country name, which would truncate.

              left-11 matches the select's own pl-11, so the dial code sits
              exactly where the hidden text would have started — directly after
              the flag. It was right-2.5, which put it hard against the right
              edge with a gap in the middle once the select's text was hidden. */}
          <span className="pointer-events-none absolute left-11 text-[15px] font-bold text-ink">
            {dial ? `+${dial}` : ''}
          </span>
        </div>

        <input
          id={fieldId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className={`${CONTROL_BASE} min-w-0 flex-1 px-3 py-[11px] placeholder:text-ink-faint ${
            looksWrong ? 'border-brand-deep' : 'border-line'
          }`}
          placeholder="50 123 4567"
          value={national ?? ''}
          disabled={disabled}
          onChange={(event) => onNationalChange?.(event.target.value)}
          onBlur={() => setLeft(true)}
        />
      </div>

      {looksWrong && (
        // Not role="alert": this fires while the user is still typing, and an
        // assertive live region would interrupt a screen reader on every
        // keystroke of a number that is merely incomplete.
        <p className="mt-1.5 text-[13px] font-semibold text-danger-ink">
          That doesn&apos;t look like a valid number for this country. You can still save it.
        </p>
      )}
    </div>
  )
}
