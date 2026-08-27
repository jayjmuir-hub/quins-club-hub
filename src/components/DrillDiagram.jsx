// Pitch drawing on an OPENED drill. Spec: claude/specs/2026-08-27-drill-diagrams.md
//
// Schematic only — cones, letters, arrows. Never a photo of a person, never a
// stock rugby still. List / shelf / library rows do not mount this. A null or
// blank URL renders nothing: no placeholder image.

import { safeHttpUrl } from '../lib/safeUrl.js'

export default function DrillDiagram({ url, title }) {
  const src = safeHttpUrl(url)
  if (!src) return null
  return (
    <img
      src={src}
      alt={`${title} pitch diagram`}
      data-testid="drill-diagram"
      className="mt-2 w-full rounded-[8px] border-[1.5px] border-line bg-surface-mute"
    />
  )
}
