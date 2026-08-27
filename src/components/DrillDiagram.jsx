// Pitch drawing on an OPENED drill. Spec: claude/specs/2026-08-27-drill-diagrams.md
//
// Schematic only — cones, letters, arrows. Never a photo of a person, never a
// stock rugby still. List / shelf / library rows do not mount this. A null or
// blank URL renders nothing: no placeholder image.

export default function DrillDiagram({ url, title }) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={`${title} pitch diagram`}
      data-testid="drill-diagram"
      className="mt-2 w-full rounded-[8px] border-[1.5px] border-line bg-surface-mute"
    />
  )
}
