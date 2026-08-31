// The profile icon beside a name (claude/plans/2026-08-31-profile-icons.md).
// A STYLED span rather than text riding the name string — Jay, 31 Aug 2026,
// off the first live crown: "the icon is not centered properly on the user
// name and could it be slightly bigger". align-middle with leading-none
// centres the glyph against the small bold name; 15px is the "slightly
// bigger" (names render at 12-13px).
export default function ProfileIcon({ emoji }) {
  if (!emoji) return null
  return (
    <span data-testid="profile-icon" className="ml-1 inline-block -translate-y-[1px] align-middle text-[15px] leading-none">
      {emoji}
    </span>
  )
}
