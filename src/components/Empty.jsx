// Shared empty state (design-system.md §4.10 .empty): a centered icon +
// muted message, used whenever a list has zero matching rows (no fixtures,
// no players, no search results). `action`, when given, renders a single
// primary button below the message — e.g. "Add a player" on an empty
// roster — so a screen doesn't have to invent its own empty-state button
// styling. Every screen's loading/empty/error contract (see the task-9
// brief) uses this for the "empty" leg.

function InboxIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12h4.5l1.5 3h6l1.5-3H21" />
      <path d="M5.5 5h13L21 12v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6L5.5 5Z" />
    </svg>
  )
}

export function Empty({ message, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-11 text-center">
      <InboxIcon className="h-[42px] w-[42px] text-[#77726e] opacity-40" aria-hidden="true" />
      <p className="text-sm text-[#77726e]">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          // Hover is --magenta (#D62A3D, design-system.md §1: "Primary
          // button hover background"), not quinsRedDark (#8E1526, which the
          // design system uses elsewhere as the darker gradient-start
          // colour, not a button hover state).
          className="rounded-[11px] bg-quinsRed px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#D62A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default Empty
