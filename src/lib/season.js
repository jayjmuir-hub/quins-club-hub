//
// The season a date belongs to, as the label the league import uses
// ('2026-27'). ⚠️ NOT A SECOND COPY OF THE CUT-OFF: the month and day come from
// ageGrade.js, where the club's 31 August rule already lives, and the zone is
// CLUB_TIME_ZONE. The database function senior_season_stats applies the same
// window in SQL; if either side changes, db/tests/season-stats.sql and
// tests/season-label.test.js both carry the 31 Aug 23:30 / 1 Sep 00:30 pair.
import { CUTOFF_MONTH, CUTOFF_DAY } from './ageGrade.js'
import { CLUB_TIME_ZONE } from './eventFormat.js'

/** Year, month (1-12) and day of `date` in the club's zone. */
function clubParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** '2026-27' for any date from 1 Sep 2026 to 31 Aug 2027, club time. */
export function seasonLabelFor(date = new Date()) {
  const { year, month, day } = clubParts(date)
  const afterCutoff = month > CUTOFF_MONTH || (month === CUTOFF_MONTH && day > CUTOFF_DAY)
  const start = afterCutoff ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
