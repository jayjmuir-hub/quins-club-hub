// Shared loading indicator. Not present as a distinct component in the
// prototype (design-system.md has no `.spinner` entry — the prototype never
// shows a loading state at all, since localStorage reads are synchronous);
// this is new for the Supabase-backed app, where every screen's
// loading/empty/error contract (task-9 brief) needs a real "loading" leg.
// `role="status"` gives it an implicit aria-live polite region; `aria-label`
// supplies the accessible name directly, since `status` does not compute its
// name from visible content per the ARIA spec (a visually-hidden child span
// alone is not announced as the name). The spin animation is disabled under
// prefers-reduced-motion.

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={['inline-flex items-center gap-2', className].filter(Boolean).join(' ')}
    >
      <svg
        className="h-5 w-5 animate-spin text-brand-ink motion-reduce:animate-none"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default Spinner
