// PersonName — any name becomes a door to the person
// (claude/plans/2026-08-26-person-card.md).
//
// The screen owns the card: `const [cardFor, setCardFor] = useState(null)`,
// one `<PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />`
// at its root, and `onOpen={setCardFor}` here.
//
// ⚠️ PLAIN TEXT IS A CONTRACT, NOT A FALLBACK. Your own name, an account
// since deleted, and the rights log's "the system" all pass profileId null
// (or your own id) and MUST render as ordinary text — a button that opens a
// card about nobody is a dead tap wearing an affordance.
//
// Player (child) names never come through here — they keep their existing
// Player Detail links, because children have no contacts in this system.
export default function PersonName({ profileId, selfId = null, onOpen, className = '', children }) {
  if (!profileId || !onOpen || profileId === selfId) {
    return <span className={className || undefined}>{children}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(profileId)}
      // The same affordance ChatBubble's author button carries. Dotted
      // underline retired 31 Aug 2026 (Jay: "do we need the giant row of
      // dots?") — the styled name is the door; desktop gets a hover
      // underline, phones never showed hover anyway.
      className={`underline-offset-2 hover:underline ${className}`.trim()}
    >
      {children}
    </button>
  )
}
