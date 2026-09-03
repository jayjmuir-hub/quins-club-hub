// Its own module, not an export of shareImage.js: five lineup suites mock that
// module with only shareElementAsImage on it, and a second export there would
// have broken every one of them for a five-line function.
// What the share sheet did, in the person's own terms (2 Sep 2026 UX review,
// Low): a desktop download and a cancelled sheet used to look identical to a
// share that went. 'downloaded' is the NORMAL desktop route — see shareImage.js.
export function shareOutcomeNote(outcome) {
  if (outcome === 'downloaded') return 'Downloaded — the picture is in your Downloads folder.'
  if (outcome === 'cancelled') return 'Share cancelled. Nothing was sent.'
  if (outcome === 'shared') return 'Shared.'
  return null
}
